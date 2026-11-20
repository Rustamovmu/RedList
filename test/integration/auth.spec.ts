/**
 * Staff authentication, sessions, CSRF and authorization (PLAN §9, M1 gate).
 * Runs the real app against real PostgreSQL + PostGIS.
 */
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import { buildOpenApi, createApp } from '../../src/bootstrap';
import { authed, cookieHeader, createStaff, freshDatabase, login, ORIGIN, TEST_PASSWORD } from '../helpers';

let app: INestApplication;
let pool: Pool;
const http = () => request(app.getHttpServer());
const loginReq = () => http().post('/api/v1/staff/auth/login');

beforeAll(async () => {
  pool = await freshDatabase();
  app = await createApp();
  await app.init();
  await createStaff(pool, 'admin', 'admin@test.invalid');
  await createStaff(pool, 'editor', 'editor@test.invalid');
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('login', () => {
  it('sets an HttpOnly session cookie and a readable CSRF cookie, both SameSite=Lax', async () => {
    const res = await loginReq().set('Origin', ORIGIN).send({ email: 'admin@test.invalid', password: TEST_PASSWORD }).expect(200);
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const session = cookies.find((c) => c.startsWith('ww_session='))!;
    const csrf = cookies.find((c) => c.startsWith('ww_csrf='))!;
    expect(session).toMatch(/HttpOnly/);
    expect(session).toMatch(/SameSite=Lax/);
    expect(csrf).not.toMatch(/HttpOnly/);
    expect(res.body.user).toMatchObject({ email: 'admin@test.invalid', role: 'admin' });
    expect(res.body.user.passwordHash).toBeUndefined();
    // The raw token is never stored: only its hash.
    const token = session.split(';')[0].split('=')[1];
    const { rows } = await pool.query(`SELECT count(*)::int n FROM staff_sessions WHERE token_hash = $1`, [token]);
    expect(rows[0].n).toBe(0);
  });

  it('rejects a wrong password with 401 and a generic message', async () => {
    const res = await loginReq().set('Origin', ORIGIN).send({ email: 'admin@test.invalid', password: 'wrong password here' }).expect(401);
    expect(res.body.error.message).toBe('Email or password is incorrect');
    const unknown = await loginReq().set('Origin', ORIGIN).send({ email: 'nobody@test.invalid', password: 'wrong password here' }).expect(401);
    expect(unknown.body.error.message).toBe(res.body.error.message);
  });

  it('rejects login from a foreign or missing Origin (login CSRF)', async () => {
    await loginReq().send({ email: 'admin@test.invalid', password: TEST_PASSWORD }).expect(403);
    await loginReq().set('Origin', 'https://evil.example').send({ email: 'admin@test.invalid', password: TEST_PASSWORD }).expect(403);
  });

  it('locks an email out with backoff after repeated failures, even for the right password', async () => {
    await createStaff(pool, 'editor', 'lockme@test.invalid');
    for (let i = 0; i < 5; i++) {
      await loginReq().set('Origin', ORIGIN).send({ email: 'lockme@test.invalid', password: 'not the password!' }).expect(401);
    }
    const res = await loginReq().set('Origin', ORIGIN).send({ email: 'lockme@test.invalid', password: TEST_PASSWORD }).expect(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('sessions', () => {
  it('GET /me needs a session, and logout revokes it', async () => {
    await http().get('/api/v1/staff/auth/me').expect(401);
    const auth = await login(loginReq, 'editor@test.invalid');
    await http().get('/api/v1/staff/auth/me').set('Cookie', auth.cookie).expect(200);
    await authed(http().post('/api/v1/staff/auth/logout'), auth).expect(200);
    await http().get('/api/v1/staff/auth/me').set('Cookie', auth.cookie).expect(401);
  });

  it('expires after 12 hours idle', async () => {
    const auth = await login(loginReq, 'editor@test.invalid');
    await pool.query(`UPDATE staff_sessions SET last_seen_at = now() - interval '13 hours' WHERE revoked_at IS NULL`);
    await http().get('/api/v1/staff/auth/me').set('Cookie', auth.cookie).expect(401);
  });

  it('stops working when the user is disabled', async () => {
    await createStaff(pool, 'editor', 'disable-me@test.invalid');
    const auth = await login(loginReq, 'disable-me@test.invalid');
    await pool.query(`UPDATE staff_users SET disabled_at = now() WHERE email = 'disable-me@test.invalid'`);
    await http().get('/api/v1/staff/auth/me').set('Cookie', auth.cookie).expect(401);
  });
});

describe('CSRF and Origin on mutations', () => {
  const body = { title: 'Synthetic CSRF test source' };

  it('rejects a mutation without the CSRF header', async () => {
    const auth = await login(loginReq, 'editor@test.invalid');
    const res = await http().post('/api/v1/staff/sources').set('Origin', ORIGIN).set('Cookie', auth.cookie).send(body).expect(403);
    expect(res.body.error.code).toBe('CSRF');
  });

  it('rejects a CSRF header that does not match the session', async () => {
    const a = await login(loginReq, 'editor@test.invalid');
    const b = await login(loginReq, 'admin@test.invalid');
    // a's cookies with b's token: the double-submit cookie and the session binding both fail
    await http().post('/api/v1/staff/sources').set('Origin', ORIGIN).set('Cookie', a.cookie).set('x-csrf-token', b.csrf).send(body).expect(403);
  });

  it('rejects a foreign Origin even with a valid token', async () => {
    const auth = await login(loginReq, 'editor@test.invalid');
    const res = await http()
      .post('/api/v1/staff/sources')
      .set('Origin', 'https://evil.example')
      .set('Cookie', auth.cookie)
      .set('x-csrf-token', auth.csrf)
      .send(body)
      .expect(403);
    expect(res.body.error.code).toBe('BAD_ORIGIN');
  });

  it('accepts a mutation with session, Origin and CSRF token', async () => {
    const auth = await login(loginReq, 'editor@test.invalid');
    await authed(http().post('/api/v1/staff/sources'), auth).send(body).expect(201);
  });
});

describe('authorization on every staff route', () => {
  it('every staff route except login answers 401 without a session', async () => {
    const doc = buildOpenApi(app);
    const routes = Object.entries(doc.paths)
      .filter(([p]) => p.startsWith('/api/v1/staff/') && p !== '/api/v1/staff/auth/login')
      .flatMap(([p, item]) =>
        (['get', 'post', 'put', 'patch', 'delete'] as const).filter((m) => (item as Record<string, unknown>)[m]).map((m) => ({ m, p: p.replace(/\{[^}]+\}/g, randomUUID()) })),
      );
    expect(routes.length).toBeGreaterThanOrEqual(13);
    for (const { m, p } of routes) {
      const res = await http()[m](p).set('Origin', ORIGIN).send({});
      expect({ route: `${m.toUpperCase()} ${p}`, status: res.status }).toEqual({ route: `${m.toUpperCase()} ${p}`, status: 401 });
    }
  });

  it('an editor cannot publish or request changes (admin only)', async () => {
    const auth = await login(loginReq, 'editor@test.invalid');
    const id = randomUUID();
    const pub = await authed(http().post(`/api/v1/staff/revisions/${id}/publish`), auth).expect(403);
    expect(pub.body.error.code).toBe('FORBIDDEN');
    await authed(http().post(`/api/v1/staff/revisions/${id}/request-changes`), auth).send({ notes: 'x' }).expect(403);
  });

  it('cookies from the response round-trip into a working session', async () => {
    const res = await loginReq().set('Origin', ORIGIN).send({ email: 'admin@test.invalid', password: TEST_PASSWORD }).expect(200);
    const me = await http().get('/api/v1/staff/auth/me').set('Cookie', cookieHeader(res.headers['set-cookie'])).expect(200);
    expect(me.body.csrfToken).toBe(res.body.csrfToken);
  });
});
