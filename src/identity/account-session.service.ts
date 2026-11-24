import { Injectable } from '@nestjs/common';
import { and, eq, lt, lte, ne, or } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { Db, InjectDb } from '../db/db.module';
import { publicSessions, publicUsers } from '../db/schema';
import { hashToken } from './session.service';

/** A visitor's session ends after 7 days without use, and after 30 days in any case (D-066). */
export const ACCOUNT_SESSION_IDLE_MS = 7 * 24 * 60 * 60_000;
export const ACCOUNT_SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60_000;
const TOUCH_INTERVAL_MS = 60_000;

export type AccountPrincipal = { id: string; name: string; email: string; createdAt: Date; sessionId: string; csrfToken: string };

const newToken = () => randomBytes(32).toString('base64url');

/**
 * Sessions of visitor accounts (D-066), apart from staff sessions: a visitor's token is looked up only in
 * public_sessions, so it can never pass StaffGuard. Only the SHA-256 of the token is stored. Signing out deletes
 * the row; expired rows of a user are deleted at their next sign-in.
 */
@Injectable()
export class AccountSessionService {
  constructor(@InjectDb() private readonly db: Db) {}

  async create(userId: string, now = new Date()): Promise<{ token: string; csrfToken: string }> {
    const token = newToken();
    const csrfToken = newToken();
    await this.db
      .delete(publicSessions)
      .where(
        and(
          eq(publicSessions.userId, userId),
          or(lte(publicSessions.expiresAt, now), lt(publicSessions.lastSeenAt, new Date(now.getTime() - ACCOUNT_SESSION_IDLE_MS))),
        ),
      );
    await this.db.insert(publicSessions).values({
      userId,
      tokenHash: hashToken(token),
      csrfToken,
      expiresAt: new Date(now.getTime() + ACCOUNT_SESSION_ABSOLUTE_MS),
    });
    return { token, csrfToken };
  }

  /** Resolves a raw cookie token to an active session, enforcing the idle and absolute limits. */
  async resolve(token: string | undefined, now = new Date()): Promise<AccountPrincipal | null> {
    if (!token || token.length > 100) return null;
    const [row] = await this.db
      .select({ session: publicSessions, user: publicUsers })
      .from(publicSessions)
      .innerJoin(publicUsers, eq(publicUsers.id, publicSessions.userId))
      .where(eq(publicSessions.tokenHash, hashToken(token)))
      .limit(1);
    if (!row) return null;
    const { session, user } = row;
    if (session.expiresAt <= now || now.getTime() - session.lastSeenAt.getTime() > ACCOUNT_SESSION_IDLE_MS) return null;
    if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.db.update(publicSessions).set({ lastSeenAt: now }).where(eq(publicSessions.id, session.id));
    }
    return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt, sessionId: session.id, csrfToken: session.csrfToken };
  }

  async remove(sessionId: string) {
    await this.db.delete(publicSessions).where(eq(publicSessions.id, sessionId));
  }

  /** Ends every other session of the user (after a password change). Returns how many ended. */
  async removeOthers(userId: string, keepSessionId: string): Promise<number> {
    const rows = await this.db
      .delete(publicSessions)
      .where(and(eq(publicSessions.userId, userId), ne(publicSessions.id, keepSessionId)))
      .returning({ id: publicSessions.id });
    return rows.length;
  }
}
