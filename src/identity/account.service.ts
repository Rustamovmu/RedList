import { ConflictException, Injectable, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { clearCookie, readCookie, setCookie } from '../common/cookies';
import { cookieNames, loadConfig } from '../config';
import { Db, InjectDb } from '../db/db.module';
import { publicUsers, staffUsers } from '../db/schema';
import { ACCOUNT_SESSION_ABSOLUTE_MS, AccountPrincipal, AccountSessionService } from './account-session.service';
import { LoginThrottle, throwIfLimited } from './login-throttle';
import { hashPassword, passwordPolicyError, verifyPassword } from './password';
import { StaffSignInService } from './staff-sign-in.service';

export type VisitorRow = typeof publicUsers.$inferSelect;

const EMAIL_TAKEN = { code: 'EMAIL_TAKEN', message: 'An account with this email already exists' };
const WRONG_PASSWORD = { code: 'WRONG_PASSWORD', message: 'Your password is incorrect' };

const normalize = (email: string) => email.trim().toLowerCase();

/**
 * Visitor accounts (owner request, D-066): sign up, sign in, change the password, delete the account. R1 sends no
 * email, so addresses are not verified and there is no reset by email. Sign-in shares LoginThrottle with staff:
 * the same per-IP budget, and the same per-email lockout (an email is staff or visitor, never both). Visitors get
 * no device cookies.
 */
@Injectable()
export class AccountService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly sessions: AccountSessionService,
    private readonly throttle: LoginThrottle,
    private readonly staff: StaffSignInService,
  ) {}

  async signUp(input: { name: string; email: string; password: string }, req: Request, res: Response): Promise<{ user: VisitorRow; csrfToken: string }> {
    throwIfLimited(res, this.throttle.checkIp(req.ip ?? 'unknown'));
    const name = input.name.trim();
    if (!name) throw new UnprocessableEntityException({ code: 'NAME_REQUIRED', message: 'Enter your name' });
    const weak = passwordPolicyError(input.password);
    if (weak) throw new UnprocessableEntityException({ code: 'WEAK_PASSWORD', message: weak });
    const email = normalize(input.email);

    // The same answer for a staff address and a visitor address. The trigger in 0008 backs this up under races.
    const [staffTaken] = await this.db.select({ id: staffUsers.id }).from(staffUsers).where(eq(sql`lower(${staffUsers.email})`, email)).limit(1);
    const [visitorTaken] = await this.db.select({ id: publicUsers.id }).from(publicUsers).where(eq(publicUsers.email, email)).limit(1);
    if (staffTaken || visitorTaken) throw new ConflictException(EMAIL_TAKEN);

    const passwordHash = await hashPassword(input.password);
    let user: VisitorRow;
    try {
      [user] = await this.db.insert(publicUsers).values({ email, name, passwordHash }).returning();
    } catch (e) {
      if ((e as { code?: unknown; cause?: { code?: unknown } }).code === '23505' || (e as { cause?: { code?: unknown } }).cause?.code === '23505') {
        throw new ConflictException(EMAIL_TAKEN);
      }
      throw e;
    }
    await this.staff.endBrowserSession(req, res);
    await this.endBrowserSession(req, res, false);
    const { csrfToken } = await this.startSession(res, user.id);
    return { user, csrfToken };
  }

  /** `email` is not a staff address (the caller checked). */
  async signIn(email: string, password: string, req: Request, res: Response): Promise<{ user: VisitorRow; csrfToken: string }> {
    throwIfLimited(res, this.throttle.check(req.ip ?? 'unknown', email));
    const [user] = await this.db.select().from(publicUsers).where(eq(publicUsers.email, normalize(email))).limit(1);
    if (!(await verifyPassword(user?.passwordHash ?? null, password)) || !user) {
      this.throttle.recordFailure(email);
      throw new UnauthorizedException('Email or password is incorrect');
    }
    this.throttle.recordSuccess(email);
    await this.staff.endBrowserSession(req, res);
    await this.endBrowserSession(req, res, false);
    const { csrfToken } = await this.startSession(res, user.id);
    return { user, csrfToken };
  }

  /** Other sessions of the account end; this browser stays signed in. */
  async changePassword(account: AccountPrincipal, current: string, next: string, req: Request, res: Response): Promise<void> {
    await this.confirmPassword(account, current, req, res);
    if (next === current) throw new UnprocessableEntityException({ code: 'SAME_PASSWORD', message: 'Choose a password different from the current one' });
    const weak = passwordPolicyError(next);
    if (weak) throw new UnprocessableEntityException({ code: 'WEAK_PASSWORD', message: weak });
    await this.db.update(publicUsers).set({ passwordHash: await hashPassword(next) }).where(eq(publicUsers.id, account.id));
    await this.sessions.removeOthers(account.id, account.sessionId);
  }

  /** Deletes the account and every session of it at once (the sessions cascade), and clears this browser's cookies. */
  async deleteAccount(account: AccountPrincipal, password: string, req: Request, res: Response): Promise<void> {
    await this.confirmPassword(account, password, req, res);
    await this.db.delete(publicUsers).where(eq(publicUsers.id, account.id));
    this.clearCookies(res);
  }

  async signOut(account: AccountPrincipal, res: Response): Promise<void> {
    await this.sessions.remove(account.sessionId);
    this.clearCookies(res);
  }

  /**
   * Ends the visitor session this browser carries, if any. Used when someone else signs in or signs up here: one
   * browser holds one identity. `clear` is false when new visitor cookies are about to replace these.
   */
  async endBrowserSession(req: Request, res: Response, clear = true): Promise<void> {
    const token = readCookie(req, cookieNames(loadConfig().COOKIE_SECURE).account);
    if (!token) return;
    const account = await this.sessions.resolve(token);
    if (account) await this.sessions.remove(account.sessionId);
    if (clear) this.clearCookies(res);
  }

  /** Re-checks the password before a change; wrong passwords count towards the same lockout as sign-in. */
  private async confirmPassword(account: AccountPrincipal, password: string, req: Request, res: Response): Promise<void> {
    throwIfLimited(res, this.throttle.check(req.ip ?? 'unknown', account.email));
    const [row] = await this.db.select({ hash: publicUsers.passwordHash }).from(publicUsers).where(eq(publicUsers.id, account.id)).limit(1);
    if (!(await verifyPassword(row?.hash ?? null, password))) {
      this.throttle.recordFailure(account.email);
      throw new UnprocessableEntityException(WRONG_PASSWORD);
    }
    this.throttle.recordSuccess(account.email);
  }

  private async startSession(res: Response, userId: string) {
    const { COOKIE_SECURE } = loadConfig();
    const names = cookieNames(COOKIE_SECURE);
    const session = await this.sessions.create(userId);
    const maxAge = Math.floor(ACCOUNT_SESSION_ABSOLUTE_MS / 1000);
    setCookie(res, names.account, session.token, { httpOnly: true, secure: COOKIE_SECURE, maxAgeSeconds: maxAge });
    setCookie(res, names.accountCsrf, session.csrfToken, { httpOnly: false, secure: COOKIE_SECURE, maxAgeSeconds: maxAge });
    return session;
  }

  private clearCookies(res: Response) {
    const { COOKIE_SECURE } = loadConfig();
    const names = cookieNames(COOKIE_SECURE);
    clearCookie(res, names.account, COOKIE_SECURE);
    clearCookie(res, names.accountCsrf, COOKIE_SECURE);
  }
}
