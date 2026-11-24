/**
 * Staff authentication, sessions, CSRF and authorization (PLAN §9, M1 gate).
 * Runs the real app against real PostgreSQL + PostGIS.
 */
import { INestApplication, RequestMethod, Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer, Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import { buildOpenApi, createApp } from '../../src/bootstrap';
import { ROLES_KEY } from '../../src/identity/staff.guard';
import { authed, cookieHeader, createStaff, freshDatabase, login, ORIGIN, TEST_PASSWORD } from '../helpers';

type Verb = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** Every route whose handler or controller carries @Roles('admin'), read from the running app's controllers. */
function adminOnlyRoutes(nest: INestApplication): Array<{ m: Verb; p: string }> {
  const reflector = nest.get(Reflector);
  const verbs: Partial<Record<RequestMethod, Verb>> = {
    [RequestMethod.GET]: 'get',
    [RequestMethod.POST]: 'post',
    [RequestMethod.PUT]: 'put',
    [RequestMethod.PATCH]: 'patch',
    [RequestMethod.DELETE]: 'delete',
  };
  const out: Array<{ m: Verb; p: string }> = [];
  for (const mod of nest.get(ModulesContainer).values()) {
    for (const wrapper of mod.controllers.values()) {
      const cls = wrapper.metatype as Type | null;
      if (!cls) continue;
      const base = String(Reflect.getMetadata(PATH_METADATA, cls) ?? '');
      for (const name of Object.getOwnPropertyNames(cls.prototype)) {
        const handler: unknown = cls.prototype[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (method === undefined) continue;
        const roles = reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [handler, cls]);
        if (!roles?.includes('admin') || roles.includes('editor')) continue;
        const verb = verbs[method];
        if (!verb) throw new Error(`Unexpected HTTP method on ${cls.name}.${name}`);
        const sub = String(Reflect.getMetadata(PATH_METADATA, handler) ?? '');
        out.push({ m: verb, p: `/api/v1/${[base, sub].filter((x) => x && x !== '/').join('/')}` });
      }
    }
  }
  return out;
}

/** The only staff routes that work without a session; each checks Origin and is rate limited per IP. */
const PUBLIC_STAFF_ROUTES = new Set(['/api/v1/staff/auth/login', '/api/v1/staff/auth/link/check', '/api/v1/staff/auth/link/redeem']);

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

  it('a browser that signed in before still gets in while a stranger keeps its email locked (device cookie, D-061)', async () => {
    const userId = await createStaff(pool, 'admin', 'trusted@test.invalid');
    await createStaff(pool, 'editor', 'neighbour@test.invalid');
    const attempt = (ip: string, email: string, password: string, cookie?: string) => {
      const r = loginReq().set('Origin', ORIGIN).set('X-Forwarded-For', ip);
      return (cookie ? r.set('Cookie', cookie) : r).send({ email, password });
    };
    const deviceOf = (res: request.Response) => {
      const c = (res.headers['set-cookie'] as unknown as string[]).find((x) => x.startsWith('ww_device='));
      expect(c).toMatch(/HttpOnly/);
      expect(c).toMatch(/SameSite=Strict/);
      expect(c).toMatch(/Max-Age=15552000/);
      return c!.split(';')[0];
    };

    const device = deviceOf(await attempt('10.200.0.1', 'trusted@test.invalid', TEST_PASSWORD).expect(200));
    const raw = device.split('=')[1];
    const stored = await pool.query(`SELECT count(*)::int n FROM staff_devices WHERE user_id = $1 AND token_hash <> $2`, [userId, raw]);
    expect(stored.rows[0].n).toBe(1); // stored, but only as a hash

    for (let i = 0; i < 5; i++) await attempt('10.200.0.2', 'trusted@test.invalid', 'not the password!').expect(401);
    await attempt('10.200.0.3', 'trusted@test.invalid', TEST_PASSWORD).expect(429);

    // The owner's browser signs in despite the lock and gets a new token; the old one stops counting.
    const rotated = deviceOf(await attempt('10.200.0.4', 'trusted@test.invalid', TEST_PASSWORD, device).expect(200));
    expect(rotated).not.toBe(device);
    await attempt('10.200.0.4', 'trusted@test.invalid', TEST_PASSWORD, device).expect(429);
    const rows = await pool.query(`SELECT count(*)::int n FROM staff_devices WHERE user_id = $1`, [userId]);
    expect(rows.rows[0].n).toBe(1);

    // That success did not unlock the email for strangers, and the cookie is no use for another account.
    await attempt('10.200.0.5', 'trusted@test.invalid', TEST_PASSWORD).expect(429);
    for (let i = 0; i < 5; i++) await attempt('10.200.0.6', 'neighbour@test.invalid', 'not the password!').expect(401);
    await attempt('10.200.0.7', 'neighbour@test.invalid', TEST_PASSWORD, rotated).expect(429);

    // A trusted browser that keeps guessing locks only itself.
    for (let i = 0; i < 5; i++) await attempt('10.200.0.8', 'trusted@test.invalid', 'not the password!', rotated).expect(401);
    await attempt('10.200.0.8', 'trusted@test.invalid', TEST_PASSWORD, rotated).expect(429);
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
  it('every staff route except sign-in and the one-time link routes answers 401 without a session', async () => {
    const doc = buildOpenApi(app);
    const routes = Object.entries(doc.paths)
      .filter(([p]) => p.startsWith('/api/v1/staff/') && !PUBLIC_STAFF_ROUTES.has(p))
      .flatMap(([p, item]) =>
        (['get', 'post', 'put', 'patch', 'delete'] as const).filter((m) => (item as Record<string, unknown>)[m]).map((m) => ({ m, p: p.replace(/\{[^}]+\}/g, randomUUID()) })),
      );
    expect(routes.length).toBeGreaterThanOrEqual(13);
    for (const { m, p } of routes) {
      const res = await http()[m](p).set('Origin', ORIGIN).send({});
      expect({ route: `${m.toUpperCase()} ${p}`, status: res.status }).toEqual({ route: `${m.toUpperCase()} ${p}`, status: 401 });
    }
  });

  it('the admin-only routes are exactly the reviewed list; an editor gets 403 on each, an admin passes the role check', async () => {
    const routes = adminOnlyRoutes(app);
    // The authorization policy (PLAN §7). A route that gains or loses @Roles('admin') must be added here on purpose.
    expect(routes.map((r) => `${r.m.toUpperCase()} ${r.p}`).sort()).toEqual(
      [
        'POST /api/v1/staff/media/:id/approve',
        'POST /api/v1/staff/media/:id/reject',
        'POST /api/v1/staff/organizations',
        'POST /api/v1/staff/organizations/:id/approve',
        'POST /api/v1/staff/organizations/:id/disable',
        'POST /api/v1/staff/revisions/:id/publish',
        'POST /api/v1/staff/revisions/:id/request-changes',
        'POST /api/v1/staff/species/:id/rollback',
        'POST /api/v1/staff/support-links',
        'POST /api/v1/staff/support-links/:id/approve',
        'POST /api/v1/staff/support-links/:id/disable',
        'PUT /api/v1/staff/organizations/:id',
        'PUT /api/v1/staff/support-links/:id',
        'GET /api/v1/staff/users',
        'POST /api/v1/staff/users',
        'PUT /api/v1/staff/users/:id',
        'POST /api/v1/staff/users/:id/link',
        'POST /api/v1/staff/users/:id/sign-out',
      ].sort(),
    );
    const editor = await login(loginReq, 'editor@test.invalid');
    const admin = await login(loginReq, 'admin@test.invalid');
    for (const { m, p } of routes) {
      const path = p.replace(/:[a-zA-Z]+/g, randomUUID());
      const asEditor = await authed(http()[m](path), editor).send({});
      expect({ route: `${m.toUpperCase()} ${p}`, status: asEditor.status, code: asEditor.body.error?.code }).toEqual({
        route: `${m.toUpperCase()} ${p}`,
        status: 403,
        code: 'FORBIDDEN',
      });
      // Guards run before validation, so anything other than FORBIDDEN (400 for the empty body, 404 for the
      // random id) shows the admin got past the role check.
      const asAdmin = await authed(http()[m](path), admin).send({});
      expect({ route: `${m.toUpperCase()} ${p}`, code: asAdmin.body.error?.code }).not.toEqual({ route: `${m.toUpperCase()} ${p}`, code: 'FORBIDDEN' });
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
