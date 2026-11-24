import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { audit } from '../common/audit';
import { loadConfig } from '../config';
import { Db, InjectDb, Tx } from '../db/db.module';
import { staffSessions, staffTokens, staffUsers } from '../db/schema';
import { DeviceService } from './device.service';
import { hashPassword, passwordPolicyError } from './password';
import { hashToken, SessionService, StaffPrincipal } from './session.service';

type Role = 'editor' | 'admin';
export type StaffStatus = 'active' | 'invited' | 'disabled';
export type StaffUserView = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: StaffStatus;
  createdAt: string;
  lastActiveAt: string | null;
  openSessions: number;
};
export type StaffLinkView = { purpose: 'invite' | 'reset'; url: string; expiresAt: string };

export const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;
export const RESET_TTL_MS = 24 * 60 * 60_000;

const LINK_INVALID = { code: 'LINK_INVALID', message: 'This link is not valid any more. Ask an admin for a new one.' };

/**
 * Staff accounts (PLAN §7 "Staff accounts in R1", DECISIONS D-062). Admins invite people and hand out password
 * links themselves: R1 sends no email. A link is a one-time random token, stored only as its SHA-256, shown to
 * the admin once, and put in the URL fragment so it never reaches a server log.
 *
 * An admin cannot change their own role or disable themselves, so the acting admin always stays an active
 * admin and the site can never be left without one.
 */
