import express from 'express';
import helmet from 'helmet';
import request from 'supertest';
import { apiHelmetOptions } from '../../src/bootstrap';
import { loadConfig } from '../../src/config';

/** M5: API response headers (DECISIONS D-029) and the trust-proxy setting (D-030). */
function appWith(production: boolean) {
  const app = express();
  app.use(helmet(apiHelmetOptions(production)));
  app.get('/x', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('API security headers', () => {
  it('production: a CSP that allows nothing, no HSTS (Nginx owns it), framing denied, nosniff', async () => {
    const res = await request(appWith(true)).get('/x').expect(200);
    expect(res.headers['content-security-policy']).toBe("default-src 'none';frame-ancestors 'none';base-uri 'none';form-action 'none'");
    expect(res.headers['strict-transport-security']).toBeUndefined();
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('non-production keeps a CSP that lets Swagger UI load its own scripts, still without HSTS', async () => {
    const res = await request(appWith(false)).get('/x').expect(200);
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });
});

describe('TRUST_PROXY', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/d' };
  it('defaults to loopback and accepts the private-network values', () => {
    expect(loadConfig(base).TRUST_PROXY).toBe('loopback');
    expect(loadConfig({ ...base, TRUST_PROXY: 'loopback,uniquelocal' }).TRUST_PROXY).toBe('loopback,uniquelocal');
  });
  it.each(['true', '*', '0.0.0.0/0', 'loopback, 10.0.0.0/8'])('refuses %s (it would let any client forge its address)', (v) => {
    expect(() => loadConfig({ ...base, TRUST_PROXY: v })).toThrow(/TRUST_PROXY/);
  });
});

describe('loadDotEnv', () => {
  it("never reads a developer's .env during tests (fresh-clone finding, M5)", async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { loadDotEnv } = await import('../../src/common/load-env');
    const dir = mkdtempSync(join(tmpdir(), 'wildward-env-'));
    writeFileSync(join(dir, '.env'), 'WILDWARD_LEAK_PROBE=leaked\n');
    const cwd = process.cwd();
    try {
      process.chdir(dir);
      loadDotEnv();
      expect(process.env.WILDWARD_LEAK_PROBE).toBeUndefined();
    } finally {
      process.chdir(cwd);
    }
  });
});
