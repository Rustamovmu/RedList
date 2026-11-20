/** Apply SQL migrations in ./drizzle. Safe for production: no destructive push. */
import { config } from 'dotenv';
config({ quiet: true });
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import path from 'node:path';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await migrate(drizzle(pool), { migrationsFolder: path.resolve(__dirname, '../../drizzle') });
  await pool.end();
  console.log('migrations applied');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
