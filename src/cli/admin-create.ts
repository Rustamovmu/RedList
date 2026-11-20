/**
 * Creates the first admin from environment variables (PLAN §7 "Staff accounts in R1"):
 *
 *   ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... npm run admin:create
 *
 * (or set them in .env). Refuses to overwrite an existing account and rejects weak or placeholder
 * passwords, so there is never a default production password. Prints the new user's id only.
 */
import { config } from 'dotenv';
config({ quiet: true });
import { Pool } from 'pg';
import { hashPassword, passwordPolicyError } from '../identity/password';

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.ADMIN_NAME?.trim();
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('ADMIN_EMAIL is missing or not an email address');
  if (!name) throw new Error('ADMIN_NAME is missing');
  const weak = passwordPolicyError(password);
  if (weak) throw new Error(`ADMIN_PASSWORD rejected: ${weak}`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exists = await client.query('SELECT 1 FROM staff_users WHERE lower(email) = $1', [email]);
    if (exists.rowCount) throw new Error('A staff user with ADMIN_EMAIL already exists; nothing changed');
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO staff_users (email, name, password_hash, role) VALUES ($1, $2, $3, 'admin') RETURNING id`,
      [email, name, await hashPassword(password)],
    );
    await client.query(
      `INSERT INTO audit_events (actor_id, action, entity_type, entity_id, summary) VALUES (NULL, 'staff.bootstrap', 'staff_user', $1, 'Admin created by CLI')`,
      [rows[0].id],
    );
    await client.query('COMMIT');
    console.log(`admin created: ${rows[0].id}`);
    console.log('Remove ADMIN_PASSWORD from .env now that the account exists.');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
