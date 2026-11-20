/**
 * M2 public catalogue: list (search, filters, sort, paging), filter counts, related species and compare.
 * Uses the synthetic fixtures (src/fixtures/dev-fixtures.ts) published through the real workflow.
 */
import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { createApp } from '../../src/bootstrap';
import { seedFixtures } from '../../src/cli/seed-fixtures';
import { seedRegions } from '../../src/cli/seed-regions';
import { EditorialService } from '../../src/editorial/editorial.service';
import type { StaffPrincipal } from '../../src/identity/session.service';
import { freshDatabase } from '../helpers';

let app: INestApplication;
let pool: Pool;
const http = () => request(app.getHttpServer());
const slugs = async (qs: string) => {
  const res = await http().get(`/api/v1/species${qs}`).expect(200);
  return (res.body.items as Array<{ slug: string }>).map((i) => i.slug);
};

beforeAll(async () => {
  pool = await freshDatabase();
  app = await createApp();
  await app.init();
  await seedRegions(pool);
  await seedFixtures(app);

  // Unpublished work that must never appear publicly:
  const editorial = app.get(EditorialService);
  const { rows } = await pool.query(`SELECT id, name, email FROM staff_users WHERE email = 'fixtures@example.invalid'`);
  const staff: StaffPrincipal = { id: rows[0].id, name: rows[0].name, email: rows[0].email, role: 'admin', sessionId: 't', csrfToken: 't' };
  // 1. a species that only has a draft
  await editorial.createSpecies(staff, { slug: 'fictus-draftonly', acceptedScientificName: 'Fictus draftonly', rank: 'species', displayGroup: 'coral' });
  // 2. a draft edit of a published species that renames it and moves it to another group
  const marinus = (await pool.query(`SELECT id FROM species WHERE slug = 'fictus-marinus'`)).rows[0].id;
  const draft = await editorial.createDraft(staff, marinus);
  await editorial.saveDraft(staff, draft.id, {
    ...draft.content,
    displayGroup: 'coral',
    names: [{ language: 'en', name: 'Leaky draft name', nameType: 'common', preferred: true }],
    expectedUpdatedAt: draft.updatedAt,
  });
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('GET /species', () => {
  it('lists only published species, sorted by name by default, with page metadata', async () => {
    const res = await http().get('/api/v1/species').expect(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 24, total: 6, totalPages: 1 });
    expect(res.body.items.map((i: { slug: string }) => i.slug)).toEqual([
      'fictus-captivus', // Captive example lizard
      'fictus-exemplaris', // Example beast
      'fictus-marinus', // Example reef fish
      'fictus-generalis', // Generalized example beetle
      'fictus-occultus', // Hidden example frog
      'fictus-regionalis', // Regional example bird
    ]);
  });

  it('never shows drafts: no draft-only species, and published cards ignore pending draft edits', async () => {
    expect(await slugs('?q=draftonly')).toEqual([]);
    expect(await slugs('?q=leaky')).toEqual([]);
    expect(await slugs('?group=coral')).toEqual([]);
    const card = (await http().get('/api/v1/species?q=reef').expect(200)).body.items[0];
    expect(card).toMatchObject({ slug: 'fictus-marinus', commonName: 'Example reef fish (fixture)', displayGroup: 'fish' });
  });

  it('searches common names, scientific names and synonyms by word prefix', async () => {
    expect(await slugs('?q=reef')).toEqual(['fictus-marinus']);
    expect(await slugs('?q=fictus%20capt')).toEqual(['fictus-captivus']);
    expect(await slugs('?q=Occultus')).toEqual(['fictus-occultus']);
    expect(await slugs('?q=antiq')).toEqual(['fictus-regionalis']); // synonym "Fictus antiquus"
    expect(await slugs('?q=%26%7C!:*')).toHaveLength(6); // punctuation only: no tsquery injection, no filter
  });

  it('filters by group and environment; values within a filter are OR, filters are AND', async () => {
    expect(await slugs('?group=bird')).toEqual(['fictus-regionalis']);
    expect(await slugs('?group=bird,fish')).toEqual(['fictus-marinus', 'fictus-regionalis']);
    expect(await slugs('?environment=marine')).toEqual(['fictus-marinus']);
    expect(await slugs('?environment=freshwater')).toEqual(['fictus-occultus', 'fictus-regionalis']);
    expect(await slugs('?environment=freshwater&group=bird')).toEqual(['fictus-regionalis']);
  });

  it('filters category and trend on the headline (global) assessment, not on regional ones', async () => {
    expect(await slugs('?category=CR,EN')).toEqual(['fictus-captivus', 'fictus-exemplaris']);
    expect(await slugs('?category=LC')).toEqual(['fictus-regionalis']);
    expect(await slugs('?category=VU')).toEqual([]); // the VU assessment of fictus-regionalis is regional
    expect(await slugs('?trend=decreasing')).toEqual(['fictus-captivus', 'fictus-exemplaris']);
  });

  it('filters by region and habitat, and never finds a location-sensitive species by place', async () => {
    expect(await slugs('?region=norway')).toEqual(['fictus-regionalis']);
    expect(await slugs('?region=fiji')).toEqual(['fictus-marinus']);
    expect(await slugs('?region=peru')).toEqual([]); // fictus-occultus lives there but is hide_regions
    expect(await slugs('?habitat=fx-wetland')).toEqual(['fictus-occultus', 'fictus-regionalis']);
  });

  it('sorts by status severity (DD and unassessed last) and by most recently reviewed', async () => {
    expect(await slugs('?sort=status')).toEqual(['fictus-captivus', 'fictus-exemplaris', 'fictus-generalis', 'fictus-regionalis', 'fictus-marinus', 'fictus-occultus']);
    expect((await slugs('?sort=reviewed'))[0]).toBe('fictus-occultus'); // the last fixture published
  });

  it('pages results', async () => {
    const p2 = (await http().get('/api/v1/species?pageSize=2&page=2').expect(200)).body;
    expect(p2).toMatchObject({ page: 2, pageSize: 2, total: 6, totalPages: 3 });
    expect(p2.items.map((i: { slug: string }) => i.slug)).toEqual(['fictus-marinus', 'fictus-generalis']);
    expect((await http().get('/api/v1/species?pageSize=2&page=9').expect(200)).body.items).toEqual([]);
  });

  it('rejects invalid input with 400: pageSize above 48, unknown values, unknown parameters, population sort', async () => {
    await http().get('/api/v1/species?pageSize=49').expect(400);
    await http().get('/api/v1/species?group=dragon').expect(400);
    await http().get('/api/v1/species?sort=population').expect(400);
    await http().get('/api/v1/species?colour=red').expect(400);
    await http().get('/api/v1/species?region=Not%20A%20Slug').expect(400);
  });

  it('cards carry the headline status, explicit "Not assessed" and withheld locations', async () => {
    const all = (await http().get('/api/v1/species').expect(200)).body.items as Array<Record<string, unknown>>;
    const by = (s: string) => all.find((i) => i.slug === s)!;
    expect(by('fictus-regionalis')).toMatchObject({ status: { category: 'LC', scope: 'global', assessedOn: '2020-03-01' }, regionCount: 2, locationWithheld: false });
    expect(by('fictus-occultus')).toMatchObject({ status: null, notAssessed: true, regionCount: null, locationWithheld: true });
  });
});

describe('GET /filters', () => {
  it('counts published species per option and hides sensitive locations', async () => {
    const f = (await http().get('/api/v1/filters').expect(200)).body;
    expect(f.total).toBe(6);
    expect(f.threatened).toBe(2);
    expect(f.groups.find((g: { value: string }) => g.value === 'bird').count).toBe(1);
    expect(f.groups.find((g: { value: string }) => g.value === 'coral').count).toBe(0); // the draft does not count
    expect(f.categories.find((c: { value: string }) => c.value === 'VU').count).toBe(0);
    expect(f.regions.map((r: { slug: string }) => r.slug)).not.toContain('peru');
    expect(f.regions.map((r: { slug: string }) => r.slug)).toContain('fiji');
  });
});

describe('related species', () => {
  it('relates by shared threat, group or region, excluding itself', async () => {
    const p = (await http().get('/api/v1/species/fictus-exemplaris').expect(200)).body;
    expect(p.related.map((r: { slug: string }) => r.slug)).toEqual(['fictus-regionalis']); // shares a threat
  });

  it('never relates a location-sensitive species by region', async () => {
    const p = (await http().get('/api/v1/species/fictus-occultus').expect(200)).body;
    expect(p.related.map((r: { slug: string }) => r.slug)).toEqual(['fictus-captivus']); // shared threat only
  });
});

describe('GET /compare', () => {
  it('rejects 0 or more than 3 species with 400 and unknown species with 404', async () => {
    await http().get('/api/v1/compare').expect(400);
    await http().get('/api/v1/compare?species=a,b,c,d').expect(400);
    const res = await http().get('/api/v1/compare?species=fictus-captivus,fictus-draftonly').expect(404);
    expect(res.body.error.details).toEqual(['fictus-draftonly']);
  });

  it('returns profiles in the requested order and states population comparability', async () => {
    const same = (await http().get('/api/v1/compare?species=fictus-regionalis,fictus-captivus').expect(200)).body;
    expect(same.species.map((s: { slug: string }) => s.slug)).toEqual(['fictus-regionalis', 'fictus-captivus']);
    expect(same.population).toMatchObject({ status: 'same_basis', basis: 'mature_individuals' });

    const mixed = (await http().get('/api/v1/compare?species=fictus-regionalis,fictus-occultus').expect(200)).body;
    expect(mixed.population.status).toBe('not_directly_comparable');
    expect(mixed.population.message).toMatch(/different units/);

    const unknown = (await http().get('/api/v1/compare?species=fictus-exemplaris,fictus-regionalis,fictus-marinus').expect(200)).body;
    expect(unknown.population.status).toBe('unknown');
    expect(unknown.population.message).toMatch(/Example beast.*Example reef fish/);
  });

  it('serves the same revision as the profile (revision consistency)', async () => {
    const cmp = (await http().get('/api/v1/compare?species=fictus-marinus').expect(200)).body.species[0];
    const profile = (await http().get('/api/v1/species/fictus-marinus').expect(200)).body;
    expect(cmp).toEqual(profile);
  });
});
