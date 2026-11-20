import { z } from 'zod';

/** Environment is validated once at startup. A bad value fails fast with a clear message. */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  WEB_REVALIDATE_URL: z.string().url().optional(),
  REVALIDATE_SECRET: z.string().min(24).optional(),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

/** Cookie names. The __Host- prefix requires Secure, so plain-HTTP local development uses unprefixed names. */
export function cookieNames(secure: boolean) {
  return secure ? { session: '__Host-ww_session', csrf: '__Host-ww_csrf' } : { session: 'ww_session', csrf: 'ww_csrf' };
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
