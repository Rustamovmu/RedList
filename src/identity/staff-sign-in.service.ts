import { Injectable, UnauthorizedException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { audit } from '../common/audit';
import { clearCookie, readCookie, setCookie } from '../common/cookies';
import { cookieNames, loadConfig } from '../config';
import { Db, InjectDb } from '../db/db.module';
import { staffUsers } from '../db/schema';
import { DEVICE_MAX_AGE_MS, DeviceService } from './device.service';
import { LoginThrottle, throwIfLimited } from './login-throttle';
import { verifyPassword } from './password';
import { SESSION_ABSOLUTE_MS, SessionService } from './session.service';

export type StaffUserRow = typeof staffUsers.$inferSelect;

/**
 * Staff sign-in, shared by `POST /staff/auth/login` and the sign-in form for everyone (`POST /auth/sign-in`, D-066).
 * Rate limited per IP and locked out with backoff per email after repeated failures. A browser that signed in
 * successfully before carries a device cookie and is not affected by the email lockout (D-061).
 */
@Injectable()
export class StaffSignInService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly sessions: SessionService,
    private readonly throttle: LoginThrottle,
    private readonly devices: DeviceService,
  ) {}

  /** The staff account with this email (any case), enabled or not. */
  async find(email: string): Promise<StaffUserRow | undefined> {
    const [user] = await this.db.select().from(staffUsers).where(eq(sql`lower(${staffUsers.email})`, email.toLowerCase())).limit(1);
    return user;
  }

  /** `user` is the staff account for `email`, or undefined: the attempt is then checked and counted all the same. */
  async signIn(user: StaffUserRow | undefined, email: string, password: string, req: Request, res: Response) {
    const names = cookieNames(loadConfig().COOKIE_SECURE);
    const deviceId = user ? await this.devices.find(user.id, readCookie(req, names.device)) : null;
    throwIfLimited(res, this.throttle.check(req.ip ?? 'unknown', email, deviceId));

    const ok = await verifyPassword(user && !user.disabledAt ? user.passwordHash : null, password);
    if (!ok || !user) {
      this.throttle.recordFailure(email, deviceId);
      throw new UnauthorizedException('Email or password is incorrect');
    }
    this.throttle.recordSuccess(email, deviceId);

    const session = await this.startSession(req, res, user.id, deviceId);
    await audit(this.db, { actorId: user.id, action: 'staff.login', entityType: 'staff_user', entityId: user.id, summary: 'Signed in' });
    return { user, csrfToken: session.csrfToken };
  }

  /** New session + CSRF cookies, and a rotated device cookie (D-061). */
  async startSession(req: Request, res: Response, userId: string, deviceId: string | null) {
    const { COOKIE_SECURE } = loadConfig();
    const names = cookieNames(COOKIE_SECURE);
    const session = await this.sessions.create(userId, req.header('user-agent'));
    const maxAge = Math.floor(SESSION_ABSOLUTE_MS / 1000);
    setCookie(res, names.session, session.token, { httpOnly: true, secure: COOKIE_SECURE, maxAgeSeconds: maxAge });
    setCookie(res, names.csrf, session.csrfToken, { httpOnly: false, secure: COOKIE_SECURE, maxAgeSeconds: maxAge });
    this.setDeviceCookie(res, await this.devices.issue(userId, deviceId));
    return session;
  }

  /** Kept on logout: it only records that this browser once signed in. */
  setDeviceCookie(res: Response, token: string) {
    const { COOKIE_SECURE } = loadConfig();
    setCookie(res, cookieNames(COOKIE_SECURE).device, token, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: 'Strict',
      maxAgeSeconds: Math.floor(DEVICE_MAX_AGE_MS / 1000),
    });
  }

  /**
   * Ends the staff session this browser carries, if any, and clears its cookies. Used when a visitor account signs
   * in here: one browser holds one identity (D-066). The device cookie stays, as on a normal sign-out.
   */
  async endBrowserSession(req: Request, res: Response) {
    const { COOKIE_SECURE } = loadConfig();
    const names = cookieNames(COOKIE_SECURE);
    const token = readCookie(req, names.session);
    if (!token) return;
    const staff = await this.sessions.resolve(token);
    if (staff) {
      await this.sessions.revoke(staff.sessionId);
      await audit(this.db, { actorId: staff.id, action: 'staff.logout', entityType: 'staff_user', entityId: staff.id, summary: 'Signed out by a visitor sign-in in the same browser' });
    }
    clearCookie(res, names.session, COOKIE_SECURE);
    clearCookie(res, names.csrf, COOKIE_SECURE);
  }
}