@Injectable()
export class StaffUsersService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly sessions: SessionService,
    private readonly devices: DeviceService,
  ) {}

  /** Active and invited accounts first, then disabled ones; by name. */
  list(): Promise<StaffUserView[]> {
    return this.query();
  }

  async get(id: string): Promise<StaffUserView> {
    const [user] = await this.query(id);
    if (!user) throw new NotFoundException('Staff member not found');
    return user;
  }

  /** Accounts with their last activity and open sessions. Only timestamps and a count leave the sessions table. */
  private async query(id?: string): Promise<StaffUserView[]> {
    const activity = this.db
      .select({
        userId: staffSessions.userId,
        lastActiveAt: sql<Date | string | null>`max(${staffSessions.lastSeenAt})`.as('last_active_at'),
        openSessions: sql<number>`count(*) filter (where ${staffSessions.revokedAt} is null and ${staffSessions.expiresAt} > now())`
          .mapWith(Number)
          .as('open_sessions'),
      })
      .from(staffSessions)
      .groupBy(staffSessions.userId)
      .as('activity');
    const rows = await this.db
      .select({ user: staffUsers, lastActiveAt: activity.lastActiveAt, openSessions: activity.openSessions })
      .from(staffUsers)
      .leftJoin(activity, eq(activity.userId, staffUsers.id))
      .where(id ? eq(staffUsers.id, id) : undefined)
      .orderBy(sql`${staffUsers.disabledAt} is not null`, asc(sql`lower(${staffUsers.name})`));
    return rows.map((r) => view(r.user, r.lastActiveAt, r.openSessions ?? 0));
  }

  /** Creates an account without a password and returns its invite link, shown once. */
  async invite(actor: StaffPrincipal, input: { email: string; name: string; role: Role }): Promise<{ user: StaffUserView; link: StaffLinkView }> {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    if (!name) throw new BadRequestException({ code: 'VALIDATION', message: 'Name is required' });
    return this.db.transaction(async (tx) => {
      const [taken] = await tx.select({ id: staffUsers.id }).from(staffUsers).where(eq(sql`lower(${staffUsers.email})`, email)).limit(1);
      if (taken) throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'A staff member with this email already exists' });
      const [user] = await tx.insert(staffUsers).values({ email, name, role: input.role, passwordHash: null }).returning();
      const link = await this.issueLink(tx, user.id, 'invite');
      await audit(tx, { actorId: actor.id, action: 'staff.invite', entityType: 'staff_user', entityId: user.id, summary: `Invited a new ${input.role}` });
      return { user: view(user, null, 0), link };
    });
  }

  /**
   * A new one-time link: an invite if the account has no password yet, otherwise a password reset.
   * Any earlier unused link of the same account stops working. `actorId` is null when run from the server CLI.
   */
  async newLink(actorId: string | null, id: string): Promise<StaffLinkView> {
    return this.db.transaction(async (tx) => {
      const user = await lockUser(tx, id);
      if (user.disabledAt) throw new ConflictException({ code: 'DISABLED', message: 'Enable the account before making a link for it' });
      const purpose = user.passwordHash ? 'reset' : 'invite';
      const link = await this.issueLink(tx, id, purpose);
      await audit(tx, {
        actorId, action: 'staff.link', entityType: 'staff_user', entityId: id,
        summary: `${purpose === 'invite' ? 'Made a new invite link' : 'Made a password reset link'}${actorId ? '' : ' (server CLI)'}`,
      });
      return link;
    });
  }

  async update(actor: StaffPrincipal, id: string, input: { role?: Role; disabled?: boolean }): Promise<StaffUserView> {
    if (id === actor.id && (input.role !== undefined || input.disabled !== undefined)) {
      throw new UnprocessableEntityException({ code: 'SELF', message: 'You cannot change your own role or disable your own account. Ask another admin.' });
    }
    await this.db.transaction(async (tx) => {
      const user = await lockUser(tx, id);
      if (input.role !== undefined && input.role !== user.role) {
        await tx.update(staffUsers).set({ role: input.role }).where(eq(staffUsers.id, id));
        await audit(tx, { actorId: actor.id, action: 'staff.role', entityType: 'staff_user', entityId: id, summary: `Role changed to ${input.role}` });
      }
      if (input.disabled === true && !user.disabledAt) {
        await tx.update(staffUsers).set({ disabledAt: new Date() }).where(eq(staffUsers.id, id));
        await this.cutAccess(tx, id);
        await audit(tx, { actorId: actor.id, action: 'staff.disable', entityType: 'staff_user', entityId: id, summary: 'Disabled; sessions, devices and links ended' });
      }
      if (input.disabled === false && user.disabledAt) {
        await tx.update(staffUsers).set({ disabledAt: null }).where(eq(staffUsers.id, id));
        await audit(tx, { actorId: actor.id, action: 'staff.enable', entityType: 'staff_user', entityId: id, summary: 'Enabled' });
      }
    });
    return this.get(id);
  }

  /** Ends every session of an account (a lost laptop, a shared computer). The password stays as it is. */
  async signOutEverywhere(actor: StaffPrincipal, id: string): Promise<StaffUserView> {
    await this.db.transaction(async (tx) => {
      await lockUser(tx, id);
      const n = await this.sessions.revokeAllForUser(id, undefined, tx);
      await audit(tx, { actorId: actor.id, action: 'staff.sign_out', entityType: 'staff_user', entityId: id, summary: `Signed out of ${n} session(s)` });
    });
    return this.get(id);
  }

  /** What a valid link is for, so the page can greet the person. Throws LINK_INVALID otherwise. */
  async inspectLink(token: string): Promise<{ purpose: 'invite' | 'reset'; name: string; email: string; expiresAt: string }> {
    const [row] = await this.db
      .select({ token: staffTokens, user: staffUsers })
      .from(staffTokens)
      .innerJoin(staffUsers, eq(staffUsers.id, staffTokens.userId))
      .where(and(eq(staffTokens.tokenHash, hashToken(token)), isNull(staffTokens.consumedAt), gt(staffTokens.expiresAt, new Date()), isNull(staffUsers.disabledAt)))
      .limit(1);
    if (!row) throw new BadRequestException(LINK_INVALID);
    return { purpose: row.token.purpose, name: row.user.name, email: row.user.email, expiresAt: row.token.expiresAt.toISOString() };
  }

  /**
   * Sets the password from a link and uses the link up. Every other session, device and link of the account
   * ends, because a reset may follow a stolen password. Returns the user, to be signed in by the caller.
   */
  async redeemLink(token: string, password: string): Promise<typeof staffUsers.$inferSelect> {
    const weak = passwordPolicyError(password);
    if (weak) throw new UnprocessableEntityException({ code: 'WEAK_PASSWORD', message: weak });
    const hash = await hashPassword(password);
    return this.db.transaction(async (tx) => {
      const [t] = await tx.select().from(staffTokens).where(eq(staffTokens.tokenHash, hashToken(token))).for('update').limit(1);
      if (!t || t.consumedAt || t.expiresAt <= new Date()) throw new BadRequestException(LINK_INVALID);
      const user = await lockUser(tx, t.userId);
      if (user.disabledAt) throw new BadRequestException(LINK_INVALID);
      await tx.update(staffUsers).set({ passwordHash: hash }).where(eq(staffUsers.id, user.id));
      await this.cutAccess(tx, user.id);
      await audit(tx, {
        actorId: user.id, action: 'staff.password_set', entityType: 'staff_user', entityId: user.id,
        summary: t.purpose === 'invite' ? 'Accepted invite and set a password' : 'Reset password with a link',
      });
      return { ...user, passwordHash: hash };
    });
  }

  /** The signed-in user's new password (the caller has checked the current one). Other sessions, devices and links end. */
  async setOwnPassword(staff: StaffPrincipal, password: string): Promise<void> {
    const weak = passwordPolicyError(password);
    if (weak) throw new UnprocessableEntityException({ code: 'WEAK_PASSWORD', message: weak });
    const hash = await hashPassword(password);
    await this.db.transaction(async (tx) => {
      await lockUser(tx, staff.id);
      await tx.update(staffUsers).set({ passwordHash: hash }).where(eq(staffUsers.id, staff.id));
      await this.cutAccess(tx, staff.id, staff.sessionId);
      await audit(tx, { actorId: staff.id, action: 'staff.password_change', entityType: 'staff_user', entityId: staff.id, summary: 'Changed own password; other sessions ended' });
    });
  }

  /** Ends sessions (except `keepSessionId`), forgets devices and uses up open links. */
  private async cutAccess(tx: Tx, userId: string, keepSessionId?: string) {
    await this.sessions.revokeAllForUser(userId, keepSessionId, tx);
    await this.devices.forgetAll(userId, tx);
    await tx.update(staffTokens).set({ consumedAt: new Date() }).where(and(eq(staffTokens.userId, userId), isNull(staffTokens.consumedAt)));
  }

  private async issueLink(tx: Tx, userId: string, purpose: 'invite' | 'reset'): Promise<StaffLinkView> {
    const now = new Date();
    await tx.update(staffTokens).set({ consumedAt: now }).where(and(eq(staffTokens.userId, userId), isNull(staffTokens.consumedAt)));
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + (purpose === 'invite' ? INVITE_TTL_MS : RESET_TTL_MS));
    await tx.insert(staffTokens).values({ userId, tokenHash: hashToken(token), purpose, expiresAt });
    const url = new URL('/admin/set-password', loadConfig().WEB_ORIGIN);
    url.hash = `token=${token}`;
    return { purpose, url: url.toString(), expiresAt: expiresAt.toISOString() };
  }
}

async function lockUser(tx: Tx, id: string) {
  const [user] = await tx.select().from(staffUsers).where(eq(staffUsers.id, id)).for('update').limit(1);
  if (!user) throw new NotFoundException('Staff member not found');
  return user;
}

function view(u: typeof staffUsers.$inferSelect, lastActiveAt: Date | string | null, openSessions: number): StaffUserView {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.disabledAt ? 'disabled' : u.passwordHash ? 'active' : 'invited',
    createdAt: u.createdAt.toISOString(),
    lastActiveAt: lastActiveAt ? new Date(lastActiveAt).toISOString() : null,
    openSessions: Number(openSessions),
  };
}
