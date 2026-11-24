import { Injectable } from '@nestjs/common';
import { and, desc, eq, gt, inArray, lte } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { Db, DbOrTx, InjectDb } from '../db/db.module';
import { staffDevices } from '../db/schema';
import { hashToken } from './session.service';

export const DEVICE_MAX_AGE_MS = 180 * 24 * 60 * 60_000;
const MAX_DEVICES_PER_USER = 10;

/**
 * Device cookies (OWASP "Slow down online guessing attacks with device cookies", DECISIONS D-061).
 * A browser that signed in successfully gets a long-lived random token. While an email is locked out after
 * failed attempts, a browser holding a valid token for that user may still sign in, so a stranger who knows
 * the admin's email cannot keep the admin out. Only the token's SHA-256 is stored.
 */
@Injectable()
export class DeviceService {
  constructor(@InjectDb() private readonly db: Db) {}

  /** The device id if `token` is an unexpired device token of this user, otherwise null. */
  async find(userId: string, token: string | undefined, now = new Date()): Promise<string | null> {
    if (!token || token.length > 100) return null;
    const [row] = await this.db
      .select({ id: staffDevices.id })
      .from(staffDevices)
      .where(and(eq(staffDevices.tokenHash, hashToken(token)), eq(staffDevices.userId, userId), gt(staffDevices.expiresAt, now)))
      .limit(1);
    return row?.id ?? null;
  }

  /**
   * After a successful sign-in: rotates the presented device's token, or registers a new device. Drops the
   * user's expired devices and keeps at most the 10 most recently used. Returns the new raw token.
   */
  async issue(userId: string, deviceId: string | null, now = new Date()): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const values = { tokenHash: hashToken(token), lastUsedAt: now, expiresAt: new Date(now.getTime() + DEVICE_MAX_AGE_MS) };
    await this.db.transaction(async (tx) => {
      const rotated = deviceId
        ? await tx.update(staffDevices).set(values).where(and(eq(staffDevices.id, deviceId), eq(staffDevices.userId, userId))).returning({ id: staffDevices.id })
        : [];
      if (rotated.length === 0) await tx.insert(staffDevices).values({ userId, ...values });
      await tx.delete(staffDevices).where(and(eq(staffDevices.userId, userId), lte(staffDevices.expiresAt, now)));
      const keep = await tx
        .select({ id: staffDevices.id })
        .from(staffDevices)
        .where(eq(staffDevices.userId, userId))
        .orderBy(desc(staffDevices.lastUsedAt))
        .offset(MAX_DEVICES_PER_USER);
      if (keep.length) await tx.delete(staffDevices).where(inArray(staffDevices.id, keep.map((r) => r.id)));
    });
    return token;
  }

  /** Forgets every device of a user, e.g. after a password change or when the account is disabled. */
  async forgetAll(userId: string, db: DbOrTx = this.db) {
    await db.delete(staffDevices).where(eq(staffDevices.userId, userId));
  }
}
