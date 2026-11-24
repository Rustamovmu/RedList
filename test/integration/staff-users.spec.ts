/**
 * Staff management (PLAN §7, DECISIONS D-062): invites and reset links shown once, no email; disabling,
 * roles, signing out everywhere, and changing your own password. Real app, real PostgreSQL.
 */
import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { createApp } from '../../src/bootstrap';
import { hashToken } from '../../src/identity/session.service';
import { Auth, authed, cookieHeader, createStaff, freshDatabase, login, ORIGIN, TEST_PASSWORD } from '../helpers';

let app: INestApplication;
let pool: Pool;
let admin: Auth;
let adminId: string;
const http = () => request(app.getHttpServer());
const loginReq = () => http().post('/api/v1/staff/auth/login');
const NEW_PASSWORD = 'a different long passphrase';

beforeAll(async () => {
  pool = await freshDatabase();
  app = await createApp();
  await app.init();
  adminId = await createStaff(pool, 'admin', 'boss@test.invalid');
  admin = await login(loginReq, 'boss@test.invalid');
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

let ipCount = 0;
/** Unauthenticated calls, from a fresh client address each time so the per-IP budget never interferes. */
const anon = (path: string) => http().post(path).set('Origin', ORIGIN).set('X-Forwarded-For', `10.77.${(ipCount >> 8) & 255}.${++ipCount & 255}`);
const tokenOf = (url: string) => new URL(url).hash.replace(/^#token=/, '');
const invite = (email: string, role: 'editor' | 'admin' = 'editor', name = 'Synthetic Person') =>
  authed(http().post('/api/v1/staff/users'), admin).send({ email, name, role });

describe('invites', () => {
  it('creates an account without a password and returns a one-time link once, in the URL fragment', async () => {
    const res = await invite('New.Editor@test.invalid').expect(201);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.user).toMatchObject({ email: 'new.editor@test.invalid', role: 'editor', status: 'invited', openSessions: 0 });
    const url = new URL(res.body.link.url);
    expect(`${url.origin}${url.pathname}`).toBe(`${ORIGIN}/admin/set-password`);
    expect(url.search).toBe('');
    expect(res.body.link.purpose).toBe('invite');
    expect(new Date(res.body.link.expiresAt).getTime() - Date.now()).toBeGreaterThan(6.9 * 24 * 3600_000);

    const token = tokenOf(res.body.link.url);
    const stored = await pool.query(`SELECT token_hash FROM staff_tokens WHERE user_id = $1`, [res.body.user.id]);
    expect(stored.rows).toEqual([{ token_hash: hashToken(token) }]); // only the hash is kept

    await invite('new.editor@TEST.invalid').expect(409);
    const list = await authed(http().get('/api/v1/staff/users'), admin).expect(200);
    expect(list.body.map((u: { email: string }) => u.email)).toContain('new.editor@test.invalid');
  });

  it('an invited person checks the link, sets a password, is signed in, and the link is then used up', async () => {
    const res = await invite('joiner@test.invalid');
    const token = tokenOf(res.body.link.url);

    await http().post('/api/v1/staff/auth/link/check').send({ token }).expect(403); // no Origin
    const info = await anon('/api/v1/staff/auth/link/check').send({ token }).expect(200);
    expect(info.body).toMatchObject({ purpose: 'invite', email: 'joiner@test.invalid', name: 'Synthetic Person' });

    const weak = await anon('/api/v1/staff/auth/link/redeem').send({ token, password: 'short' }).expect(422);
    expect(weak.body.error.code).toBe('WEAK_PASSWORD');
    const ok = await anon('/api/v1/staff/auth/link/redeem').send({ token, password: NEW_PASSWORD }).expect(200);
    expect(ok.body.user).toMatchObject({ email: 'joiner@test.invalid', role: 'editor' });
    const cookies = ok.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('ww_device='))).toBe(true);
    await http().get('/api/v1/staff/auth/me').set('Cookie', cookieHeader(cookies)).expect(200);

    const reused = await anon('/api/v1/staff/auth/link/redeem').send({ token, password: NEW_PASSWORD }).expect(400);
    expect(reused.body.error.code).toBe('LINK_INVALID');
    await anon('/api/v1/staff/auth/link/check').send({ token }).expect(400);
    await login(loginReq, 'joiner@test.invalid', NEW_PASSWORD);
    const [row] = (await authed(http().get('/api/v1/staff/users'), admin)).body.filter((u: { email: string }) => u.email === 'joiner@test.invalid');
    expect(row.status).toBe('active');
  });

  it('rejects expired, unknown and replaced links with the same answer', async () => {
    const res = await invite('late@test.invalid');
    const first = tokenOf(res.body.link.url);
    const again = await authed(http().post(`/api/v1/staff/users/${res.body.user.id}/link`), admin).expect(200);
    expect(again.body.purpose).toBe('invite');
    const second = tokenOf(again.body.url);

    const replaced = await anon('/api/v1/staff/auth/link/check').send({ token: first }).expect(400);
    const unknown = await anon('/api/v1/staff/auth/link/check').send({ token: 'not-a-real-token' }).expect(400);
    await pool.query(`UPDATE staff_tokens SET expires_at = now() - interval '1 second' WHERE token_hash = $1`, [hashToken(second)]);
    const expired = await anon('/api/v1/staff/auth/link/redeem').send({ token: second, password: NEW_PASSWORD }).expect(400);
    expect(new Set([replaced.body.error.message, unknown.body.error.message, expired.body.error.message]).size).toBe(1);
  });
});

