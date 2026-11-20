/**
 * Import CLI engine (PLAN §8, §13 "Import idempotency and --reconcile"):
 * dry-run writes nothing; apply creates drafts only; re-importing the same file produces ZERO changes,
 * also after publication; a section edited by hand is skipped and reported unless --reconcile.
 * Images come from an injected fetcher and a local file, so the test never touches the network. Synthetic taxa only.
 */
import { INestApplication } from '@nestjs/common';
import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import request from 'supertest';
import { createApp } from '../../src/bootstrap';
import { localReader } from '../../src/cli/import';
import { seedRegions } from '../../src/cli/seed-regions';
import { DB, Db } from '../../src/db/db.module';
import { EditorialService } from '../../src/editorial/editorial.service';
import { RevisionContentRepository } from '../../src/editorial/revision-content.repository';
import { Importer, importStaff, ImportReport, ImportValidationError, reportMarkdown } from '../../src/import/importer';
import { MediaService } from '../../src/media/media.service';
import { Auth, authed, createStaff, freshDatabase, login } from '../helpers';
import { syntheticJpeg, wipeMediaDir, workflow } from '../workflow';

let app: INestApplication;
let pool: Pool;
let admin: Auth;
let editor: Auth;
let dir: string;
let remoteImage: Buffer;
let baseSources: number; // seedRegions adds the Natural Earth source
const fetched: string[] = [];
const http = () => request(app.getHttpServer());
const wf = workflow(http);

function makeFile(overrides: { overview?: string; commonName?: string; extraSpecies?: boolean } = {}) {
  const species = [
    {
      slug: 'fictus-importus',
      scientificName: 'Fictus importus',
      rank: 'species',
      identifiers: [{ provider: 'fixture', externalId: 'fictus-importus' }],
      content: {
        displayGroup: 'bird',
        editorial: { overview: overrides.overview ?? '  A synthetic bird used to test imports.  ', taxonomy: { class: 'Aves (synthetic)' } },
        names: [{ language: 'en', name: overrides.commonName ?? 'Import test bird', nameType: 'common', preferred: true }],
        environments: ['terrestrial', 'aerial'],
        assessments: [{ sourceKey: 'guide', scope: 'global', category: 'NT', trend: 'decreasing', assessedOn: '2021-03-01', providerAssessmentId: 'fx-1' }],
        populationEstimates: [
          { assessmentIndex: 0, sourceKey: 'guide', scope: 'global', context: 'wild', basis: 'mature_individuals', form: 'range', minValue: '1000', maxValue: '2500', referenceStart: '2020-01-01', referenceEnd: '2020-12-31' },
        ],
        regions: [{ region: 'peru', presence: 'extant', origin: 'native', seasonality: 'resident', sourceKey: 'guide' }],
        citations: [{ sectionKey: 'overview', sourceKey: 'guide', locator: 'p. 3' }, { sectionKey: 'population', sourceKey: 'guide' }],
        media: [{ mediaKey: 'photo', position: 0, role: 'primary', altText: 'Synthetic test image' }],
      },
    },
  ];
  if (overrides.extraSpecies) {
    species.push({
      ...species[0],
      slug: 'fictus-secundus',
      scientificName: 'Fictus secundus',
      identifiers: [{ provider: 'fixture', externalId: 'fictus-secundus' }],
      content: { ...species[0].content, media: [{ mediaKey: 'local', position: 0, role: 'primary', altText: 'Local synthetic image' }] },
    });
  }
  return {
    format: 'wildward-import',
    version: 1,
    notes: 'Synthetic test file',
    sources: [{ key: 'guide', title: 'Synthetic Field Guide for Imports', publisher: 'Example Press', publishedOn: '2020-06-01', accessedOn: '2026-11-01' }],
    media: [
      { key: 'photo', url: 'https://images.example.org/fictus.jpg', creator: 'Synthetic Creator', credit: 'Photo: Synthetic Creator, CC BY 4.0', license: 'CC BY 4.0', sourceUrl: 'https://example.org/fictus' },
      ...(overrides.extraSpecies ? [{ key: 'local', path: 'local.jpg', creator: 'Synthetic', credit: 'Photo: Synthetic, CC0', license: 'CC0' }] : []),
    ],
    species,
  };
}

