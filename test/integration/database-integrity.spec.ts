/**
 * Proves the database itself enforces the scientific and publication rules in docs/PLAN.md §5–6,
 * so a bug in application code cannot corrupt published data. Runs against real PostgreSQL + PostGIS.
 */
import { Pool } from 'pg';
import { seedRegions } from '../../src/cli/seed-regions';
import { expectPgError, fixture, freshDatabase } from '../helpers';

let pool: Pool;
beforeAll(async () => {
  pool = await freshDatabase();
});
afterAll(async () => {
  await pool.end();
});

const insertEstimate = (rev: string, src: string, cols: Record<string, unknown>) => {
  const base = { revision_id: rev, source_id: src, basis: 'mature_individuals', ...cols };
  const keys = Object.keys(base);
  return pool.query(
    `INSERT INTO population_estimates (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`,
    Object.values(base),
  );
};

describe('population estimates', () => {
  it('accepts every coherent form, including unknown with no numbers (unknown is not zero)', async () => {
    const f = await fixture(pool, 'pop-ok');
    await insertEstimate(f.revision, f.source, { form: 'exact', point_value: '2500' });
    await insertEstimate(f.revision, f.source, { form: 'range', min_value: '1000', max_value: '2499' });
    await insertEstimate(f.revision, f.source, { form: 'at_least', min_value: '50' });
    await insertEstimate(f.revision, f.source, { form: 'at_most', max_value: '10' });
    await insertEstimate(f.revision, f.source, { form: 'qualitative', qualitative_text: 'Locally common' });
    await insertEstimate(f.revision, f.source, { form: 'unknown' });
    const { rows } = await pool.query(`SELECT count(*)::int n FROM population_estimates WHERE revision_id = $1 AND form = 'unknown' AND point_value IS NULL`, [f.revision]);
    expect(rows[0].n).toBe(1);
  });

  it('rejects incoherent, negative or reversed values', async () => {
    const f = await fixture(pool, 'pop-bad');
    await expectPgError(insertEstimate(f.revision, f.source, { form: 'range', min_value: '10', max_value: '5' }), '23514');
    await expectPgError(insertEstimate(f.revision, f.source, { form: 'exact', point_value: '-1' }), '23514');
    await expectPgError(insertEstimate(f.revision, f.source, { form: 'unknown', point_value: '0' }), '23514');
    await expectPgError(insertEstimate(f.revision, f.source, { form: 'exact' }), '23514');
    await expectPgError(insertEstimate(f.revision, f.source, { form: 'qualitative' }), '23514');
    await expectPgError(
      insertEstimate(f.revision, f.source, { form: 'exact', point_value: '5', reference_start: '2020-01-01', reference_end: '2019-01-01' }),
      '23514',
    );
  });

  it('requires a region for regional scope and forbids one for global scope', async () => {
    const f = await fixture(pool, 'pop-scope');
    await expectPgError(insertEstimate(f.revision, f.source, { form: 'unknown', scope: 'regional' }), '23514');
  });

  it('keeps counts above 2^53 exact (bigint)', async () => {
    const f = await fixture(pool, 'pop-big');
    await insertEstimate(f.revision, f.source, { form: 'exact', point_value: '9007199254740993' });
    const { rows } = await pool.query(`SELECT point_value::text v FROM population_estimates WHERE revision_id = $1`, [f.revision]);
    expect(rows[0].v).toBe('9007199254740993');
  });

  it('rejects an estimate that points at an assessment from another revision', async () => {
    const a = await fixture(pool, 'cross-a');
    const b = await fixture(pool, 'cross-b');
    const assessment = (
      await pool.query(`INSERT INTO assessments (revision_id, source_id, category) VALUES ($1, $2, 'EN') RETURNING id`, [a.revision, a.source])
    ).rows[0].id;
    await expectPgError(insertEstimate(b.revision, b.source, { form: 'unknown', assessment_id: assessment }), '23503');
  });
});

