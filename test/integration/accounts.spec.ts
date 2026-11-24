/**
 * Visitor accounts and the one sign-in form for everyone (owner request, DECISIONS D-066).
 * Runs the real app against real PostgreSQL. Every address is a synthetic example.invalid one.
 */
import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { buildOpenApi, createApp } from '../../src/bootstrap';
import { cookieHeader, createStaff, expectPgError, freshDatabase, ORIGIN, TEST_PASSWORD } from '../helpers';

let app: INestApplication;
let pool: Pool;
const http = () => request(app.getHttpServer());

/** A distinct client address per call keeps tests out of each other's per-IP rate-limit bucket. */
let ipCount = 0;
const nextIp = () => `10.20.${(++ipCount >> 8) & 255}.${ipCount & 255}`;

type Visitor = { cookie: string; csrf: string };
const PASSWORD = 'a visitor passphrase, synthetic';

async function signUp(email: string, name = 'Test Visitor', password = PASSWORD): Promise<Visitor> {
  const res = await http().post('/api/v1/account/sign-up').set('Origin', ORIGIN).set('X-Forwarded-For', nextIp()).send({ name, email, password }).expect(201);
  return { cookie: cookieHeader(res.headers['set-cookie']), csrf: res.body.csrfToken as string };
}

const signIn = (email: string, password: string, cookie?: string) => {
  const t = http().post('/api/v1/auth/sign-in').set('Origin', ORIGIN).set('X-Forwarded-For', nextIp());
  return (cookie ? t.set('Cookie', cookie) : t).send({ email, password });
};

/** Session cookie, Origin and CSRF header: what the web app sends on every account mutation. */
const authed = (t: request.Test, v: Visitor) => t.set('Origin', ORIGIN).set('X-Forwarded-For', nextIp()).set('Cookie', v.cookie).set('x-csrf-token', v.csrf);

const setCookies = (res: request.Response) => (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];

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

