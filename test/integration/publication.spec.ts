/**
 * The M1 gate (PLAN §12): draft → submit → publish, draft leakage, concurrent publish conflict, the
 * publication checklist, attribution snapshots, sensitive geography and revalidation.
 * Real app, real PostgreSQL + PostGIS. All taxa are synthetic.
 */
import { INestApplication } from '@nestjs/common';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { Pool } from 'pg';
import request from 'supertest';
import { createApp } from '../../src/bootstrap';
import { seedFixtures } from '../../src/cli/seed-fixtures';
import { seedRegions } from '../../src/cli/seed-regions';
import { Auth, authed, createStaff, freshDatabase, login } from '../helpers';

let app: INestApplication;
let pool: Pool;
let admin: Auth;
let editor: Auth;
let sourceId: string;
const http = () => request(app.getHttpServer());
const loginReq = () => http().post('/api/v1/staff/auth/login');
const pub = (slug: string) => http().get(`/api/v1/species/${slug}`);

/** Minimal content that passes the publication checklist. */
const content = (overview: string) => ({
  displayGroup: 'mammal',
  editorial: { overview, population: { unknown: true } },
  names: [{ language: 'en', name: 'Synthetic test animal', nameType: 'common', preferred: true }],
  environments: ['terrestrial'],
  assessments: [{ sourceId, scope: 'global', category: 'VU', trend: 'unknown', assessedOn: '2020-01-01' }],
  populationEstimates: [],
  regions: [],
  ranges: [],
  habitats: [],
  threats: [],
  citations: [{ sectionKey: 'overview', sourceId }],
  media: [],
  supportLinks: [],
});

type Rev = { id: string; speciesId: string; updatedAt: string; state: string };

async function save(auth: Auth, rev: Rev, body: object, status = 200): Promise<Rev> {
  const res = await authed(http().put(`/api/v1/staff/revisions/${rev.id}`), auth).send({ ...body, expectedUpdatedAt: rev.updatedAt });
  expect(res.status).toBe(status);
  return res.body;
}
const submit = (auth: Auth, id: string) => authed(http().post(`/api/v1/staff/revisions/${id}/submit`), auth);
const publish = (auth: Auth, id: string) => authed(http().post(`/api/v1/staff/revisions/${id}/publish`), auth);
const newDraft = async (auth: Auth, speciesId: string): Promise<Rev> =>
  (await authed(http().post(`/api/v1/staff/species/${speciesId}/drafts`), auth).expect(201)).body;

/** Creates a species and publishes v1 with the given overview. */
async function publishedSpecies(slug: string, overview: string): Promise<Rev> {
  const draft: Rev = (
    await authed(http().post('/api/v1/staff/species'), editor)
      .send({ slug, acceptedScientificName: 'Fictus testus', rank: 'species', displayGroup: 'mammal' })
      .expect(201)
  ).body;
  await authed(http().post(`/api/v1/staff/species/${draft.speciesId}/identifiers`), editor).send({ provider: 'fixture', externalId: slug }).expect(201);
  const saved = await save(editor, draft, content(overview));
  await submit(editor, saved.id).expect(200);
  await publish(admin, saved.id).expect(200);
  return saved;
}

