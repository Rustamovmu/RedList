/**
 * Hand-checked IUCN status import (R1 launch readiness, DECISIONS D-032): the sheet lists published species and
 * keeps owner values; only fully filled rows are imported; the result is a DRAFT that cites
 * "IUCN Red List, checked by hand"; the public profile is unchanged until a person publishes; re-running is a no-op.
 * Synthetic taxa and made-up IUCN numbers only. Nothing here reads iucnredlist.org.
 */
import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { createApp } from '../../src/bootstrap';
import { seedRegions } from '../../src/cli/seed-regions';
import { DB, Db } from '../../src/db/db.module';
import { EditorialService } from '../../src/editorial/editorial.service';
import { RevisionContentRepository } from '../../src/editorial/revision-content.repository';
import { importStaff } from '../../src/import/importer';
import {
  buildSheet, CHECKED_BY_HAND, parseCsv, readSheet, SheetRow, StatusCheckError, StatusCheckImporter, toCsv, validateSheet,
} from '../../src/import/status-check';
import { Auth, authed, createStaff, freshDatabase, login } from '../helpers';
import { Rev, workflow } from '../workflow';

let app: INestApplication;
let pool: Pool;
let admin: Auth;
let editor: Auth;
let oldSource: string;
let peru: string;
const http = () => request(app.getHttpServer());
const wf = workflow(http);

const TAXON = '990001';
const URL_OK = `https://www.iucnredlist.org/species/${TAXON}/123456`;

async function publishSynthetic(slug: string, withIucnId: string | null): Promise<string> {
  const draft: Rev = await wf.createSpecies(editor, slug);
  if (withIucnId) await authed(http().post(`/api/v1/staff/species/${draft.speciesId}/identifiers`), editor).send({ provider: 'iucn', externalId: withIucnId }).expect(201);
  await wf.saveAndPublish(editor, admin, draft, wf.content('A synthetic animal for the status check.', oldSource, {
    editorial: { overview: 'A synthetic animal for the status check.' },
    assessments: [
      { sourceId: oldSource, scope: 'global', category: 'VU', trend: 'unknown' },
      { sourceId: oldSource, scope: 'regional', regionId: peru, category: 'EN', trend: 'decreasing', assessedOn: '2019-05-01' },
    ],
    populationEstimates: [{ assessmentIndex: 0, sourceId: oldSource, scope: 'global', context: 'wild', basis: 'mature_individuals', form: 'exact', pointValue: '500' }],
    citations: [
      { sectionKey: 'overview', sourceId: oldSource },
      { sectionKey: 'status', sourceId: oldSource, locator: 'property P141' },
      { sectionKey: 'population', sourceId: oldSource },
    ],
  }));
  return draft.speciesId;
}

function importer() {
  const db = app.get<Db>(DB);
  return new StatusCheckImporter(db, app.get(EditorialService), app.get(RevisionContentRepository));
}
async function run(csv: string, dryRun = false) {
  return importer().run(await importStaff(app.get<Db>(DB)), csv, { dryRun, fileName: 'status-check.csv' });
}
async function sheetWith(fill: Partial<SheetRow>, slug = 'fictus-statusus') {
  const { rows } = await buildSheet(app.get<Db>(DB));
  return toCsv(rows.map((r) => (r.slug === slug ? { ...r, ...fill } : r)));
}
const FILLED: Partial<SheetRow> = { checked_category: 'EN', date_assessed: '2023-02-14', trend: 'Decreasing', criteria: 'A2cd', assessment_url: URL_OK, date_checked: '2026-11-20' };
const revisions = async (slug: string) =>
  (await pool.query(`SELECT r.id, r.version, r.state, r.updated_at FROM species_revisions r JOIN species s ON s.id = r.species_id WHERE s.slug = $1 ORDER BY r.version`, [slug])).rows;