describe('sign-up', () => {
  it('creates an account, signs it in with an HttpOnly session cookie and a readable CSRF cookie, and stores the email in lower case', async () => {
    const res = await http()
      .post('/api/v1/account/sign-up')
      .set('Origin', ORIGIN)
      .set('X-Forwarded-For', nextIp())
      .send({ name: '  Ada Visitor ', email: 'Ada@Example.Invalid', password: PASSWORD })
      .expect(201);
    expect(res.body.user).toMatchObject({ name: 'Ada Visitor', email: 'ada@example.invalid' });
    const cookies = setCookies(res);
    const session = cookies.find((c) => c.startsWith('ww_account='))!;
    const csrf = cookies.find((c) => c.startsWith('ww_account_csrf='))!;
    expect(session).toMatch(/HttpOnly/);
    expect(session).toMatch(/SameSite=Lax/);
    expect(csrf).not.toMatch(/HttpOnly/);
    expect(cookies.some((c) => c.startsWith('ww_session=') || c.startsWith('ww_device='))).toBe(false); // no staff cookies

    const me = await http().get('/api/v1/account/me').set('Cookie', cookieHeader(cookies)).expect(200);
    expect(me.headers['cache-control']).toBe('no-store');
    expect(me.body.user).toMatchObject({ name: 'Ada Visitor', email: 'ada@example.invalid' });
    // Only a hash of the password and of the session token is stored.
    const { rows } = await pool.query(`SELECT u.password_hash, s.token_hash FROM public_users u JOIN public_sessions s ON s.user_id = u.id WHERE u.email = 'ada@example.invalid'`);
    expect(rows[0].password_hash).toMatch(/^\$argon2id\$/);
    expect(session).not.toContain(rows[0].token_hash);
  });

  it('refuses a taken email in any case, and a staff email, with the same answer', async () => {
    await signUp('taken@example.invalid');
    for (const email of ['taken@example.invalid', 'TAKEN@example.invalid', 'admin@test.invalid', 'Editor@Test.Invalid']) {
      const res = await http().post('/api/v1/account/sign-up').set('Origin', ORIGIN).set('X-Forwarded-For', nextIp()).send({ name: 'Someone', email, password: PASSWORD });
      expect({ email, status: res.status, error: res.body.error }).toEqual({
        email,
        status: 409,
        error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists' },
      });
    }
  });

  it('validates its input and checks Origin', async () => {
    const post = (body: object, origin: string | null = ORIGIN) => {
      const t = http().post('/api/v1/account/sign-up').set('X-Forwarded-For', nextIp());
      return (origin ? t.set('Origin', origin) : t).send(body);
    };
    await post({ name: 'A', email: 'origin@example.invalid', password: PASSWORD }, null).expect(403);
    await post({ name: 'A', email: 'origin@example.invalid', password: PASSWORD }, 'https://evil.example').expect(403);
    expect((await post({ name: 'A', email: 'weak@example.invalid', password: 'short' }).expect(422)).body.error.code).toBe('WEAK_PASSWORD');
    expect((await post({ name: '   ', email: 'blank@example.invalid', password: PASSWORD }).expect(422)).body.error.code).toBe('NAME_REQUIRED');
    await post({ name: 'A', email: 'not-an-email', password: PASSWORD }).expect(400);
    await post({ name: 'x'.repeat(81), email: 'long@example.invalid', password: PASSWORD }).expect(400);
    await post({ name: 'A', email: 'extra@example.invalid', password: PASSWORD, role: 'admin' }).expect(400); // no other fields
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM public_users WHERE email IN ('origin@example.invalid', 'weak@example.invalid', 'blank@example.invalid', 'extra@example.invalid')`);
    expect(rows[0].n).toBe(0);
  });
});

describe('one sign-in form for everyone', () => {
  it('a visitor signs in as a visitor: visitor cookies only', async () => {
    await signUp('sign-in@example.invalid', 'Signing Visitor');
    const res = await signIn('Sign-In@example.invalid', PASSWORD).expect(200);
    expect(res.body).toMatchObject({ kind: 'visitor', name: 'Signing Visitor' });
    expect(typeof res.body.csrfToken).toBe('string');
    const cookies = setCookies(res);
    expect(cookies.some((c) => c.startsWith('ww_account='))).toBe(true);
    expect(cookies.some((c) => c.startsWith('ww_session=') || c.startsWith('ww_device='))).toBe(false);
  });

  it('a staff member signs in as staff, with the staff session and device cookies', async () => {
    const res = await signIn('admin@test.invalid', TEST_PASSWORD).expect(200);
    expect(res.body).toMatchObject({ kind: 'staff', name: 'Test admin' });
    const cookies = setCookies(res);
    expect(cookies.some((c) => c.startsWith('ww_session='))).toBe(true);
    expect(cookies.some((c) => c.startsWith('ww_device='))).toBe(true);
    expect(cookies.some((c) => c.startsWith('ww_account='))).toBe(false);
    await http().get('/api/v1/staff/auth/me').set('Cookie', cookieHeader(cookies)).expect(200);
  });

  it('a wrong password, an unknown email and a staff email get the same 401', async () => {
    await signUp('wrong@example.invalid');
    const answers = [];
    for (const email of ['wrong@example.invalid', 'nobody@example.invalid', 'editor@test.invalid']) {
      const res = await signIn(email, 'not the password at all');
      answers.push({ status: res.status, error: res.body.error });
    }
    expect(answers[0]).toMatchObject({ status: 401, error: { message: 'Email or password is incorrect' } });
    expect(answers[1]).toEqual(answers[0]);
    expect(answers[2]).toEqual(answers[0]);
  });

  it('rejects sign-in from a foreign or missing Origin', async () => {
    await http().post('/api/v1/auth/sign-in').set('X-Forwarded-For', nextIp()).send({ email: 'admin@test.invalid', password: TEST_PASSWORD }).expect(403);
    await http().post('/api/v1/auth/sign-in').set('Origin', 'https://evil.example').send({ email: 'admin@test.invalid', password: TEST_PASSWORD }).expect(403);
  });

  it('locks a visitor email out with backoff after repeated failures, even for the right password', async () => {
    await signUp('lockout@example.invalid');
    for (let i = 0; i < 5; i++) await signIn('lockout@example.invalid', 'wrong password number x').expect(401);
    const res = await signIn('lockout@example.invalid', PASSWORD).expect(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('one browser holds one identity: signing in as staff ends the visitor session, and the other way round', async () => {
    const visitor = await signUp('both@example.invalid');
    const asStaff = await signIn('editor@test.invalid', TEST_PASSWORD, visitor.cookie).expect(200);
    expect(setCookies(asStaff).some((c) => /^ww_account=;.*Max-Age=0/.test(c))).toBe(true);
    await http().get('/api/v1/account/me').set('Cookie', visitor.cookie).expect(401);

    const staffCookie = cookieHeader(setCookies(asStaff));
    const asVisitor = await signIn('both@example.invalid', PASSWORD, staffCookie).expect(200);
    expect(setCookies(asVisitor).some((c) => /^ww_session=;.*Max-Age=0/.test(c))).toBe(true);
    await http().get('/api/v1/staff/auth/me').set('Cookie', staffCookie).expect(401);
  });
});

describe('visitor sessions and staff sessions never mix', () => {
  it('every account route except sign-up answers 401 without a session, and with a staff session', async () => {
    const staff = await signIn('admin@test.invalid', TEST_PASSWORD).expect(200);
    const staffCookie = cookieHeader(setCookies(staff));
    const doc = buildOpenApi(app);
    const routes = Object.entries(doc.paths)
      .filter(([p]) => p.startsWith('/api/v1/account/') && p !== '/api/v1/account/sign-up')
      .flatMap(([p, item]) => (['get', 'post', 'put', 'patch', 'delete'] as const).filter((m) => (item as Record<string, unknown>)[m]).map((m) => ({ m, p })));
    expect(routes.map((r) => `${r.m} ${r.p}`).sort()).toEqual([
      'get /api/v1/account/me',
      'post /api/v1/account/delete',
      'post /api/v1/account/logout',
      'post /api/v1/account/password',
    ]);
    for (const { m, p } of routes) {
      for (const cookie of [undefined, staffCookie]) {
        const t = http()[m](p).set('Origin', ORIGIN).set('x-csrf-token', staff.body.csrfToken as string);
        const res = await (cookie ? t.set('Cookie', cookie) : t).send({});
        expect({ route: `${m} ${p}`, staff: !!cookie, status: res.status }).toEqual({ route: `${m} ${p}`, staff: !!cookie, status: 401 });
      }
    }
  });

  it('a visitor session gets 401 on staff routes', async () => {
    const visitor = await signUp('not-staff@example.invalid');
    for (const p of ['/api/v1/staff/auth/me', '/api/v1/staff/species', '/api/v1/staff/users']) {
      await http().get(p).set('Cookie', visitor.cookie).expect(401);
    }
    await authed(http().post('/api/v1/staff/species'), visitor).send({}).expect(401);
  });
});

describe('account mutations', () => {
  it('need the CSRF header that matches the session, and an allowed Origin', async () => {
    const v = await signUp('csrf@example.invalid');
    await http().post('/api/v1/account/logout').set('Origin', ORIGIN).set('Cookie', v.cookie).expect(403);
    await http().post('/api/v1/account/logout').set('Origin', ORIGIN).set('Cookie', v.cookie).set('x-csrf-token', 'forged').expect(403);
    await http().post('/api/v1/account/logout').set('Origin', 'https://evil.example').set('Cookie', v.cookie).set('x-csrf-token', v.csrf).expect(403);
    await http().get('/api/v1/account/me').set('Cookie', v.cookie).expect(200); // still signed in
  });

  it('logout deletes the session', async () => {
    const v = await signUp('logout@example.invalid');
    const res = await authed(http().post('/api/v1/account/logout'), v).expect(200);
    expect(setCookies(res).some((c) => /^ww_account=;.*Max-Age=0/.test(c))).toBe(true);
    await http().get('/api/v1/account/me').set('Cookie', v.cookie).expect(401);
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM public_sessions s JOIN public_users u ON u.id = s.user_id WHERE u.email = 'logout@example.invalid'`);
    expect(rows[0].n).toBe(0);
  });

  it('changing the password checks the current one, ends the other sessions and keeps this one', async () => {
    const v = await signUp('change@example.invalid');
    const other = cookieHeader(setCookies(await signIn('change@example.invalid', PASSWORD).expect(200)));
    const NEW = 'a different visitor passphrase';
    const wrong = await authed(http().post('/api/v1/account/password'), v).send({ currentPassword: 'not it, not it', newPassword: NEW }).expect(422);
    expect(wrong.body.error.code).toBe('WRONG_PASSWORD');
    expect((await authed(http().post('/api/v1/account/password'), v).send({ currentPassword: PASSWORD, newPassword: 'short' }).expect(422)).body.error.code).toBe('WEAK_PASSWORD');
    expect((await authed(http().post('/api/v1/account/password'), v).send({ currentPassword: PASSWORD, newPassword: PASSWORD }).expect(422)).body.error.code).toBe('SAME_PASSWORD');

    await authed(http().post('/api/v1/account/password'), v).send({ currentPassword: PASSWORD, newPassword: NEW }).expect(200);
    await http().get('/api/v1/account/me').set('Cookie', v.cookie).expect(200);
    await http().get('/api/v1/account/me').set('Cookie', other).expect(401);
    await signIn('change@example.invalid', PASSWORD).expect(401);
    await signIn('change@example.invalid', NEW).expect(200);
  });

  it('deleting the account needs the password, then removes it and every session at once', async () => {
    const v = await signUp('delete@example.invalid');
    const other = cookieHeader(setCookies(await signIn('delete@example.invalid', PASSWORD).expect(200)));
    expect((await authed(http().post('/api/v1/account/delete'), v).send({ password: 'not the password' }).expect(422)).body.error.code).toBe('WRONG_PASSWORD');
    await http().get('/api/v1/account/me').set('Cookie', v.cookie).expect(200);

    const res = await authed(http().post('/api/v1/account/delete'), v).send({ password: PASSWORD }).expect(200);
    expect(setCookies(res).some((c) => /^ww_account=;.*Max-Age=0/.test(c))).toBe(true);
    await http().get('/api/v1/account/me').set('Cookie', v.cookie).expect(401);
    await http().get('/api/v1/account/me').set('Cookie', other).expect(401);
    await signIn('delete@example.invalid', PASSWORD).expect(401);
    const { rows } = await pool.query(`SELECT (SELECT count(*) FROM public_users WHERE email = 'delete@example.invalid')::int AS users, (SELECT count(*) FROM public_sessions)::int AS sessions`);
    expect(rows[0].users).toBe(0);
    // The address can be used again.
    await signUp('delete@example.invalid');
  });

  it('a session ends after 7 days idle and after 30 days in any case', async () => {
    const idle = await signUp('idle@example.invalid');
    await pool.query(`UPDATE public_sessions s SET last_seen_at = now() - interval '8 days' FROM public_users u WHERE u.id = s.user_id AND u.email = 'idle@example.invalid'`);
    await http().get('/api/v1/account/me').set('Cookie', idle.cookie).expect(401);
    const old = await signUp('old@example.invalid');
    await pool.query(`UPDATE public_sessions s SET expires_at = now() - interval '1 minute' FROM public_users u WHERE u.id = s.user_id AND u.email = 'old@example.invalid'`);
    await http().get('/api/v1/account/me').set('Cookie', old.cookie).expect(401);
  });
});

