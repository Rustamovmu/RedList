/**
 * M3 gate: map API (bbox validation, antimeridian handling, layers, caps), region pages, and the guarantee that a
 * location-sensitive species' precise geometry never appears in any public response. Real PostGIS, SYNTHETIC fixtures.
 */
import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { createApp } from '../../src/bootstrap';
import { seedFixtures } from '../../src/cli/seed-fixtures';
import { seedRegions } from '../../src/cli/seed-regions';
import { RevisionContentDto } from '../../src/editorial/dto';
import { EditorialService } from '../../src/editorial/editorial.service';
import { GENERALIZATION_NOTE } from '../../src/geography/geo.repository';
import type { StaffPrincipal } from '../../src/identity/session.service';
import { freshDatabase } from '../helpers';

let app: INestApplication;
let pool: Pool;
let editorial: EditorialService;
let staff: StaffPrincipal;
let sourceId: string;
const http = () => request(app.getHttpServer());
const map = async (qs: string) => (await http().get(`/api/v1/map${qs}`).expect(200)).body;
const slugsOf = (m: { species: Array<{ slug: string }> }) => m.species.map((x) => x.slug);
const speciesId = async (slug: string) => (await pool.query(`SELECT id FROM species WHERE slug = $1`, [slug])).rows[0].id as string;

/** Every [lon, lat] in a GeoJSON coordinates array. */
function positions(coords: unknown): number[][] {
  return Array.isArray(coords) && typeof coords[0] === 'number' ? [coords as number[]] : (coords as unknown[]).flatMap(positions);
}

/** A publishable synthetic draft: overview with citation, unknown population, not assessed. */
const publishable = (ranges: RevisionContentDto['ranges']): RevisionContentDto => ({
  displayGroup: 'other_invertebrate',
  editorial: { overview: 'Synthetic test species for geometry limits. Not real.', population: { unknown: true }, status: { notAssessed: true } },
  names: [{ language: 'en', name: 'Large synthetic test snail', nameType: 'common', preferred: true }],
  environments: ['terrestrial'],
  assessments: [], populationEstimates: [], regions: [], ranges, habitats: [], threats: [],
  citations: [{ sectionKey: 'overview', sourceId }], media: [], supportLinks: [],
});

