import argon2 from 'argon2';

export const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 256;

// No offline breached-password list is bundled (PLAN §9 says "if one is available"), so only obvious
// placeholders are rejected. See docs/DECISIONS.md D-010.
const OBVIOUS = [/^change-?me/i, /^password/i, /^(.)\1+$/, /^1234567890/, /^qwerty/i, /^admin/i];

/** Returns a human-readable reason the password is unacceptable, or null if it passes the policy. */
export function passwordPolicyError(pw: string): string | null {
  if (pw.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  if (pw.length > PASSWORD_MAX_LENGTH) return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  if (OBVIOUS.some((r) => r.test(pw))) return 'Password is a placeholder or too predictable';
  return null;
}

export function hashPassword(pw: string): Promise<string> {
  return argon2.hash(pw, { type: argon2.argon2id });
}

let dummyHash: Promise<string> | undefined;

/**
 * Verifies a password. When the user does not exist (hash is null) a dummy hash is still verified,
 * so response time does not reveal whether an email is registered.
 */
export async function verifyPassword(hash: string | null, pw: string): Promise<boolean> {
  if (pw.length > PASSWORD_MAX_LENGTH) return false;
  if (!hash) {
    dummyHash ??= argon2.hash('dummy-password-for-timing', { type: argon2.argon2id });
    await argon2.verify(await dummyHash, pw).catch(() => false);
    return false;
  }
  return argon2.verify(hash, pw).catch(() => false);
}