describe('managing accounts', () => {
  it('a reset link replaces the password and ends every old session of that account', async () => {
    const id = await createStaff(pool, 'editor', 'forgetful@test.invalid');
    const oldSession = await login(loginReq, 'forgetful@test.invalid');
    const link = await authed(http().post(`/api/v1/staff/users/${id}/link`), admin).expect(200);
    expect(link.body.purpose).toBe('reset');
    expect(new Date(link.body.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(24 * 3600_000);

    await anon('/api/v1/staff/auth/link/redeem').send({ token: tokenOf(link.body.url), password: NEW_PASSWORD }).expect(200);
    await http().get('/api/v1/staff/auth/me').set('Cookie', oldSession.cookie).expect(401);
    await loginReq().set('Origin', ORIGIN).set('X-Forwarded-For', '10.78.0.1').send({ email: 'forgetful@test.invalid', password: TEST_PASSWORD }).expect(401);
    await login(loginReq, 'forgetful@test.invalid', NEW_PASSWORD);
  });

  it('disabling ends sessions, devices and links at once; enabling lets the same password in again', async () => {
    const id = await createStaff(pool, 'editor', 'leaver@test.invalid');
    const session = await login(loginReq, 'leaver@test.invalid');
    const link = await authed(http().post(`/api/v1/staff/users/${id}/link`), admin).expect(200);

    const off = await authed(http().put(`/api/v1/staff/users/${id}`), admin).send({ disabled: true }).expect(200);
    expect(off.body).toMatchObject({ status: 'disabled', openSessions: 0 });
    await http().get('/api/v1/staff/auth/me').set('Cookie', session.cookie).expect(401);
    await anon('/api/v1/staff/auth/link/check').send({ token: tokenOf(link.body.url) }).expect(400);
    expect((await pool.query(`SELECT count(*)::int n FROM staff_devices WHERE user_id = $1`, [id])).rows[0].n).toBe(0);
    await loginReq().set('Origin', ORIGIN).set('X-Forwarded-For', '10.78.0.2').send({ email: 'leaver@test.invalid', password: TEST_PASSWORD }).expect(401);
    const noLink = await authed(http().post(`/api/v1/staff/users/${id}/link`), admin).expect(409);
    expect(noLink.body.error.code).toBe('DISABLED');

    await authed(http().put(`/api/v1/staff/users/${id}`), admin).send({ disabled: false }).expect(200);
    await login(loginReq, 'leaver@test.invalid');
  });

  it('a role change applies to open sessions at once', async () => {
    const id = await createStaff(pool, 'editor', 'promoted@test.invalid');
    const session = await login(loginReq, 'promoted@test.invalid');
    await authed(http().get('/api/v1/staff/users'), session).expect(403);
    await authed(http().put(`/api/v1/staff/users/${id}`), admin).send({ role: 'admin' }).expect(200);
    await authed(http().get('/api/v1/staff/users'), session).expect(200);
    await authed(http().put(`/api/v1/staff/users/${id}`), admin).send({ role: 'editor' }).expect(200);
    await authed(http().get('/api/v1/staff/users'), session).expect(403);
  });

  it('an admin cannot change their own role or disable themselves', async () => {
    for (const body of [{ role: 'editor' }, { disabled: true }]) {
      const res = await authed(http().put(`/api/v1/staff/users/${adminId}`), admin).send(body).expect(422);
      expect(res.body.error.code).toBe('SELF');
    }
    const [me] = (await authed(http().get('/api/v1/staff/users'), admin)).body.filter((u: { id: string }) => u.id === adminId);
    expect(me).toMatchObject({ role: 'admin', status: 'active' });
  });

  it('sign out everywhere ends every session of an account and keeps its password', async () => {
    const id = await createStaff(pool, 'editor', 'laptop-lost@test.invalid');
    const a = await login(loginReq, 'laptop-lost@test.invalid');
    const b = await login(loginReq, 'laptop-lost@test.invalid');
    const res = await authed(http().post(`/api/v1/staff/users/${id}/sign-out`), admin).expect(200);
    expect(res.body.openSessions).toBe(0);
    for (const s of [a, b]) await http().get('/api/v1/staff/auth/me').set('Cookie', s.cookie).expect(401);
    await login(loginReq, 'laptop-lost@test.invalid');
  });

  it('unknown ids are 404, and bad input is refused', async () => {
    await authed(http().put('/api/v1/staff/users/00000000-0000-4000-8000-000000000000'), admin).send({ role: 'admin' }).expect(404);
    await authed(http().post('/api/v1/staff/users'), admin).send({ email: 'not-an-email', name: 'X', role: 'editor' }).expect(400);
    await authed(http().post('/api/v1/staff/users'), admin).send({ email: 'x@test.invalid', name: 'X', role: 'owner' }).expect(400);
  });
});

describe('changing your own password', () => {
  it('needs the current password, ends your other sessions, and keeps this one', async () => {
    await createStaff(pool, 'editor', 'rotator@test.invalid');
    const here = await login(loginReq, 'rotator@test.invalid');
    const elsewhere = await login(loginReq, 'rotator@test.invalid');
    const change = (currentPassword: string, newPassword: string) =>
      authed(http().post('/api/v1/staff/auth/password'), here).set('X-Forwarded-For', '10.79.0.1').send({ currentPassword, newPassword });

    expect((await change('not my password!', NEW_PASSWORD).expect(422)).body.error.code).toBe('WRONG_PASSWORD');
    expect((await change(TEST_PASSWORD, TEST_PASSWORD).expect(422)).body.error.code).toBe('SAME_PASSWORD');
    expect((await change(TEST_PASSWORD, 'too short').expect(422)).body.error.code).toBe('WEAK_PASSWORD');
    const ok = await change(TEST_PASSWORD, NEW_PASSWORD).expect(200);
    expect((ok.headers['set-cookie'] as unknown as string[]).some((c) => c.startsWith('ww_device='))).toBe(true);

    await http().get('/api/v1/staff/auth/me').set('Cookie', here.cookie).expect(200);
    await http().get('/api/v1/staff/auth/me').set('Cookie', elsewhere.cookie).expect(401);
    await loginReq().set('Origin', ORIGIN).set('X-Forwarded-For', '10.79.0.2').send({ email: 'rotator@test.invalid', password: TEST_PASSWORD }).expect(401);
    await login(loginReq, 'rotator@test.invalid', NEW_PASSWORD);
  });

  it('needs CSRF like every mutation', async () => {
    await http().post('/api/v1/staff/auth/password').set('Origin', ORIGIN).set('Cookie', admin.cookie).send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD }).expect(403);
  });
});

it('audit summaries for staff actions never contain an email address', async () => {
  const { rows } = await pool.query(`SELECT action, summary FROM audit_events WHERE action LIKE 'staff.%'`);
  const actions = new Set(rows.map((r) => r.action));
  for (const a of ['staff.invite', 'staff.link', 'staff.role', 'staff.disable', 'staff.enable', 'staff.sign_out', 'staff.password_set', 'staff.password_change']) {
    expect(actions).toContain(a);
  }
  expect(rows.filter((r) => r.summary.includes('@'))).toEqual([]);
});
