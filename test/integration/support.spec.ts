/**
 * M3 support directory: public directory, profile "How can I help?", admin-only management, immediate
 * disabling without a new revision, and re-review after edits. SYNTHETIC fixtures (example.org links).
 */
import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { createApp } from '../../src/bootstrap';
import { seedFixtures } from '../../src/cli/seed-fixtures';
import { seedRegions } from '../../src/cli/seed-regions';
import { FIXTURE_LINKS, FIXTURE_ORGANIZATION } from '../../src/fixtures/dev-fixtures';
import { Auth, authed, createStaff, freshDatabase, login } from '../helpers';

let app: INestApplication;
let pool: Pool;
let admin: Auth;
let editor: Auth;
const http = () => request(app.getHttpServer());
const loginReq = () => http().post('/api/v1/staff/auth/login');
const profileLinks = async () => (await http().get('/api/v1/species/fictus-captivus').expect(200)).body.support as Array<{ url: string }>;
const directoryUrls = async () =>
  ((await http().get('/api/v1/support').expect(200)).body.organizations as Array<{ links: Array<{ url: string }> }>).flatMap((o) => o.links.map((l) => l.url));
const linkId = async (url: string) => (await pool.query(`SELECT id FROM support_links WHERE url = $1`, [url])).rows[0].id as string;

beforeAll(async () => {
  pool = await freshDatabase();
  app = await createApp();
  await app.init();
  await seedRegions(pool);
  await seedFixtures(app);
  await createStaff(pool, 'admin', 'support-admin@test.invalid');
  await createStaff(pool, 'editor', 'support-editor@test.invalid');
  admin = await login(loginReq, 'support-admin@test.invalid');
  editor = await login(loginReq, 'support-editor@test.invalid');
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('GET /support', () => {
  it('lists approved organizations with approved links, their domains and the published species that show them', async () => {
    const body = (await http().get('/api/v1/support').expect(200)).body;
    expect(body.organizations).toHaveLength(1);
    expect(body.organizations[0]).toMatchObject({
      slug: FIXTURE_ORGANIZATION.slug, name: FIXTURE_ORGANIZATION.name, websiteDomain: 'example.org', reviewedAt: expect.any(String),
      links: [
        {
          url: FIXTURE_LINKS.volunteer.url, domain: 'example.org', actionType: 'volunteer',
          species: [{ slug: 'fictus-captivus', scientificName: 'Fictus captivus', commonName: 'Captive example lizard (fixture)' }],
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain('old-appeal'); // the disabled link
  });

  it('the profile shows only the approved link, with its destination domain', async () => {
    const res = (await http().get('/api/v1/species/fictus-captivus').expect(200)).body;
    expect(res.support).toEqual([expect.objectContaining({ url: FIXTURE_LINKS.volunteer.url, domain: 'example.org', organizationName: FIXTURE_ORGANIZATION.name })]);
  });
});

describe('staff support directory', () => {
  it('editors may read but not change the directory', async () => {
    const list = await authed(http().get('/api/v1/staff/organizations'), editor).expect(200);
    expect(list.body[0].links).toHaveLength(2);
    const body = { slug: 'editor-org', name: 'Editor org', website: 'https://example.org', description: 'SYNTHETIC test organization.' };
    const res = await authed(http().post('/api/v1/staff/organizations'), editor).send(body).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    await authed(http().post(`/api/v1/staff/support-links/${await linkId(FIXTURE_LINKS.volunteer.url)}/disable`), editor).expect(403);
  });

  it('only https URLs are accepted', async () => {
    const body = { slug: 'plain-http-org', name: 'Plain HTTP org', website: 'http://example.org', description: 'SYNTHETIC test organization.' };
    await authed(http().post('/api/v1/staff/organizations'), admin).send(body).expect(400);
  });

  it('a new organization and link stay hidden until an admin approves both', async () => {
    const org = (
      await authed(http().post('/api/v1/staff/organizations'), admin)
        .send({ slug: 'second-example-fixture', name: 'Second example (fixture)', website: 'https://example.net', description: 'SYNTHETIC test organization.' })
        .expect(201)
    ).body;
    expect(org.reviewStatus).toBe('pending');
    const link = (
      await authed(http().post('/api/v1/staff/support-links'), admin)
        .send({ organizationId: org.id, url: 'https://example.net/learn', actionType: 'learn', description: 'SYNTHETIC test link for review.' })
        .expect(201)
    ).body;
    expect(link.editorialStatus).toBe('pending');
    await authed(http().post(`/api/v1/staff/support-links/${link.id}/approve`), admin).expect(200);
    expect(await directoryUrls()).not.toContain('https://example.net/learn'); // organization still pending
    await authed(http().post(`/api/v1/staff/organizations/${org.id}/approve`), admin).expect(200);
    expect(await directoryUrls()).toContain('https://example.net/learn');
  });

  it('disabling a link hides it at once, is audited and creates no species revision; re-enabling needs review', async () => {
    const id = await linkId(FIXTURE_LINKS.volunteer.url);
    const revisionsBefore = (await pool.query(`SELECT count(*)::int AS n FROM species_revisions`)).rows[0].n;

    await authed(http().post(`/api/v1/staff/support-links/${id}/disable`), admin).expect(200);
    expect(await profileLinks()).toEqual([]);
    expect(await directoryUrls()).not.toContain(FIXTURE_LINKS.volunteer.url);
    const audit = await pool.query(`SELECT action FROM audit_events WHERE entity_type = 'support_link' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1`, [id]);
    expect(audit.rows[0].action).toBe('support_link.disable');
    expect((await pool.query(`SELECT count(*)::int AS n FROM species_revisions`)).rows[0].n).toBe(revisionsBefore);

    // Editing sends it to pending: still hidden until approved again.
    const edited = await authed(http().put(`/api/v1/staff/support-links/${id}`), admin)
      .send({ url: FIXTURE_LINKS.volunteer.url, actionType: 'volunteer', description: 'SYNTHETIC fixture link, edited and re-reviewed.' })
      .expect(200);
    expect(edited.body.editorialStatus).toBe('pending');
    expect(await profileLinks()).toEqual([]);
    await authed(http().post(`/api/v1/staff/support-links/${id}/approve`), admin).expect(200);
    expect((await profileLinks()).map((l) => l.url)).toEqual([FIXTURE_LINKS.volunteer.url]);
  });

  it('disabling an organization hides all of its links', async () => {
    const org = (await pool.query(`SELECT id FROM organizations WHERE slug = $1`, [FIXTURE_ORGANIZATION.slug])).rows[0].id;
    await authed(http().post(`/api/v1/staff/organizations/${org}/disable`), admin).expect(200);
    expect(await profileLinks()).toEqual([]);
    expect(await directoryUrls()).not.toContain(FIXTURE_LINKS.volunteer.url);
  });

  it('404s for unknown ids', async () => {
    await authed(http().post('/api/v1/staff/support-links/00000000-0000-4000-8000-000000000000/approve'), admin).expect(404);
  });
});