beforeAll(async () => {
  pool = await freshDatabase();
  app = await createApp();
  await app.init();
  await createStaff(pool, 'admin', 'admin@test.invalid');
  await createStaff(pool, 'editor', 'editor@test.invalid');
  admin = await login(loginReq, 'admin@test.invalid');
  editor = await login(loginReq, 'editor@test.invalid');
  sourceId = (await authed(http().post('/api/v1/staff/sources'), editor).send({ title: 'Synthetic source for tests' }).expect(201)).body.id;
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('draft → submit → publish', () => {
  it('an unpublished species is not public', async () => {
    await authed(http().post('/api/v1/staff/species'), editor)
      .send({ slug: 'fictus-unpublished', acceptedScientificName: 'Fictus unpublished', rank: 'species', displayGroup: 'bird' })
      .expect(201);
    await pub('fictus-unpublished').expect(404);
  });

  it('publishes v1, records the reviewer role and does not mark admin review of an editor draft as self-review', async () => {
    await publishedSpecies('fictus-primus', 'Overview v1');
    const res = await pub('fictus-primus').expect(200);
    expect(res.body.overview).toBe('Overview v1');
    expect(res.body.review).toMatchObject({ version: 1, reviewerRole: 'admin', selfReviewed: false });
    expect(res.body.population).toEqual({ estimates: [], unknown: true, unknownNote: null });
    expect(res.body.sources.map((s: { id: string }) => s.id)).toContain(sourceId);
    expect(JSON.stringify(res.body)).not.toMatch(/@test\.invalid/); // no staff emails in public output
  });

  it('a draft edit does not change public output; publishing it does (draft leakage)', async () => {
    const v1 = await publishedSpecies('fictus-secundus', 'Published overview');
    const before = (await pub('fictus-secundus').expect(200)).body;

    const draft = await newDraft(editor, v1.speciesId);
    expect(draft).toMatchObject({ state: 'draft', baseRevisionId: v1.id });
    expect((draft as unknown as { content: { editorial: { overview: string } } }).content.editorial.overview).toBe('Published overview');
    const saved = await save(editor, draft, content('DRAFT overview, not yet public'));
    expect((await pub('fictus-secundus').expect(200)).body).toEqual(before);

    await submit(editor, saved.id).expect(200);
    expect((await pub('fictus-secundus').expect(200)).body).toEqual(before);

    await publish(admin, saved.id).expect(200);
    const after = (await pub('fictus-secundus').expect(200)).body;
    expect(after.overview).toBe('DRAFT overview, not yet public');
    expect(after.review.version).toBe(2);
  });

  it('marks an admin publishing their own draft as self-reviewed', async () => {
    const d: Rev = (
      await authed(http().post('/api/v1/staff/species'), admin)
        .send({ slug: 'fictus-solo', acceptedScientificName: 'Fictus solo', rank: 'species', displayGroup: 'fish' })
        .expect(201)
    ).body;
    await authed(http().post(`/api/v1/staff/species/${d.speciesId}/identifiers`), admin).send({ provider: 'fixture', externalId: 'solo' }).expect(201);
    const saved = await save(admin, d, content('Solo admin overview'));
    await submit(admin, saved.id).expect(200);
    await publish(admin, saved.id).expect(200);
    expect((await pub('fictus-solo').expect(200)).body.review.selfReviewed).toBe(true);
  });

  it('submitted and published revisions cannot be edited', async () => {
    const v1 = await publishedSpecies('fictus-frozen', 'Frozen');
    const res = await authed(http().put(`/api/v1/staff/revisions/${v1.id}`), editor).send({ ...content('Changed'), expectedUpdatedAt: v1.updatedAt }).expect(409);
    expect(res.body.error.code).toBe('NOT_DRAFT');
  });

  it('rejects a draft save based on a stale read', async () => {
    const v1 = await publishedSpecies('fictus-stale', 'Stale test');
    const draft = await newDraft(editor, v1.speciesId);
    await save(editor, draft, content('First save'));
    const res = await authed(http().put(`/api/v1/staff/revisions/${draft.id}`), editor).send({ ...content('Second save'), expectedUpdatedAt: draft.updatedAt }).expect(409);
    expect(res.body.error.code).toBe('STALE_DRAFT');
  });
});

describe('concurrent publish', () => {
  it('two drafts from the same published revision: exactly one publishes, the other gets 409', async () => {
    const v1 = await publishedSpecies('fictus-race', 'Race v1');
    const a = await save(editor, await newDraft(editor, v1.speciesId), content('Race A'));
    const b = await save(editor, await newDraft(editor, v1.speciesId), content('Race B'));
    await submit(editor, a.id).expect(200);
    await submit(editor, b.id).expect(200);

    const results = await Promise.all([publish(admin, a.id), publish(admin, b.id)]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
    const loser = results.find((r) => r.status === 409)!;
    expect(loser.body.error.code).toBe('PUBLISH_CONFLICT');

    const winner = results.find((r) => r.status === 200)!.body as { content: { editorial: { overview: string } } };
    expect((await pub('fictus-race').expect(200)).body.overview).toBe(winner.content.editorial.overview);
  });

  it('publishing an already published revision is a conflict, not a second publish', async () => {
    const v1 = await publishedSpecies('fictus-twice', 'Twice');
    const res = await publish(admin, v1.id).expect(409);
    expect(res.body.error.code).toBe('NOT_SUBMITTED');
  });
});

describe('validation and the publication checklist', () => {
  it('blocks submit until a cited overview, status and population are present', async () => {
    const d: Rev = (
      await authed(http().post('/api/v1/staff/species'), editor)
        .send({ slug: 'fictus-incomplete', acceptedScientificName: 'Fictus incomplete', rank: 'species', displayGroup: 'insect' })
        .expect(201)
    ).body;
    const res = await submit(editor, d.id).expect(422);
    expect(res.body.error.code).toBe('CHECKLIST_FAILED');
    expect(res.body.error.details.join(' ')).toMatch(/overview/);
    // The provider identifier is advice, not a blocker (D-057), so it is never a reason for the refusal.
    expect(res.body.error.details.join(' ')).not.toMatch(/identifier/);
  });

  /** D-057: the owner publishes profiles before a GBIF or IUCN id is known. The checklist still asks for one. */
  it('publishes a species with no provider identifier, and reports the missing identifier as advice', async () => {
    const d: Rev = (
      await authed(http().post('/api/v1/staff/species'), editor)
        .send({ slug: 'fictus-noident', acceptedScientificName: 'Fictus sine nomine', rank: 'species', displayGroup: 'fish' })
        .expect(201)
    ).body;
    const saved = await save(editor, d, content('A synthetic species with no provider identifier.'));
    const detail = await authed(http().get(`/api/v1/staff/revisions/${saved.id}`), editor).expect(200);
    const identifier = (detail.body.checklist as Array<{ key: string; ok: boolean; blocking: boolean }>).find((c) => c.key === 'identifier');
    expect(identifier).toMatchObject({ ok: false, blocking: false });

    await submit(editor, saved.id).expect(200);
    await publish(admin, saved.id).expect(200);
    await pub('fictus-noident').expect(200);
  });

  it('rejects invalid editorial JSON at the boundary', async () => {
    const v1 = await publishedSpecies('fictus-badjson', 'Bad JSON');
    const draft = await newDraft(editor, v1.speciesId);
    const res = await authed(http().put(`/api/v1/staff/revisions/${draft.id}`), editor)
      .send({ ...content('x'), editorial: { overview: 'x', notAField: true }, expectedUpdatedAt: draft.updatedAt })
      .expect(400);
    expect(res.body.error.code).toBe('EDITORIAL_INVALID');
  });

  it('population CHECK constraints reject an incoherent estimate submitted through the API', async () => {
    const v1 = await publishedSpecies('fictus-badpop', 'Bad population');
    const draft = await newDraft(editor, v1.speciesId);
    const body = {
      ...content('x'),
      editorial: { overview: 'x' },
      populationEstimates: [{ sourceId, scope: 'global', context: 'wild', basis: 'mature_individuals', form: 'range', minValue: '500', maxValue: '10' }],
    };
    const res = await authed(http().put(`/api/v1/staff/revisions/${draft.id}`), editor).send({ ...body, expectedUpdatedAt: draft.updatedAt }).expect(422);
    expect(res.body.error.code).toBe('INTEGRITY_RULE');
    // "unknown" with a number is also rejected: unknown is never zero
    const res2 = await authed(http().put(`/api/v1/staff/revisions/${draft.id}`), editor)
      .send({ ...body, populationEstimates: [{ ...body.populationEstimates[0], form: 'unknown', minValue: null, maxValue: null, pointValue: '0' }], expectedUpdatedAt: draft.updatedAt })
      .expect(422);
    expect(res2.body.error.code).toBe('INTEGRITY_RULE');
  });
});

describe('attribution', () => {
  it('keeps the credit and licence snapshot when the media asset is edited later', async () => {
    const v1 = await publishedSpecies('fictus-photo', 'Photo test');
    const media = (
      await pool.query(
        `INSERT INTO media_assets (storage_key, mime, width, height, bytes, creator, credit, license, review_state, reviewed_at)
         VALUES ('test/photo.webp', 'image/webp', 800, 600, 1000, 'Test Creator', 'Photo: Test Creator', 'CC BY 4.0', 'approved', now()) RETURNING id`,
      )
    ).rows[0].id;
    const draft = await newDraft(editor, v1.speciesId);
    const saved = await save(editor, draft, { ...content('Photo test'), media: [{ mediaId: media, position: 0, role: 'primary', altText: 'A synthetic test image' }] });
    await submit(editor, saved.id).expect(200);
    await publish(admin, saved.id).expect(200);

    await pool.query(`UPDATE media_assets SET credit = 'Changed credit', license = 'CC BY-SA 4.0' WHERE id = $1`, [media]);
    const res = await pub('fictus-photo').expect(200);
    expect(res.body.media[0]).toMatchObject({ credit: 'Photo: Test Creator', license: 'CC BY 4.0', altText: 'A synthetic test image' });
  });

  it('blocks publishing an image whose licence is not on the allow-list', async () => {
    const v1 = await publishedSpecies('fictus-nc', 'NC test');
    // Since M4 the database refuses an *approved* NC image (0005_media_rules.sql), so it can only be pending.
    const media = (
      await pool.query(
        `INSERT INTO media_assets (storage_key, mime, width, height, bytes, creator, credit, license, review_state)
         VALUES ('test/nc.webp', 'image/webp', 800, 600, 1000, 'X', 'Photo: X', 'CC BY-NC 4.0', 'pending') RETURNING id`,
      )
    ).rows[0].id;
    await expect(pool.query(`UPDATE media_assets SET review_state = 'approved', reviewed_at = now() WHERE id = $1`, [media])).rejects.toMatchObject({ code: '23514' });
    const draft = await newDraft(editor, v1.speciesId);
    const saved = await save(editor, draft, { ...content('NC test'), media: [{ mediaId: media, position: 0, role: 'primary', altText: 'x' }] });
    const res = await submit(editor, saved.id).expect(422);
    expect(res.body.error.details.join(' ')).toMatch(/allow-listed licence/);
  });
});

describe('synthetic fixtures through the public API', () => {
  beforeAll(async () => {
    await seedRegions(pool);
    await seedFixtures(app);
  });

  it('withholds every region of a location-sensitive species', async () => {
    const res = await pub('fictus-occultus').expect(200);
    expect(res.body.geography).toMatchObject({ locationWithheld: true, regions: [] });
    expect(JSON.stringify(res.body)).not.toMatch(/peru/i);
    expect(res.body.status).toEqual({ assessments: [], notAssessed: true });
  });

  it('keeps wild and captive estimates separate, with counts as strings', async () => {
    const res = await pub('fictus-captivus').expect(200);
    const est = res.body.population.estimates as Array<Record<string, unknown>>;
    expect(est.map((e) => [e.context, e.basis, e.form])).toEqual([
      ['wild', 'mature_individuals', 'range'],
      ['captive', 'individuals', 'exact'],
    ]);
    expect(est[1].pointValue).toBe('412');
  });

  it('shows a regional assessment with its region, and breeding pairs as their own basis', async () => {
    const res = await pub('fictus-regionalis').expect(200);
    expect(res.body.status.assessments.map((a: { scope: string; region: { slug: string } | null }) => [a.scope, a.region?.slug ?? null])).toEqual([
      ['global', null],
      ['regional', 'norway'],
    ]);
    expect(res.body.population.estimates[1]).toMatchObject({ basis: 'breeding_pairs', form: 'at_least', minValue: '350', maxValue: null });
  });
});

describe('revalidation', () => {
  let server: Server;
  const received: Array<{ secret: string | undefined; tags: string[] }> = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received.push({ secret: req.headers['x-revalidate-secret'] as string, tags: JSON.parse(body).tags });
        res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    process.env.WEB_REVALIDATE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/revalidate`;
    process.env.REVALIDATE_SECRET = 'test-secret-that-is-long-enough';
  });
  afterAll(async () => {
    delete process.env.WEB_REVALIDATE_URL;
    delete process.env.REVALIDATE_SECRET;
    await new Promise((r) => server.close(r));
  });

  it('calls the web app with the species and catalogue tags after publish', async () => {
    await publishedSpecies('fictus-cache', 'Cache test');
    expect(received).toContainEqual({ secret: 'test-secret-that-is-long-enough', tags: ['species:fictus-cache', 'catalogue'] });
  });
});