const count = async (table: string) => Number((await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n);

beforeAll(async () => {
  pool = await freshDatabase();
  await seedRegions(pool);
  app = await createApp();
  await app.init();
  await createStaff(pool, 'admin', 'admin@test.invalid');
  await createStaff(pool, 'editor', 'editor@test.invalid');
  admin = await login(() => http().post('/api/v1/staff/auth/login'), 'admin@test.invalid');
  editor = await login(() => http().post('/api/v1/staff/auth/login'), 'editor@test.invalid');
  peru = (await pool.query(`SELECT id FROM regions WHERE slug = 'peru'`)).rows[0].id;
  oldSource = (
    await pool.query(
      `INSERT INTO sources (title, publisher, permitted_use_note) VALUES ('Synthetic wiki item: status statement', 'Synthetic Wiki',
       'Second-hand source. The statement cites The IUCN Red List of Threatened Species 2022.2.') RETURNING id`,
    )
  ).rows[0].id;
  await publishSynthetic('fictus-statusus', TAXON);
  await publishSynthetic('fictus-secundus', null);
  await wf.createSpecies(editor, 'fictus-draftonly'); // never published: not in the sheet
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('the sheet', () => {
  it('lists published species only, with the cited category, edition and IUCN taxon ID, and empty owner columns', async () => {
    const { rows } = await buildSheet(app.get<Db>(DB));
    expect(rows.map((r) => r.slug)).toEqual(['fictus-secundus', 'fictus-statusus']);
    const r = rows[1];
    expect(r).toMatchObject({ current_category: 'VU', current_source: 'Synthetic Wiki', current_edition: '2022.2', iucn_taxon_id: TAXON, checked_category: '', date_checked: '' });
    expect(r.iucn_search_url).toBe('https://www.iucnredlist.org/search?query=Fictus%20testus&searchType=species');
    expect(rows[0].iucn_taxon_id).toBe('');
  });

  it('keeps values already filled in when rebuilt, and survives a CSV round trip with commas and quotes', async () => {
    const csv = await sheetWith({ ...FILLED, owner_note: 'Checked, "twice"' });
    const again = await buildSheet(app.get<Db>(DB), readSheet(csv));
    expect(again.rows.find((r) => r.slug === 'fictus-statusus')).toMatchObject({ checked_category: 'EN', owner_note: 'Checked, "twice"' });
    expect(parseCsv('a,"b ""c"", d"\r\n1,2\n')).toEqual([['a', 'b "c", d'], ['1', '2']]);
  });
});

describe('validation (nothing is guessed)', () => {
  it('skips empty rows and refuses half-filled or inconsistent rows', async () => {
    const empty = validateSheet(readSheet(await sheetWith({})));
    expect(empty.checked).toEqual([]);
    expect(empty.unchecked).toEqual(['fictus-secundus', 'fictus-statusus']);
    const bad = async (fill: Partial<SheetRow>, msg: RegExp) => expect(run(await sheetWith({ ...FILLED, ...fill }))).rejects.toThrow(msg);
    await bad({ trend: '' }, /partly filled in; also fill trend/);
    await bad({ checked_category: 'Endangered' }, /checked_category must be one of/);
    await bad({ date_assessed: '2023' }, /date_assessed must be a real date/);
    await bad({ date_assessed: '2023-02-30' }, /date_assessed must be a real date/);
    await bad({ assessment_url: 'https://example.org/species/990001/1' }, /assessment_url must be/);
    await bad({ assessment_url: 'https://www.iucnredlist.org/species/42/1' }, /is for taxon 42, not 990001/);
    await bad({ date_checked: '2999-01-01' }, /in the future/);
    await bad({ iucn_taxon_id: '42', assessment_url: 'https://www.iucnredlist.org/species/42/1' }, /42 is not an identifier of this species/);
    expect(await count('species_revisions WHERE state = \'draft\'')).toBe(1); // only fictus-draftonly
  });

  it('refuses a sheet with missing columns', async () => {
    await expect(run('slug,checked_category\nfictus-statusus,EN\n')).rejects.toThrow(StatusCheckError);
  });
});

describe('import into drafts', () => {
  it('a dry run reports the change and writes nothing', async () => {
    const before = { sources: await count('sources'), audits: await count('audit_events') };
    const r = await run(await sheetWith(FILLED), true);
    expect(r.changeCount).toBe(2); // one source, one draft
    expect(r.species[0]).toMatchObject({ slug: 'fictus-statusus', action: 'draft_created' });
    expect((await revisions('fictus-statusus')).map((x) => x.state)).toEqual(['published']);
    expect(await count('sources')).toBe(before.sources);
    expect(await count('audit_events')).toBe(before.audits);
  });

  it('apply writes a DRAFT citing "IUCN Red List, checked by hand"; the public profile is unchanged', async () => {
    const r = await run(await sheetWith(FILLED));
    expect(r.species[0]).toMatchObject({ action: 'draft_created', draftVersion: 2, before: 'VU, trend unknown', after: 'EN (2023-02-14), trend decreasing' });
    expect(r.species[0].notes.join(' ')).toMatch(/VU to EN/);
    expect(r.species[0].notes.join(' ')).toMatch(/still cited in: overview, population/);
    expect(r.species[0].notes.join(' ')).toMatch(/population estimate was linked to the replaced assessment/);
    expect(r.unchecked).toEqual(['fictus-secundus']);

    const revs = await revisions('fictus-statusus');
    expect(revs.map((x) => x.state)).toEqual(['published', 'draft']);
    const pub = (await http().get('/api/v1/species/fictus-statusus').expect(200)).body;
    expect(JSON.stringify(pub)).not.toMatch(/checked by hand/);

    const draft = (await http().get(`/api/v1/staff/revisions/${revs[1].id}`).set('Cookie', editor.cookie).expect(200)).body.content;
    const global = draft.assessments.filter((a: { scope: string }) => a.scope === 'global');
    expect(global).toHaveLength(1);
    expect(global[0]).toMatchObject({ category: 'EN', trend: 'decreasing', assessedOn: '2023-02-14', criteria: 'A2cd', providerAssessmentId: '123456' });
    expect(draft.assessments.find((a: { scope: string }) => a.scope === 'regional')).toMatchObject({ category: 'EN', regionId: peru });
    expect(draft.populationEstimates[0].assessmentIndex).toBeNull();
    const src = (await pool.query(`SELECT *, accessed_on::text AS accessed_on FROM sources WHERE id = $1`, [global[0].sourceId])).rows[0];
    expect(src).toMatchObject({ publisher: 'IUCN', url: URL_OK, accessed_on: '2026-11-20' });
    expect(src.permitted_use_note).toContain(CHECKED_BY_HAND);
    const statusCites = draft.citations.filter((c: { sectionKey: string }) => c.sectionKey === 'status');
    expect(statusCites).toEqual([expect.objectContaining({ sourceId: global[0].sourceId, note: CHECKED_BY_HAND, locator: 'assessment 123456' })]);
    expect(draft.citations.filter((c: { sourceId: string }) => c.sourceId === oldSource).map((c: { sectionKey: string }) => c.sectionKey).sort()).toEqual(['overview', 'population']);
    expect((await pool.query(`SELECT count(*)::int AS n FROM audit_events WHERE action = 'status_check.apply'`)).rows[0].n).toBe(1);
  });

  it('re-running the same sheet changes nothing', async () => {
    const before = { revs: await revisions('fictus-statusus'), sources: await count('sources'), audits: await count('audit_events') };
    const r = await run(await sheetWith(FILLED));
    expect(r.changeCount).toBe(0);
    expect(r.species[0].action).toBe('unchanged');
    expect(await revisions('fictus-statusus')).toEqual(before.revs);
    expect(await count('sources')).toBe(before.sources);
    expect(await count('audit_events')).toBe(before.audits);
  });

  it('a corrected row updates the same draft; a submitted revision is skipped', async () => {
    const r = await run(await sheetWith({ ...FILLED, trend: 'stable' }));
    expect(r.species[0]).toMatchObject({ action: 'draft_updated', draftVersion: 2, after: 'EN (2023-02-14), trend stable' });
    const [, draft] = await revisions('fictus-statusus');
    await wf.submit(editor, draft.id).expect(200);
    const skipped = await run(await sheetWith({ ...FILLED, trend: 'increasing' }));
    expect(skipped.species[0].action).toBe('skipped');
    expect((await revisions('fictus-statusus')).map((x) => x.state)).toEqual(['published', 'submitted']);
  });
});

describe('sheet for the real catalogue', () => {
  it('can leave out the synthetic development fixtures', async () => {
    const { rows } = await buildSheet(app.get<Db>(DB), [], { excludeFixtures: true });
    expect(rows).toEqual([]); // every taxon in this file carries a `fixture` identifier
  });
});