describe('database rules (0008)', () => {
  it('an email is a staff account or a visitor account, never both', async () => {
    await expectPgError(pool.query(`INSERT INTO public_users (email, name, password_hash) VALUES ('admin@test.invalid', 'Copy', 'x')`), '23505');
    await signUp('visitor-only@example.invalid');
    await expectPgError(pool.query(`INSERT INTO staff_users (email, name) VALUES ('Visitor-Only@example.invalid', 'Copy')`), '23505');
    await expectPgError(pool.query(`UPDATE staff_users SET email = 'visitor-only@example.invalid' WHERE email = 'editor@test.invalid'`), '23505');
  });

  it('emails are stored in lower case and names trimmed', async () => {
    await expectPgError(pool.query(`INSERT INTO public_users (email, name, password_hash) VALUES ('Upper@example.invalid', 'Name', 'x')`), '23514');
    await expectPgError(pool.query(`INSERT INTO public_users (email, name, password_hash) VALUES ('trim@example.invalid', ' Name', 'x')`), '23514');
    await expectPgError(pool.query(`INSERT INTO public_users (email, name, password_hash) VALUES ('empty@example.invalid', '', 'x')`), '23514');
  });

  it('a staff invite refuses an address that has a visitor account', async () => {
    await signUp('invitee@example.invalid');
    const admin = await signIn('admin@test.invalid', TEST_PASSWORD).expect(200);
    const res = await http()
      .post('/api/v1/staff/users')
      .set('Origin', ORIGIN)
      .set('Cookie', cookieHeader(setCookies(admin)))
      .set('x-csrf-token', admin.body.csrfToken as string)
      .send({ email: 'Invitee@example.invalid', name: 'Invitee', role: 'editor' })
      .expect(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });
});
