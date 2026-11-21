/**
 * Prepares the end-to-end test database used by the frontend's Playwright suite:
 * creates it if needed, WIPES it, applies migrations, loads regions and the SYNTHETIC fixtures.
 *
 *   DATABASE_URL=postgresql://wild:wild@localhost:5433/wild_e2e npm run e2e:prepare
 *
 * Refuses any database whose name does not contain "e2e", so it can never wipe dev or production data.
 * If E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are set (the frontend's playwright.config.ts sets test-only values),
 * it also creates that admin, so the suite can check the staff pages. It exists only in the e2e database.
 */
import { loadDotEnv } from '../common/load-env';
loadDotEnv();
import { NestFactory } from '@nestjs/core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { Client, Pool } from 'pg';
import { AppModule } from '../app.module';
import { hashPassword } from '../identity/password';
import { seedFixtures } from './seed-fixtures';
import { seedRegions } from './seed-regions';

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  const dbName = url.pathname.slice(1);
  if (!/e2e/.test(dbName) || !/^[a-z0-9_]+$/.test(dbName)) throw new Error(`Refusing to prepare "${dbName}": the database name must contain "e2e"`);

  const admin = new Client({ connectionString: Object.assign(new URL(url), { pathname: '/postgres' }).toString() });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (!exists.rowCount) await admin.query(`CREATE DATABASE ${dbName}`); // name validated above
  await admin.end();

  // Media for the e2e stack lives in its own folder, wiped too (MEDIA_DIR must contain "e2e").
  const mediaDir = process.env.MEDIA_DIR ?? '';
  if (!/e2e/.test(mediaDir)) throw new Error('Refusing to prepare: MEDIA_DIR must be set to a folder whose name contains "e2e"');
  await rm(mediaDir, { recursive: true, force: true });

  const pool = new Pool({ connectionString: url.toString() });
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;');
  await migrate(drizzle(pool), { migrationsFolder: path.resolve(__dirname, '../../drizzle') });
  await seedRegions(pool);
  const staffEmail = process.env.E2E_ADMIN_EMAIL;
  const staffPassword = process.env.E2E_ADMIN_PASSWORD;
  if (staffEmail && staffPassword) {
    await pool.query(`INSERT INTO staff_users (email, name, password_hash, role) VALUES ($1, 'E2E Admin', $2, 'admin')`, [staffEmail, await hashPassword(staffPassword)]);
  }
  await pool.end();

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const r = await seedFixtures(app);
  await app.close();
  console.log(`e2e database ${dbName} ready: ${r.created.length} synthetic species`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
