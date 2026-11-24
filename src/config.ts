import { z } from 'zod';

/** Environment is validated once at startup. A bad value fails fast with a clear message. */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  WEB_REVALIDATE_URL: z.string().url().optional(),
  REVALIDATE_SECRET: z.string().min(24).optional(),
  // Media (M4, DECISIONS D-022): originals are never stored; only re-encoded WebP variants, on local disk.
  MEDIA_DIR: z.string().min(1).default('./storage/media'),
  MEDIA_MAX_BYTES: z.coerce.number().int().positive().max(50_000_000).default(15_000_000),
  // Optional contact (URL or address) appended to the User-Agent of outbound fetches (import downloads, link checker).
  FETCH_CONTACT: z.string().max(200).optional(),
  // Express "trust proxy" (M5, DECISIONS D-030). Loopback covers the Next.js dev rewrite. In the production compose
  // stack Nginx sits on the private Docker network, so it is "loopback, uniquelocal". Nginx overwrites
  // X-Forwarded-For with the real client address, so a client cannot spoof it.
  TRUST_PROXY: z
    .string()
    .regex(/^(loopback|linklocal|uniquelocal)(\s*,\s*(loopback|linklocal|uniquelocal))*$/, 'use loopback, linklocal and/or uniquelocal')
    .default('loopback'),
  // Sign-in, sign-up and one-time link attempts per client address per 15 minutes (PLAN §9, D-010). Only the
  // throwaway e2e stack raises it: all of its browsers share one address (D-066).
  LOGIN_IP_LIMIT: z.coerce.number().int().min(5).max(1000).default(20),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

/**
 * Cookie names. The __Host- prefix requires Secure, so plain-HTTP local development uses unprefixed names.
 * `session`, `csrf` and `device` are for staff; `account` and `accountCsrf` for visitor accounts (D-066).
 */
export function cookieNames(secure: boolean) {
  return secure
    ? {
        session: '__Host-ww_session',
        csrf: '__Host-ww_csrf',
        device: '__Host-ww_device',
        account: '__Host-ww_account',
        accountCsrf: '__Host-ww_account_csrf',
      }
    : { session: 'ww_session', csrf: 'ww_csrf', device: 'ww_device', account: 'ww_account', accountCsrf: 'ww_account_csrf' };
}

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
