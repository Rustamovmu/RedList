/**
 * npm run links:check: records the HTTP status of every support link (PLAN §8).
 * Failures are listed for an admin to review in /admin/support. No link is ever disabled automatically.
 * Exit code 0 even when links fail (the check itself succeeded); 1 only if the check could not run.
 */
import { loadDotEnv } from '../common/load-env';
loadDotEnv();
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { loadConfig } from '../config';
import * as schema from '../db/schema';
import { checkSupportLinks } from '../support-directory/link-checker';

async function main() {
  const pool = new Pool({ connectionString: loadConfig().DATABASE_URL, max: 2 });
  try {
    const results = await checkSupportLinks(drizzle(pool, { schema }));
    const failed = results.filter((r) => !r.ok);
    console.log(`Checked ${results.length} support link(s). ${failed.length} need review. Nothing was disabled.`);
    for (const f of failed) {
      console.log(`- [${f.editorialStatus}] ${f.organization}: ${f.url} → ${f.status === 0 ? `no response (${f.error ?? 'error'})` : `HTTP ${f.status}`} (link ${f.linkId})`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
