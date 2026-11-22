#!/usr/bin/env node
/**
 * Submits and publishes every species whose newest revision is an unpublished draft, through the normal
 * staff API (checklist, audit log and revalidation all run). Use it after an import.
 *
 *   ADMIN_PASSWORD='…' node scripts/publish-drafts.mjs            # do it
 *   ADMIN_PASSWORD='…' node scripts/publish-drafts.mjs --dry-run  # only list what would be published
 *   … --only=slug-a,slug-b                                         # limit to these species
 *
 * Reads ADMIN_EMAIL and WEB_ORIGIN from .env. API_URL defaults to http://localhost:4000/api/v1.
 * The password is only read from the environment and never written anywhere.
 */
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^["']|["']$/g, '')]),
);
const API = process.env.API_URL ?? `http://localhost:${env.PORT ?? 4000}/api/v1`;
const ORIGIN = process.env.WEB_ORIGIN ?? env.WEB_ORIGIN;
const EMAIL = process.env.ADMIN_EMAIL ?? env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const DRY = process.argv.includes('--dry-run');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
if (!PASSWORD) {
  console.error('Set ADMIN_PASSWORD in the environment (it is not stored anywhere).');
  process.exit(1);
}

let cookie = '';
let csrf = '';
async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', origin: ORIGIN, cookie, ...(csrf ? { 'x-csrf-token': csrf } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
  return { res, json: text ? JSON.parse(text) : null };
}

const login = await call('POST', '/staff/auth/login', { email: EMAIL, password: PASSWORD });
cookie = login.res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
csrf = login.json.csrfToken;

const species = (await call('GET', '/staff/species')).json;
let published = 0;
const failed = [];
for (const s of species) {
  const newest = [...s.revisions].sort((a, b) => b.version - a.version)[0];
  if (ONLY && !ONLY.includes(s.slug)) continue;
  if (!newest || newest.isPublished || !['draft', 'submitted'].includes(newest.state)) continue;
  console.log(`${DRY ? 'would publish' : 'publishing'} ${s.slug} v${newest.version}`);
  if (DRY) continue;
  try {
    if (newest.state === 'draft') await call('POST', `/staff/revisions/${newest.id}/submit`);
    await call('POST', `/staff/revisions/${newest.id}/publish`);
    published++;
  } catch (e) {
    failed.push(`${s.slug}: ${e.message}`);
  }
}
await call('POST', '/staff/auth/logout').catch(() => {});
console.log(DRY ? 'dry run: nothing changed' : `published ${published}; failed ${failed.length}`);
for (const f of failed) console.log('  ' + f);
if (failed.length) process.exitCode = 1;
