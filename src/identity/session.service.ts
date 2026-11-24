import { Injectable } from '@nestjs/common';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { Db, DbOrTx, InjectDb } from '../db/db.module';
import { staffSessions, staffUsers } from '../db/schema';

export const SESSION_IDLE_MS = 12 * 60 * 60_000;
export const SESSION_ABSOLUTE_MS = 7 * 24 * 60 * 60_000;
const TOUCH_INTERVAL_MS = 60_000;

export type StaffPrincipal = { id: string; name: string; email: string; role: 'editor' | 'admin'; sessionId: string; csrfToken: string };

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');

/** Opaque session tokens. Only the SHA-256 hash is stored, so a database leak does not leak live sessions. */
@Injectable()
export class SessionService {
  constructor(@InjectDb() private readonly db: Db) {}

  async create(userId: string, userAgent: string | undefined): Promise<{ token: string; csrfToken: string }> {
    const token = newToken();
    const csrfToken = newToken();
    await this.db.insert(staffSessions).values({
      userId,
      tokenHash: hashToken(token),
      csrfToken,
      expiresAt: new Date(Date.now() + SESSION_ABSOLUTE_MS),
      userAgent: userAgent?.slice(0, 200) ?? null,
    });
    return { token, csrfToken };
  }

  /** Resolves a raw cookie token to an active session of an enabled user, enforcing idle and absolute limits. */
  async resolve(token: string | undefined, now = new Date()): Promise<StaffPrincipal | null> {
    if (!token || token.length > 100) return null;
    const [row] = await this.db
      .select({ session: staffSessions, user: staffUsers })
      .from(staffSessions)
      .innerJoin(staffUsers, eq(staffUsers.id, staffSessions.userId))
      .where(and(eq(staffSessions.tokenHash, hashToken(token)), isNull(staffSessions.revokedAt)))
      .limit(1);
    if (!row || row.user.disabledAt) return null;
    const { session, user } = row;
    if (session.expiresAt <= now) return null;
    if (now.getTime() - session.lastSeenAt.getTime() > SESSION_IDLE_MS) return null;
    if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.db.update(staffSessions).set({ lastSeenAt: now }).where(eq(staffSessions.id, session.id));
    }
    return { id: user.id, name: user.name, email: user.email, role: user.role, sessionId: session.id, csrfToken: session.csrfToken };
  }

  async revoke(sessionId: string) {
    await this.db.update(staffSessions).set({ revokedAt: new Date() }).where(eq(staffSessions.id, sessionId));
  }

  /** Ends every open session of a user, optionally keeping one (the caller's own). Returns how many ended. */
  async revokeAllForUser(userId: string, keepSessionId?: string, db: DbOrTx = this.db): Promise<number> {
    const rows = await db
      .update(staffSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(staffSessions.userId, userId), isNull(staffSessions.revokedAt), keepSessionId ? ne(staffSessions.id, keepSessionId) : undefined))
      .returning({ id: staffSessions.id });
    return rows.length;
  }
}
