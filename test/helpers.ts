import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { Pool, PoolClient } from 'pg';
import type { Test } from 'supertest';
import { hashPassword } from '../src/identity/password';

/** Fresh schema per test file: drop everything, then run the real migrations. */
export async function freshDatabase(): Promise<Pool> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;');
  await migrate(drizzle(pool), { migrationsFolder: path.resolve(__dirname, '../drizzle') });
  return pool;
}

/** Expect a statement to fail with a given Postgres error code (23514 check, 23503 FK, 42501 privilege). */
export async function expectPgError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toMatchObject({ code });
}

/** Minimal synthetic graph: staff user, source, species and one draft revision. */
export async function fixture(db: Pool | PoolClient, slug = 'fictus-exemplaris') {
  const user = (await db.query(`INSERT INTO staff_users (email, name, role) VALUES ($1, 'Test Admin', 'admin') RETURNING id`, [`${slug}@test.invalid`])).rows[0].id as string;
  const source = (await db.query(`INSERT INTO sources (title) VALUES ('Synthetic test source') RETURNING id`)).rows[0].id as string;
  const species = (await db.query(`INSERT INTO species (slug, accepted_scientific_name) VALUES ($1, 'Fictus exemplaris') RETURNING id`, [slug])).rows[0].id as string;
  const revision = (
    await db.query(`INSERT INTO species_revisions (species_id, version, display_group, author_id) VALUES ($1, 1, 'mammal', $2) RETURNING id`, [species, user])
  ).rows[0].id as string;
  return { user, source, species, revision };
}

// ---------- M1: staff sessions over HTTP ----------

/** Must equal WEB_ORIGIN (default http://localhost:3000). */
export const ORIGIN = 'http://localhost:3000';
export const TEST_PASSWORD = 'correct horse battery staple';

export type Auth = { cookie: string; csrf: string };

export async function createStaff(db: Pool, role: 'editor' | 'admin', email: string, password = TEST_PASSWORD): Promise<string> {
  const { rows } = await db.query(`INSERT INTO staff_users (email, name, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id`, [
    email,
    `Test ${role}`,
    await hashPassword(password),
    role,
  ]);
  return rows[0].id as string;
}

/** Turns Set-Cookie headers into a Cookie request header. */
export function cookieHeader(setCookie: string[] | string | undefined): string {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return list.map((c) => c.split(';')[0]).join('; ');
}

let loginCount = 0;
export async function login(req: () => Test, email: string, password = TEST_PASSWORD): Promise<Auth> {
  // A distinct client address per sign-in keeps tests out of each other's per-IP rate-limit bucket.
  const ip = `10.${(loginCount >> 8) & 255}.${loginCount & 255}.${++loginCount % 250}`;
  const res = await req().set('Origin', ORIGIN).set('X-Forwarded-For', ip).send({ email, password }).expect(200);
  return { cookie: cookieHeader(res.headers['set-cookie']), csrf: res.body.csrfToken as string };
}

/** Adds session cookie, Origin and CSRF header: what the admin UI sends on every mutation. */
export const authed = (t: Test, auth: Auth) => t.set('Origin', ORIGIN).set('Cookie', auth.cookie).set('x-csrf-token', auth.csrf);