beforeAll(async () => {
  pool = await freshDatabase();
  app = await createApp();
  await app.init();
  await seedRegions(pool);
  await seedFixtures(app);
  editorial = app.get(EditorialService);
  const { rows } = await pool.query(`SELECT id, name, email FROM staff_users WHERE email = 'fixtures@example.invalid'`);
  staff = { id: rows[0].id, name: rows[0].name, email: rows[0].email, role: 'admin', sessionId: 't', csrfToken: 't' };
  sourceId = (await pool.query(`SELECT id FROM sources WHERE title LIKE 'SYNTHETIC%' LIMIT 1`)).rows[0].id;
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('GET /map: bbox validation', () => {
  it.each([
    ['1,2,3'], ['a,b,c,d'], ['NaN,0,10,10'], ['0,0,10,91'], ['0,0,181,10'], ['-181,0,10,10'], ['0,10,10,10'], ['0,20,10,10'], ['10,0,10,10'], ['1e2,0,10,10'],
  ])('rejects bbox=%s with 400 BAD_BBOX in the shared error shape', async (bbox) => {
    const res = await http().get(`/api/v1/map?bbox=${encodeURIComponent(bbox)}`).expect(400);
    expect(res.body).toEqual({ error: { code: 'BAD_BBOX', message: expect.any(String) } });
  });

  it('rejects unknown parameters and invalid filters', async () => {
    await http().get('/api/v1/map?zoom=3').expect(400);
    await http().get('/api/v1/map?group=dragon').expect(400);
    await http().get('/api/v1/map?species=Not%20A%20Slug').expect(400);
  });
});

describe('GET /map: antimeridian', () => {
  it('stores a range drawn across 180° as two parts inside ±180', async () => {
    const { rows } = await pool.query(`
      SELECT ST_NumGeometries(r.geom) AS parts, ST_XMin(r.geom) AS xmin, ST_XMax(r.geom) AS xmax
      FROM species s JOIN species_ranges r ON r.revision_id = s.published_revision_id WHERE s.slug = 'fictus-marinus'`);
    expect(rows).toEqual([{ parts: 2, xmin: -180, xmax: 180 }]);
  });

  it('a viewport across the antimeridian finds the range on both sides and returns both halves', async () => {
    const m = await map('?bbox=170,-25,-170,-10');
    expect(m.bbox).toEqual([170, -25, -170, -10]);
    expect(slugsOf(m)).toEqual(['fictus-marinus']);
    expect(m.species[0].layer).toBe('range');
    const xs = m.ranges.flatMap((r: { geometry: { coordinates: unknown } }) => positions(r.geometry.coordinates).map((p) => p[0]));
    expect(xs.every((x: number) => x >= -180 && x <= 180)).toBe(true);
    expect(xs.some((x: number) => x >= 176)).toBe(true); // west of 180°
    expect(xs.some((x: number) => x <= -176)).toBe(true); // east of 180°, wrapped to negative longitudes
  });

  it('each side alone also finds it, and a box elsewhere does not', async () => {
    expect(slugsOf(await map('?bbox=177,-25,179.9,-10'))).toEqual(['fictus-marinus']);
    expect(slugsOf(await map('?bbox=-179.9,-25,-177,-10'))).toEqual(['fictus-marinus']);
    expect(slugsOf(await map('?bbox=0,-25,10,-10'))).toEqual([]);
  });
});

describe('GET /map: layers, filters and published data only', () => {
  it('places a species without a range by country-level presence, never by an invented range', async () => {
    const m = await map('?bbox=0,55,20,72'); // Norway
    expect(slugsOf(m)).toEqual(['fictus-regionalis']);
    expect(m.species[0].layer).toBe('country');
    expect(m.ranges).toEqual([]);
    expect(m.countryPresence).toEqual([{ slug: 'norway', name: 'Norway', type: 'country', speciesCount: 1, species: ['fictus-regionalis'] }]);
  });

  it('filters by group and category, and the whole world is the default', async () => {
    const world = await map('');
    expect(world.bbox).toEqual([-180, -90, 180, 90]);
    expect(slugsOf(world).sort()).toEqual(['fictus-captivus', 'fictus-exemplaris', 'fictus-generalis', 'fictus-marinus', 'fictus-regionalis']);
    expect(slugsOf(await map('?group=fish'))).toEqual(['fictus-marinus']);
    expect(slugsOf(await map('?category=CR,EN')).sort()).toEqual(['fictus-captivus', 'fictus-exemplaris']);
    expect(world.limits).toEqual({ maxSpecies: 200, maxVertices: 20000 });
    expect(world.truncated).toBe(false);
  });

  it('never lists a hide_regions species, even when asked for it by slug', async () => {
    expect(slugsOf(await map(''))).not.toContain('fictus-occultus');
    expect(await map('?species=fictus-occultus')).toMatchObject({ species: [], ranges: [], countryPresence: [] });
  });

  it('a range saved only in a draft stays off the map (draft leakage)', async () => {
    const draft = await editorial.createDraft(staff, await speciesId('fictus-exemplaris'));
    await editorial.saveDraft(staff, draft.id, {
      ...draft.content,
      expectedUpdatedAt: draft.updatedAt,
      ranges: [{ sourceId, seasonality: 'resident', presence: 'extant', geometry: { type: 'Polygon', coordinates: [[[35, -2], [37, -2], [37, 0], [35, 0], [35, -2]]] } }],
    });
    const m = await map('?species=fictus-exemplaris');
    expect(m.ranges).toEqual([]);
    expect(m.species).toMatchObject([{ slug: 'fictus-exemplaris', layer: 'country' }]);
    expect((await http().get('/api/v1/species/fictus-exemplaris').expect(200)).body.geography.ranges).toEqual([]);
  });

  it('serves the Natural Earth basemap with attribution and a long cache lifetime', async () => {
    const res = await http().get('/api/v1/map/basemap').expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
    expect(res.body.attribution).toMatch(/Natural Earth/);
    expect(res.body.features).toHaveLength(206);
    expect(res.body.features[0]).toMatchObject({ type: 'Feature', properties: { slug: expect.any(String), kind: expect.any(String) }, geometry: { type: 'MultiPolygon' } });
  });
});

describe('location-sensitive geometry', () => {
  const PRECISE = ['39.123456', '39.223456', '8.654321', '8.754321', '39.1234', '8.6543'];

  it('stores a generalize_country range as the whole country it covers, never the precise shape', async () => {
    const { rows } = await pool.query(`
      SELECT ST_Equals(r.geom, rg.geom) AS same, r.generalization_note
      FROM species s JOIN species_ranges r ON r.revision_id = s.published_revision_id, regions rg
      WHERE s.slug = 'fictus-generalis' AND rg.slug = 'ethiopia'`);
    expect(rows).toEqual([{ same: true, generalization_note: GENERALIZATION_NOTE }]);
  });

  it('the precise coordinates appear in no public response', async () => {
    const paths = [
      '/api/v1/species', '/api/v1/species?q=generalis', '/api/v1/species/fictus-generalis', '/api/v1/filters',
      '/api/v1/compare?species=fictus-generalis,fictus-marinus', '/api/v1/map', '/api/v1/map?species=fictus-generalis',
      '/api/v1/map?bbox=38,8,40,9', '/api/v1/map?bbox=39.1,8.6,39.3,8.8', '/api/v1/map/basemap', '/api/v1/regions/ethiopia', '/api/v1/support',
    ];
    for (const p of paths) {
      const res = await http().get(p).expect(200);
      for (const c of PRECISE) expect({ path: p, leaks: res.text.includes(c) }).toEqual({ path: p, leaks: false });
    }
  });

  it('the profile and the map say the location is generalized', async () => {
    const p = (await http().get('/api/v1/species/fictus-generalis').expect(200)).body;
    expect(p.geography).toMatchObject({ locationGeneralized: true, locationWithheld: false });
    expect(p.geography.ranges).toEqual([expect.objectContaining({ generalizationNote: GENERALIZATION_NOTE })]);
    const m = await map('?species=fictus-generalis');
    expect(m.ranges).toEqual([expect.objectContaining({ speciesSlug: 'fictus-generalis', generalized: true })]);
  });

  it('copying a generalized range into a new draft does not grow it into neighbouring countries', async () => {
    const draft = await editorial.createDraft(staff, await speciesId('fictus-generalis'));
    const { rows } = await pool.query(
      `SELECT ST_Equals(r.geom, rg.geom) AS same FROM species_ranges r, regions rg WHERE r.revision_id = $1 AND rg.slug = 'ethiopia'`,
      [draft.id],
    );
    expect(rows).toEqual([{ same: true }]);
  });

  it('refuses range polygons for a hide_regions species', async () => {
    const draft = await editorial.createDraft(staff, await speciesId('fictus-occultus'));
    const save = editorial.saveDraft(staff, draft.id, {
      ...draft.content,
      expectedUpdatedAt: draft.updatedAt,
      ranges: [{ sourceId, seasonality: 'resident', presence: 'extant', geometry: { type: 'Polygon', coordinates: [[[-75, -10], [-74, -10], [-74, -9], [-75, -9], [-75, -10]]] } }],
    });
    await expect(save).rejects.toMatchObject({ response: { code: 'SENSITIVE_RANGE' } });
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM species_ranges WHERE revision_id = $1`, [draft.id]);
    expect(rows[0].n).toBe(0);
  });
});

describe('geometry limits', () => {
  let draftId: string;
  let updatedAt: string;
  beforeAll(async () => {
    const d = await editorial.createSpecies(staff, { slug: 'fictus-largus', acceptedScientificName: 'Fictus largus', rank: 'species', displayGroup: 'other_invertebrate' });
    await editorial.addIdentifier(staff, d.speciesId, { provider: 'fixture', externalId: 'fictus-largus' });
    draftId = d.id;
    updatedAt = d.updatedAt;
  });
  const save = (ranges: RevisionContentDto['ranges']) => editorial.saveDraft(staff, draftId, { ...publishable(ranges), expectedUpdatedAt: updatedAt });

  it('rejects an invalid (self-intersecting) polygon with 422 and no coordinates in the message', async () => {
    const bowtie = { type: 'Polygon' as const, coordinates: [[[10.123456, 0], [11, 1], [11, 0], [10.123456, 1], [10.123456, 0]]] };
    const err = await save([{ sourceId, seasonality: 'resident', presence: 'extant', geometry: bowtie }]).catch((e: unknown) => e);
    expect(err).toMatchObject({ response: { code: 'INVALID_GEOMETRY' } });
    expect(JSON.stringify((err as { response: unknown }).response)).not.toContain('10.123456');
  });

  it('rejects more than 50,000 vertices', async () => {
    const ring = Array.from({ length: 50_001 }, (_, i) => [20 + 5 * Math.cos((2 * Math.PI * i) / 50_000), 5 * Math.sin((2 * Math.PI * i) / 50_000)]);
    ring[ring.length - 1] = ring[0];
    await expect(save([{ sourceId, seasonality: 'resident', presence: 'extant', geometry: { type: 'Polygon', coordinates: [ring] } }])).rejects.toMatchObject({
      response: { code: 'INVALID_GEOMETRY' },
    });
  });

  it('a large published range is simplified to stay under the response vertex cap', async () => {
    const n = 40_000;
    const ring = Array.from({ length: n + 1 }, (_, i) => [20 + 5 * Math.cos((2 * Math.PI * i) / n), 5 * Math.sin((2 * Math.PI * i) / n)]);
    ring[n] = ring[0];
    const saved = await save([{ sourceId, seasonality: 'resident', presence: 'extant', geometry: { type: 'Polygon', coordinates: [ring] } }]);
    await editorial.submit(staff, saved.id);
    await editorial.publish(staff, saved.id);
    const m = await map('?species=fictus-largus');
    const vertices = m.ranges.reduce((k: number, r: { geometry: { coordinates: unknown } }) => k + positions(r.geometry.coordinates).length, 0);
    expect(m.ranges).toHaveLength(1);
    expect(vertices).toBeGreaterThan(3);
    expect(vertices).toBeLessThanOrEqual(m.limits.maxVertices);
  });
});

describe('GET /regions/:slug', () => {
  it('404s unknown and malformed slugs', async () => {
    await http().get('/api/v1/regions/atlantis').expect(404);
    await http().get('/api/v1/regions/Not_A_Slug').expect(404);
  });

  it('lists published species with how they occur there, and the region source', async () => {
    const r = (await http().get('/api/v1/regions/norway').expect(200)).body;
    expect(r.region).toMatchObject({ slug: 'norway', name: 'Norway', type: 'country', isoA2: 'NO', source: { license: 'Public domain' } });
    expect(r.items).toEqual([
      { card: expect.objectContaining({ slug: 'fictus-regionalis' }), occurrences: [{ presence: 'extant', origin: 'native', seasonality: 'breeding' }] },
    ]);
    expect(r.facets.seasonalities.find((f: { value: string }) => f.value === 'breeding').count).toBe(1);
  });

  it('filters by origin, season, group and status within the region', async () => {
    const items = async (qs: string) => (await http().get(`/api/v1/regions/norway${qs}`).expect(200)).body.items.map((i: { card: { slug: string } }) => i.card.slug);
    expect(await items('?seasonality=breeding')).toEqual(['fictus-regionalis']);
    expect(await items('?seasonality=resident')).toEqual([]);
    expect(await items('?origin=introduced')).toEqual([]);
    expect(await items('?group=fish')).toEqual([]);
    expect(await items('?category=LC')).toEqual(['fictus-regionalis']);
    await http().get('/api/v1/regions/norway?origin=alien').expect(400);
  });

  it('never lists or counts a hide_regions species, and an empty region is still a page', async () => {
    const r = (await http().get('/api/v1/regions/peru').expect(200)).body;
    expect(r.items).toEqual([]);
    expect(r.total).toBe(0);
    expect(r.facets.groups.every((g: { count: number }) => g.count === 0)).toBe(true);
  });

  it('gives an antimeridian-crossing region a narrow bbox (west > east), and oceans hold high-seas species', async () => {
    const fiji = (await http().get('/api/v1/regions/fiji').expect(200)).body;
    const [w, , e] = fiji.region.bbox;
    expect(w).toBeGreaterThan(e);
    expect(w).toBeGreaterThan(170);
    expect(e).toBeLessThan(-170);
    const ocean = (await http().get('/api/v1/regions/south-pacific-ocean').expect(200)).body;
    expect(ocean.region.type).toBe('ocean');
    expect(ocean.items.map((i: { card: { slug: string } }) => i.card.slug)).toEqual(['fictus-marinus']);
  });
});
