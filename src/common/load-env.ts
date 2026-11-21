import { config } from 'dotenv';

/**
 * Loads `.env` for the server and the CLIs. Under tests (NODE_ENV=test, set by test/setup-env.ts from .env.test)
 * it does nothing: several test files import CLI modules, and a developer's `.env` must never leak into a test run
 * (for example WEB_ORIGIN, or a WEB_REVALIDATE_URL pointing at a running dev web server). Found by the M5
 * fresh-clone check.
 */
export function loadDotEnv(): void {
  if (process.env.NODE_ENV === 'test') return;
  config({ quiet: true });
}
