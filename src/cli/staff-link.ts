/**
 * Prints a one-time password link for an existing staff account (DECISIONS D-062). For when nobody can sign in
 * to make one in the Staff page, for example a solo admin who forgot their password:
 *
 *   npm run staff:link -- someone@example.org
 *   (production) ./deploy/compose.sh exec api node dist/cli/staff-link.js someone@example.org
 *
 * An account without a password gets an invite link (7 days), any other a reset link (24 hours). Earlier unused
 * links stop working. The link is a secret: anyone who opens it can set the password. Nothing else is printed.
 */
import { loadDotEnv } from '../common/load-env';
loadDotEnv();
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../db/schema';
import { DeviceService } from '../identity/device.service';
import { SessionService } from '../identity/session.service';
import { StaffUsersService } from '../identity/staff-users.service';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error('Usage: npm run staff:link -- <email>');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const db = drizzle(pool, { schema });
    const [user] = await db.select({ id: schema.staffUsers.id }).from(schema.staffUsers).where(eq(sql`lower(${schema.staffUsers.email})`, email)).limit(1);
    if (!user) throw new Error('No staff account has that email');
    const users = new StaffUsersService(db, new SessionService(db), new DeviceService(db));
    const link = await users.newLink(null, user.id);
    console.log(`${link.purpose === 'invite' ? 'Invite' : 'Password reset'} link, valid until ${link.expiresAt}. Give it only to the account's owner:`);
    console.log(link.url);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