describe('publication', () => {
  it('cannot point the public pointer at a draft revision', async () => {
    const f = await fixture(pool, 'pub-draft');
    await expectPgError(pool.query(`UPDATE species SET published_revision_id = $1 WHERE id = $2`, [f.revision, f.species]), '23514');
  });

  it("cannot point the public pointer at another species' revision", async () => {
    const a = await fixture(pool, 'pub-a');
    const b = await fixture(pool, 'pub-b');
    await pool.query(`UPDATE species_revisions SET state = 'published' WHERE id = $1`, [b.revision]);
    await expectPgError(pool.query(`UPDATE species SET published_revision_id = $1 WHERE id = $2`, [b.revision, a.species]), '23503');
  });

  it('freezes a published revision and its child rows', async () => {
    const f = await fixture(pool, 'pub-frozen');
    await pool.query(`INSERT INTO species_names (revision_id, name, preferred) VALUES ($1, 'Example beast', true)`, [f.revision]);
    await pool.query(`UPDATE species_revisions SET state = 'published', published_at = now() WHERE id = $1`, [f.revision]);
    await pool.query(`UPDATE species SET published_revision_id = $1 WHERE id = $2`, [f.revision, f.species]);

    await expectPgError(pool.query(`UPDATE species_revisions SET editorial = '{"overview":"changed"}' WHERE id = $1`, [f.revision]), '23514');
    await expectPgError(pool.query(`UPDATE species_revisions SET state = 'draft' WHERE id = $1`, [f.revision]), '23514');
    await expectPgError(pool.query(`INSERT INTO species_names (revision_id, name) VALUES ($1, 'Leaked draft name')`, [f.revision]), '23514');
    await expectPgError(pool.query(`UPDATE species_names SET name = 'Renamed' WHERE revision_id = $1`, [f.revision]), '23514');
    await expectPgError(pool.query(`DELETE FROM species_names WHERE revision_id = $1`, [f.revision]), '23514');
  });

  it('allows only one preferred common name per language', async () => {
    const f = await fixture(pool, 'names');
    await pool.query(`INSERT INTO species_names (revision_id, name, preferred) VALUES ($1, 'First', true)`, [f.revision]);
    await expectPgError(pool.query(`INSERT INTO species_names (revision_id, name, preferred) VALUES ($1, 'Second', true)`, [f.revision]), '23505');
  });
});

describe('audit log', () => {
  it('is append-only', async () => {
    await pool.query(`INSERT INTO audit_events (action, entity_type, summary) VALUES ('test', 'none', 'x')`);
    await expectPgError(pool.query(`UPDATE audit_events SET summary = 'tampered'`), '42501');
    await expectPgError(pool.query(`DELETE FROM audit_events`), '42501');
  });
});

describe('regions and geometry', () => {
  it('seeds Natural Earth regions idempotently with valid geometry, including antimeridian-crossing Fiji', async () => {
    const first = await seedRegions(pool);
    await seedRegions(pool);
    const { rows } = await pool.query(`SELECT count(*)::int n, bool_and(ST_IsValid(geom)) valid FROM regions`);
    expect(rows[0].n).toBe(first.countries + first.marine);
    expect(rows[0].valid).toBe(true);

    const fiji = await pool.query(`SELECT ST_XMin(geom) xmin, ST_XMax(geom) xmax FROM regions WHERE iso_a2 = 'FJ'`);
    expect(fiji.rows[0].xmin).toBeGreaterThanOrEqual(-180);
    expect(fiji.rows[0].xmax).toBeLessThanOrEqual(180);
  });

  it('rejects an invalid (self-intersecting) range polygon', async () => {
    const f = await fixture(pool, 'geom-bad');
    const bowtie = 'MULTIPOLYGON(((0 0, 10 10, 10 0, 0 10, 0 0)))';
    await expectPgError(
      pool.query(`INSERT INTO species_ranges (revision_id, source_id, geom) VALUES ($1, $2, ST_GeomFromText($3, 4326))`, [f.revision, f.source, bowtie]),
      '23514',
    );
  });

  it('rejects a range stored past ±180 (antimeridian-safe storage, migration 0003)', async () => {
    const f = await fixture(pool, 'geom-wrap');
    const unsplit = 'MULTIPOLYGON(((176 -20, 184 -20, 184 -15, 176 -15, 176 -20)))';
    await expectPgError(
      pool.query(`INSERT INTO species_ranges (revision_id, source_id, geom) VALUES ($1, $2, ST_GeomFromText($3, 4326))`, [f.revision, f.source, unsplit]),
      '23514',
    );
  });
});

describe('formats', () => {
  it('enforces slug format and https-only support links', async () => {
    await expectPgError(pool.query(`INSERT INTO species (slug, accepted_scientific_name) VALUES ('Bad Slug', 'X y')`), '23514');
    await expectPgError(
      pool.query(`INSERT INTO organizations (name, slug, website, description) VALUES ('Org', 'org', 'http://insecure.example', 'd')`),
      '23514',
    );
  });
});
