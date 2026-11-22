/**
 * Quality tooling (PLAN §8 link checker, §11 validate:catalogue) against the synthetic fixtures.
 * The link checker uses an injected probe, so no request leaves the machine.
 */
import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import request from 'supertest';
import { createApp } from '../../src/bootstrap';
import { seedFixtures } from '../../src/cli/seed-fixtures';
import { seedRegions } from '../../src/cli/seed-regions';
import { DB, Db } from '../../src/db/db.module';
import { FIXTURE_SOURCE_TITLE } from '../../src/fixtures/dev-fixtures';
import { SYNTHETIC_IMAGE_META } from '../../src/fixtures/synthetic-image';
import { validateCatalogue, validationMarkdown } from '../../src/quality/validate-catalogue';
import { checkSupportLinks, StatusProbe } from '../../src/support-directory/link-checker';
import { freshDatabase } from '../helpers';
import { wipeMediaDir } from '../workflow';

let app: INestApplication;
let pool: Pool;

beforeAll(async () => {
  await wipeMediaDir();
  pool = await freshDatabase();
  await seedRegions(pool);
  app = await createApp();
  await app.init();
  await seedFixtures(app);
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('validate:catalogue', () => {
  it('passes on the synthetic fixtures, including the fixture photo', async () => {
    const results = await validateCatalogue(app);
    const md = validationMarkdown(results, 6);
    expect(results.filter((r) => r.failures.length)).toEqual([]);
    expect(md).toMatch(/^# Catalogue validation: PASS/);
    expect(results.find((r) => r.key === 'images')?.checked).toBe(1);
    expect(results.find((r) => r.key === 'checklist')?.checked).toBe(6);
    expect(results.find((r) => r.key === 'compare-units')?.checked).toBe(15);
  });

  it('fails when a live image is no longer approved, or its file is missing', async () => {
    const { rows } = await pool.query(`SELECT id, storage_key FROM media_assets LIMIT 1`);
    await pool.query(`UPDATE media_assets SET review_state = 'pending', reviewed_at = NULL WHERE id = $1`, [rows[0].id]);
    let results = await validateCatalogue(app);
    expect(results.find((r) => r.key === 'images')?.failures.join(' ')).toMatch(/is pending, not approved/);
    expect(results.find((r) => r.key === 'checklist')?.failures.join(' ')).toMatch(/fictus-captivus v1: Every image is approved/);
    await pool.query(`UPDATE media_assets SET review_state = 'approved', reviewed_at = now() WHERE id = $1`, [rows[0].id]);

    await pool.query(`UPDATE media_assets SET variants = variants || 9999 WHERE id = $1`, [rows[0].id]);
    results = await validateCatalogue(app);
    expect(results.find((r) => r.key === 'images')?.failures.join(' ')).toMatch(/missing its 9999px file/);
    await pool.query(`UPDATE media_assets SET variants = array_remove(variants, 9999) WHERE id = $1`, [rows[0].id]);
    expect((await validateCatalogue(app)).every((r) => !r.failures.length)).toBe(true);
  });

  it('never counts drafts: a species with only a draft is not in the catalogue', async () => {
    const before = (await validateCatalogue(app)).find((r) => r.key === 'drafts')!;
    const sp = (await pool.query(`INSERT INTO species (slug, accepted_scientific_name) VALUES ('fictus-draftonly', 'Fictus draftonly') RETURNING id`)).rows[0].id;
    const user = (await pool.query(`SELECT id FROM staff_users LIMIT 1`)).rows[0].id;
    await pool.query(`INSERT INTO species_revisions (species_id, version, display_group, author_id) VALUES ($1, 1, 'mammal', $2)`, [sp, user]);
    const after = (await validateCatalogue(app)).find((r) => r.key === 'drafts')!;
    expect(after.failures).toEqual([]);
    expect(after.checked).toBe(before.checked);
  });
});

describe('links:check', () => {
  it('records statuses, retries HEAD failures with GET, and never disables a link', async () => {
    const calls: string[] = [];
    const probe: StatusProbe = async (url, method) => {
      calls.push(`${method} ${url}`);
      if (url.includes('volunteer')) return method === 'HEAD' ? { status: 405 } : { status: 200 };
      return { status: 0, error: 'NETWORK' };
    };
    const before = await pool.query(`SELECT id, url, editorial_status FROM support_links ORDER BY url`);
    const results = await checkSupportLinks(app.get<Db>(DB), probe, 0);
    expect(results).toHaveLength(before.rows.length);
    const volunteer = results.find((r) => r.url.includes('volunteer'))!;
    expect(volunteer).toMatchObject({ status: 200, ok: true });
    expect(calls.filter((c) => c.endsWith(volunteer.url))).toEqual([`HEAD ${volunteer.url}`, `GET ${volunteer.url}`]);
    const failed = results.filter((r) => !r.ok);
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((r) => r.status === 0 && r.error === 'NETWORK')).toBe(true);

    const after = await pool.query(`SELECT id, editorial_status, last_status, last_checked_at FROM support_links ORDER BY url`);
    expect(after.rows.map((r) => r.editorial_status)).toEqual(before.rows.map((r) => r.editorial_status));
    expect(after.rows.every((r) => r.last_checked_at !== null)).toBe(true);
    expect(after.rows.find((r) => r.id === volunteer.linkId)?.last_status).toBe(200);
    const audit = await pool.query(`SELECT summary FROM audit_events WHERE action = 'links.check'`);
    expect(audit.rows[0].summary).toMatch(/No link was disabled/);
  });
});

describe('public sources page and sitemap', () => {
  it('lists cited sources with their published species, and the boundary source; never drafts', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/sources').expect(200);
    const fixture = res.body.find((x: { title: string }) => x.title === FIXTURE_SOURCE_TITLE);
    expect(fixture.species.map((x: { slug: string }) => x.slug)).toEqual(expect.arrayContaining(['fictus-captivus', 'fictus-exemplaris']));
    expect(res.body.some((x: { usedForBoundaries: boolean }) => x.usedForBoundaries)).toBe(true);
    const all = res.body.flatMap((x: { species: Array<{ slug: string }> }) => x.species.map((y) => y.slug));
    expect(all).not.toContain('fictus-draftonly');
  });

  it('lists the credit of every published photo (D-055); never a draft photo, never a rejected image', async () => {
    const credits = () => request(app.getHttpServer()).get('/api/v1/credits').expect(200).then((r) => r.body);
    const live = [{
      slug: 'fictus-captivus', scientificName: 'Fictus captivus', commonName: expect.any(String),
      credit: SYNTHETIC_IMAGE_META.credit, license: SYNTHETIC_IMAGE_META.license, sourceUrl: null,
    }];
    expect(await credits()).toEqual(live);

    // The same image on a species that has only a draft is not listed.
    const media = (await pool.query(`SELECT id FROM media_assets LIMIT 1`)).rows[0].id;
    const user = (await pool.query(`SELECT id FROM staff_users LIMIT 1`)).rows[0].id;
    const sp = (await pool.query(`INSERT INTO species (slug, accepted_scientific_name) VALUES ('fictus-photodraft', 'Fictus photodraft') RETURNING id`)).rows[0].id;
    const rev = (await pool.query(`INSERT INTO species_revisions (species_id, version, display_group, author_id) VALUES ($1, 1, 'mammal', $2) RETURNING id`, [sp, user])).rows[0].id;
    await pool.query(
      `INSERT INTO revision_media (revision_id, media_id, alt_text, credit_snapshot, license_snapshot) VALUES ($1, $2, 'Draft photo', 'Draft-only credit', 'CC0')`,
      [rev, media],
    );
    expect(await credits()).toEqual(live);

    // A takedown removes the credit at once, like the photo.
    await pool.query(`UPDATE media_assets SET review_state = 'rejected' WHERE id = $1`, [media]);
    expect(await credits()).toEqual([]);
    await pool.query(`UPDATE media_assets SET review_state = 'approved' WHERE id = $1`, [media]);
  });

  it('lists published species and regions, without drafts or the regions of hidden species', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/sitemap').expect(200);
    expect(res.body.species.map((x: { slug: string }) => x.slug)).toEqual(
      ['fictus-captivus', 'fictus-exemplaris', 'fictus-generalis', 'fictus-marinus', 'fictus-occultus', 'fictus-regionalis'],
    );
    expect(res.body.species.every((x: { publishedAt: string }) => !Number.isNaN(Date.parse(x.publishedAt)))).toBe(true);
    expect(res.body.regions).toEqual(expect.arrayContaining(['kenya', 'fiji', 'madagascar']));
    expect(res.body.regions).not.toContain('peru'); // fictus-occultus (hide_regions) lives only there
  });
});
