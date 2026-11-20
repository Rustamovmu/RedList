import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import path from 'node:path';
import { Pool, PoolClient } from 'pg';

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