function importer() {
  return new Importer(
    app.get<Db>(DB), app.get(EditorialService), app.get(RevisionContentRepository), app.get(MediaService),
    async (url) => {
      fetched.push(url);
      return remoteImage;
    },
    localReader(dir),
  );
}

async function run(file: object, opts: { dryRun?: boolean; reconcile?: boolean } = {}): Promise<ImportReport> {
  const staff = await importStaff(app.get<Db>(DB));
  return importer().run(staff, file, { dryRun: opts.dryRun ?? false, reconcile: opts.reconcile ?? false, fileName: 'test-import.json' });
}

const count = async (table: string) => Number((await pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n);
const speciesId = async (slug: string) => (await pool.query(`SELECT id FROM species WHERE slug = $1`, [slug])).rows[0]?.id as string | undefined;
const revisions = async (slug: string) =>
  (await pool.query(`SELECT r.id, r.version, r.state, r.updated_at FROM species_revisions r JOIN species s ON s.id = r.species_id WHERE s.slug = $1 ORDER BY r.version`, [slug])).rows;

beforeAll(async () => {
  await wipeMediaDir();
  pool = await freshDatabase();
  await seedRegions(pool);
  app = await createApp();
  await app.init();
  await createStaff(pool, 'admin', 'admin@test.invalid');
  await createStaff(pool, 'editor', 'editor@test.invalid');
  admin = await login(() => http().post('/api/v1/staff/auth/login'), 'admin@test.invalid');
  editor = await login(() => http().post('/api/v1/staff/auth/login'), 'editor@test.invalid');
  remoteImage = await syntheticJpeg(1000, 700);
  baseSources = await count('sources');
  dir = await mkdtemp(join(tmpdir(), 'wild-import-'));
  await writeFile(join(dir, 'local.jpg'), await syntheticJpeg(640, 480));
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('validation', () => {
  it('rejects a malformed file before touching the database', async () => {
    const bad = makeFile();
    (bad.species[0].content.citations[0] as { sourceKey: string }).sourceKey = 'missing';
    await expect(run(bad)).rejects.toThrow(ImportValidationError);
    await expect(run({ ...makeFile(), version: 2 })).rejects.toThrow(/version/);
    const noIds = makeFile();
    noIds.species[0].identifiers = [];
    await expect(run(noIds)).rejects.toThrow(/provider identifier/);
    expect(await count('species')).toBe(0);
  });

  it('rejects unknown regions and NC images, and rolls back everything', async () => {
    const f = makeFile();
    f.species[0].content.regions[0].region = 'atlantis';
    await expect(run(f)).rejects.toThrow(/Unknown region "atlantis"/);
    const nc = makeFile();
    nc.media[0].license = 'CC BY-NC 4.0';
    await expect(run(nc)).rejects.toThrow(/allow-list/);
    expect(await count('species')).toBe(0);
    expect(await count('sources')).toBe(baseSources);
    expect(await count('media_assets')).toBe(0);
  });
});

describe('dry run, apply, re-apply', () => {
  it('a dry run reports the changes and writes nothing (no rows, no image files)', async () => {
    const r = await run(makeFile(), { dryRun: true });
    expect(r.mode).toBe('dry-run');
    expect(r.changeCount).toBeGreaterThan(5);
    expect(r.species[0].action).toBe('created');
    expect(await count('species')).toBe(0);
    expect(await count('sources')).toBe(baseSources);
    expect(await count('media_assets')).toBe(0);
    expect(await count('import_records')).toBe(0);
    await expect(readdir(process.env.MEDIA_DIR as string)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('apply creates the species with one DRAFT, a pending image and the source; nothing is published', async () => {
    const r = await run(makeFile());
    expect(r.species[0]).toMatchObject({ slug: 'fictus-importus', action: 'created', draftVersion: 1 });
    expect(r.sourcesCreated).toEqual(['guide']);
    expect(r.mediaCreated).toEqual(['photo (pending review)']);
    expect(fetched).toContain('https://images.example.org/fictus.jpg');
    const revs = await revisions('fictus-importus');
    expect(revs.map((x) => x.state)).toEqual(['draft']);
    expect((await pool.query(`SELECT published_revision_id FROM species WHERE slug = 'fictus-importus'`)).rows[0].published_revision_id).toBeNull();
    await http().get('/api/v1/species/fictus-importus').expect(404);
    const rev = (await http().get(`/api/v1/staff/revisions/${revs[0].id}`).set('Cookie', editor.cookie).expect(200)).body;
    expect(rev.content.editorial.overview).toBe('A synthetic bird used to test imports.'); // trimmed by the editorial schema
    expect(rev.content.populationEstimates[0]).toMatchObject({ minValue: '1000', maxValue: '2500', assessmentIndex: 0 });
    expect((await pool.query(`SELECT review_state FROM media_assets`)).rows).toEqual([{ review_state: 'pending' }]);
    const md = reportMarkdown(r);
    expect(md).toMatch(/Drafts only: nothing was submitted or published/);
  });

  it('re-importing the same file produces zero changes', async () => {
    const before = { revs: await revisions('fictus-importus'), audits: await count('audit_events'), sources: await count('sources'), media: await count('media_assets') };
    const r = await run(makeFile());
    expect(r.changeCount).toBe(0);
    expect(r.species[0].action).toBe('unchanged');
    expect(r.species[0].sections.every((x) => x.outcome === 'unchanged')).toBe(true);
    expect(await revisions('fictus-importus')).toEqual(before.revs); // same rows, same updated_at
    expect(await count('audit_events')).toBe(before.audits);
    expect(await count('sources')).toBe(before.sources);
    expect(await count('media_assets')).toBe(before.media);
  });

  it('after review and publication, the same file still produces zero changes and no new draft', async () => {
    const media = (await pool.query(`SELECT id FROM media_assets`)).rows[0].id;
    await authed(http().post(`/api/v1/staff/media/${media}/approve`), admin).expect(200);
    const [draft] = await revisions('fictus-importus');
    await wf.submit(editor, draft.id).expect(200);
    await wf.publish(admin, draft.id).expect(200);
    const page = (await http().get('/api/v1/species/fictus-importus').expect(200)).body;
    expect(page.media[0].credit).toBe('Photo: Synthetic Creator, CC BY 4.0');

    const r = await run(makeFile());
    expect(r.changeCount).toBe(0);
    expect((await revisions('fictus-importus')).map((x) => x.state)).toEqual(['published']);
  });

  it('a changed file creates a new draft from the published revision with only that section changed', async () => {
    const r = await run(makeFile({ overview: 'A synthetic bird, second edition.' }));
    expect(r.species[0].action).toBe('draft_created');
    expect(r.species[0].sections.filter((x) => x.outcome !== 'unchanged')).toEqual([{ key: 'editorial.overview', outcome: 'applied' }]);
    const revs = await revisions('fictus-importus');
    expect(revs.map((x) => x.state)).toEqual(['published', 'draft']);
    // The public profile is unchanged until someone publishes the draft.
    expect((await http().get('/api/v1/species/fictus-importus').expect(200)).body.overview).toBe('A synthetic bird used to test imports.');
    expect((await run(makeFile({ overview: 'A synthetic bird, second edition.' }))).changeCount).toBe(0);
  });

  it('a section a person edited is skipped and reported; other sections still update', async () => {
    const draft = (await revisions('fictus-importus')).find((x) => x.state === 'draft');
    const rev = (await http().get(`/api/v1/staff/revisions/${draft.id}`).set('Cookie', editor.cookie).expect(200)).body;
    const names = [{ language: 'en', name: 'Hand-edited bird name', nameType: 'common', preferred: true }];
    await wf.save(editor, { ...rev, updatedAt: rev.updatedAt }, { ...rev.content, names });

    const r = await run(makeFile({ overview: 'Third edition.', commonName: 'Importer bird name' }));
    const changes = r.species[0].sections.filter((x) => x.outcome !== 'unchanged');
    expect(changes).toEqual(
      expect.arrayContaining([
        { key: 'names', outcome: 'skipped_manual_edit' },
        { key: 'editorial.overview', outcome: 'applied' },
      ]),
    );
    expect(r.species[0].action).toBe('draft_updated');
    const after = (await http().get(`/api/v1/staff/revisions/${draft.id}`).set('Cookie', editor.cookie).expect(200)).body;
    expect(after.content.names[0].name).toBe('Hand-edited bird name');
    expect(after.content.editorial.overview).toBe('Third edition.');
    expect(reportMarkdown(r)).toMatch(/\| names \| \*\*skipped: edited by hand\*\*/);

    // The same file again: the manual edit is still protected, and nothing else changes.
    const again = await run(makeFile({ overview: 'Third edition.', commonName: 'Importer bird name' }));
    expect(again.changeCount).toBe(0);
    expect(again.species[0].sections.find((x) => x.key === 'names')?.outcome).toBe('skipped_manual_edit');
  });

  it('--reconcile overwrites the manual edit and lists it', async () => {
    const r = await run(makeFile({ overview: 'Third edition.', commonName: 'Importer bird name' }), { reconcile: true });
    expect(r.species[0].sections.filter((x) => x.outcome !== 'unchanged')).toEqual([{ key: 'names', outcome: 'overwritten_reconcile' }]);
    expect(r.changeCount).toBe(1);
    expect(reportMarkdown(r)).toMatch(/\| names \| \*\*overwritten \(--reconcile\)\*\*/);
    const draft = (await revisions('fictus-importus')).find((x) => x.state === 'draft');
    const after = (await http().get(`/api/v1/staff/revisions/${draft.id}`).set('Cookie', editor.cookie).expect(200)).body;
    expect(after.content.names[0].name).toBe('Importer bird name');
    expect((await run(makeFile({ overview: 'Third edition.', commonName: 'Importer bird name' }))).changeCount).toBe(0);
    const audit = await pool.query(`SELECT summary FROM audit_events WHERE action = 'import.apply' ORDER BY created_at DESC LIMIT 1`);
    expect(audit.rows[0].summary).toMatch(/with --reconcile/);
  });

  it('matches species by provider identifier, reads local images, and never changes identity', async () => {
    const f = makeFile({ overview: 'Third edition.', commonName: 'Importer bird name', extraSpecies: true });
    f.species[0].scientificName = 'Fictus renamed';
    const r = await run(f);
    expect(r.species[0].notes.join(' ')).toMatch(/Identity is not changed by import/);
    expect(r.species[1]).toMatchObject({ slug: 'fictus-secundus', action: 'created' });
    expect(r.mediaCreated).toEqual(['local (pending review)']);
    expect((await pool.query(`SELECT accepted_scientific_name FROM species WHERE slug = 'fictus-importus'`)).rows[0].accepted_scientific_name).toBe('Fictus importus');
    expect(await speciesId('fictus-secundus')).toBeDefined();
  });

  it('skips a species whose latest revision is waiting for review', async () => {
    const draft = (await revisions('fictus-secundus'))[0];
    const media = (await pool.query(`SELECT id FROM media_assets WHERE review_state = 'pending'`)).rows[0].id;
    await authed(http().post(`/api/v1/staff/media/${media}/approve`), admin).expect(200);
    await wf.submit(editor, draft.id).expect(200);
    const f = makeFile({ overview: 'Changed again', commonName: 'Importer bird name', extraSpecies: true });
    const r = await run(f);
    expect(r.species[1]).toMatchObject({ slug: 'fictus-secundus', action: 'skipped' });
    expect(r.species[1].notes[0]).toMatch(/waiting for review/);
  });
});

describe('local file reader', () => {
  it('refuses paths that leave the import folder', async () => {
    await expect(localReader(dir)('../etc/passwd')).rejects.toThrow(/leaves the import folder/);
  });
});
