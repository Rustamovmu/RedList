/**
 * M4 content operations (PLAN §12 gate, §13 required tests):
 * - media upload rejection (SVG, HTML disguised as JPEG, oversize, NC licence), metadata stripping, review, serving
 * - rollback is audited, guarded and revalidates
 * - credits, licences and citations survive a media or source edit
 * - published pages are served with all outbound network blocked
 * Real app, real PostGIS. All taxa and images are synthetic.
 */
import { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import sharp from 'sharp';
import request from 'supertest';
import { createApp } from '../../src/bootstrap';
import { seedRegions } from '../../src/cli/seed-regions';
import { RevalidationService } from '../../src/editorial/revalidation.service';
import { Auth, authed, createStaff, freshDatabase, login } from '../helpers';
import { Rev, syntheticJpeg, wipeMediaDir, workflow } from '../workflow';

let app: INestApplication;
let pool: Pool;
let admin: Auth;
let editor: Auth;
let sourceId: string;
let jpeg: Buffer;
const http = () => request(app.getHttpServer());
const wf = workflow(http);
const pub = (slug: string) => http().get(`/api/v1/species/${slug}`);

const META = { creator: 'Synthetic Creator', credit: 'Photo: Synthetic Creator, CC BY 4.0', license: 'CC BY 4.0', sourceUrl: 'https://example.org/synthetic-photo' };

function upload(auth: Auth, file: Buffer, filename: string, contentType: string, meta: Record<string, string> = META) {
  let t = authed(http().post('/api/v1/staff/media'), auth).attach('file', file, { filename, contentType });
  for (const [k, v] of Object.entries(meta)) t = t.field(k, v);
  return t;
}

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
  sourceId = (await authed(http().post('/api/v1/staff/sources'), editor).send({ title: 'Synthetic source for M4 tests' }).expect(201)).body.id;
  jpeg = await syntheticJpeg(1400, 900, true);
});
afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('media upload', () => {
  it('refuses uploads without a session or CSRF token before reading the file', async () => {
    await http().post('/api/v1/staff/media').attach('file', jpeg, 'x.jpg').expect(401);
    await http()
      .post('/api/v1/staff/media')
      .set('Cookie', editor.cookie)
      .set('Origin', 'http://localhost:3000')
      .attach('file', jpeg, 'x.jpg')
      .expect(403);
  });

  it('refuses SVG, HTML renamed to .jpg, and non-images, by content not by name', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect((await upload(editor, svg, 'a.svg', 'image/svg+xml').expect(422)).body.error.code).toBe('MEDIA_UNSUPPORTED_TYPE');
    const html = Buffer.from('<!doctype html><html><body>not an image</body></html>');
    expect((await upload(editor, html, 'photo.jpg', 'image/jpeg').expect(422)).body.error.code).toBe('MEDIA_UNSUPPORTED_TYPE');
    // JPEG magic bytes followed by garbage: sniffed as JPEG, but the decoder refuses it.
    const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]);
    expect((await upload(editor, fake, 'photo.jpg', 'image/jpeg').expect(422)).body.error.code).toMatch(/^MEDIA_(UNREADABLE|UNSUPPORTED_TYPE)$/);
  });

  it('refuses files over the size limit', async () => {
    const big = Buffer.concat([jpeg, Buffer.alloc(16_000_000)]);
    const res = await upload(editor, big, 'big.jpg', 'image/jpeg').expect(413);
    expect(res.body.error).toBeDefined();
  });

  it('refuses licences outside the allow-list (NC, ND, all rights reserved)', async () => {
    for (const license of ['CC BY-NC 4.0', 'CC BY-ND 4.0', 'All rights reserved']) {
      const res = await upload(editor, jpeg, 'x.jpg', 'image/jpeg', { ...META, license }).expect(422);
      expect(res.body.error.code).toBe('LICENCE_NOT_ALLOWED');
    }
  });

  it('re-encodes to WebP variants without EXIF or GPS, and stores the image as pending', async () => {
    expect((await sharp(jpeg).metadata()).exif).toBeDefined(); // the input really carries EXIF + GPS
    const res = await upload(editor, jpeg, 'x.jpg', 'image/jpeg').expect(201);
    expect(res.body).toMatchObject({ reviewState: 'pending', license: 'CC BY 4.0', variants: [320, 640, 960, 1280, 1400], width: 1400 });
    expect(res.body.modifications).toMatch(/re-encoded as WebP; embedded metadata removed/);
    const preview = await http().get(`/api/v1/staff/media/${res.body.id}/preview/640.webp`).set('Cookie', editor.cookie).expect(200);
    expect(preview.headers['content-type']).toBe('image/webp');
    const meta = await sharp(preview.body as Buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.width).toBe(640);
    // The same bytes again are a duplicate, not a second asset.
    expect((await upload(editor, jpeg, 'again.jpg', 'image/jpeg').expect(409)).body.error.code).toBe('DUPLICATE_MEDIA');
  });

  it('serves nothing publicly until an admin approves; editors cannot approve; rejection is a takedown', async () => {
    const img = await syntheticJpeg(800, 600);
    const m = (await upload(editor, img, 'y.png', 'image/jpeg').expect(201)).body;
    expect(m.variants).toEqual([320, 640, 800]);
    await http().get(`/api/v1/media/${m.storageKey}/640.webp`).expect(404);
    await authed(http().post(`/api/v1/staff/media/${m.id}/approve`), editor).expect(403);
    await authed(http().post(`/api/v1/staff/media/${m.id}/approve`), admin).expect(200);
    const ok = await http().get(`/api/v1/media/${m.storageKey}/600.webp`).expect(200);
    expect(ok.headers['content-type']).toBe('image/webp');
    expect(ok.headers['cache-control']).toBe('public, max-age=86400');
    expect((await sharp(ok.body as Buffer).metadata()).width).toBe(640); // nearest variant at least as wide
    expect((await sharp((await http().get(`/api/v1/media/${m.storageKey}/1920.webp`).expect(200)).body as Buffer).metadata()).width).toBe(800);
    await authed(http().post(`/api/v1/staff/media/${m.id}/reject`), admin).send({ note: 'Licence could not be confirmed' }).expect(200);
    await http().get(`/api/v1/media/${m.storageKey}/640.webp`).expect(404);
    // Path tricks never reach the disk.
    await http().get('/api/v1/media/..%2F..%2Fetc/640.webp').expect(404);
    await http().get(`/api/v1/media/${m.storageKey}/..%2F640.webp`).expect(404);
    const audits = await pool.query(`SELECT action FROM audit_events WHERE entity_id = $1 ORDER BY created_at`, [m.id]);
    expect(audits.rows.map((r) => r.action)).toEqual(['media.upload', 'media.approve', 'media.reject']);
  });

  it('the database itself refuses to approve an image with an NC licence or without a credit', async () => {
    const m = (await upload(editor, await syntheticJpeg(500, 400), 'z.jpg', 'image/jpeg').expect(201)).body;
    await expect(pool.query(`UPDATE media_assets SET license = 'CC BY-NC 4.0', review_state = 'approved', reviewed_at = now() WHERE id = $1`, [m.id])).rejects.toMatchObject({ code: '23514' });
    await expect(pool.query(`UPDATE media_assets SET credit = ' ', review_state = 'approved', reviewed_at = now() WHERE id = $1`, [m.id])).rejects.toMatchObject({ code: '23514' });
  });
});

describe('credits, licences and citations survive edits', () => {
  it('keeps the published snapshot when the image metadata or the source is edited, and new drafts pick up the change', async () => {
    const m = (await upload(editor, await syntheticJpeg(1000, 700), 'p.jpg', 'image/jpeg').expect(201)).body;
    await authed(http().post(`/api/v1/staff/media/${m.id}/approve`), admin).expect(200);
    const src = (await authed(http().post('/api/v1/staff/sources'), editor).send({ title: 'Synthetic field guide', publisher: 'Example Press', publishedOn: '2019-05-01' }).expect(201)).body;
    const v1 = await wf.createSpecies(editor, 'fictus-snapshot');
    const body = wf.content('Snapshot test', src.id, {
      citations: [{ sectionKey: 'overview', sourceId: src.id, locator: 'p. 12' }],
      assessments: [{ sourceId: src.id, scope: 'global', category: 'EN', trend: 'decreasing', assessedOn: '2019-01-01' }],
      media: [{ mediaId: m.id, position: 0, role: 'primary', altText: 'A synthetic test image' }],
    });
    await wf.saveAndPublish(editor, admin, v1, body);

    // Edit the image metadata (licence corrected to CC BY-SA) and the source (new edition).
    const edited = await authed(http().put(`/api/v1/staff/media/${m.id}`), editor)
      .send({ ...META, credit: 'Photo: Corrected Name, CC BY-SA 4.0', license: 'CC BY-SA 4.0' })
      .expect(200);
    expect(edited.body.reviewState).toBe('pending');
    const srcEdit = await authed(http().put(`/api/v1/staff/sources/${src.id}`), editor)
      .send({ title: 'Synthetic field guide (2nd edition)', publisher: 'Example Press', publishedOn: '2023-02-01' })
      .expect(200);
    expect(srcEdit.body.createdNewRow).toBe(true);
    expect(srcEdit.body.source.id).not.toBe(src.id);

    expect((await http().get(`/api/v1/staff/media/${m.id}`).set('Cookie', editor.cookie).expect(200)).body.usedByRevisions).toBe(1);
    // The staff species carries the live photo, so the admin pages can show it: the revision's own snapshot
    // credit, and the asset's review state now (pending again after the edit above).
    const staffSp = (await http().get(`/api/v1/staff/species/${v1.speciesId}`).set('Cookie', editor.cookie).expect(200)).body;
    expect(staffSp.publishedPhotos).toHaveLength(1);
    expect(staffSp.publishedPhotos[0]).toMatchObject({
      mediaId: m.id, role: 'primary', position: 0, altText: 'A synthetic test image',
      credit: 'Photo: Synthetic Creator, CC BY 4.0', license: 'CC BY 4.0', reviewState: 'pending',
    });
    const page = (await pub('fictus-snapshot').expect(200)).body;
    expect(page.media[0]).toMatchObject({ credit: 'Photo: Synthetic Creator, CC BY 4.0', license: 'CC BY 4.0' });
    expect(page.sources.find((x: { id: string }) => x.id === src.id)).toMatchObject({ title: 'Synthetic field guide', publishedOn: '2019-05-01' });
    // Still served: it was approved when this revision was published, and the page shows that snapshot.
    await http().get(`/api/v1/media/${m.storageKey}/640.webp`).expect(200);
    const old = await pool.query(`SELECT title FROM sources WHERE id = $1`, [src.id]);
    expect(old.rows[0].title).toBe('Synthetic field guide');

    // A new draft snapshots the current credit; publishing it waits for the image to be reviewed again.
    const draft = await wf.newDraft(editor, v1.speciesId);
    const d = (await http().get(`/api/v1/staff/revisions/${draft.id}`).set('Cookie', editor.cookie).expect(200)).body;
    const resaved = await wf.save(editor, draft, { ...d.content, citations: [{ sectionKey: 'overview', sourceId: srcEdit.body.source.id }] });
    expect((await wf.submit(editor, resaved.id).expect(422)).body.error.details.join(' ')).toMatch(/approved/);
    const snap = await pool.query(`SELECT credit_snapshot, license_snapshot FROM revision_media WHERE revision_id = $1`, [draft.id]);
    expect(snap.rows[0]).toEqual({ credit_snapshot: 'Photo: Corrected Name, CC BY-SA 4.0', license_snapshot: 'CC BY-SA 4.0' });
  });

  it('edits an uncited source in place', async () => {
    const src = (await authed(http().post('/api/v1/staff/sources'), editor).send({ title: 'Uncited synthetic source' }).expect(201)).body;
    const res = await authed(http().put(`/api/v1/staff/sources/${src.id}`), editor).send({ title: 'Uncited synthetic source (fixed typo)' }).expect(200);
    expect(res.body).toMatchObject({ createdNewRow: false, source: { id: src.id, title: 'Uncited synthetic source (fixed typo)' } });
  });
});

describe('rollback', () => {
  let speciesId: string;
  let v1: Rev;
  let v2: Rev;
  beforeAll(async () => {
    const d1 = await wf.createSpecies(editor, 'fictus-rollback');
    speciesId = d1.speciesId;
    v1 = await wf.saveAndPublish(editor, admin, d1, wf.content('Version ONE', sourceId));
    v2 = await wf.saveAndPublish(editor, admin, await wf.newDraft(editor, speciesId), wf.content('Version TWO', sourceId));
    expect((await pub('fictus-rollback').expect(200)).body.overview).toBe('Version TWO');
  });

  it('is admin-only and needs CSRF', async () => {
    const body = { targetRevisionId: v1.id, expectedPublishedRevisionId: v2.id, reason: 'test' };
    await authed(http().post(`/api/v1/staff/species/${speciesId}/rollback`), editor).send(body).expect(403);
    await http().post(`/api/v1/staff/species/${speciesId}/rollback`).set('Cookie', admin.cookie).set('Origin', 'http://localhost:3000').send(body).expect(403);
  });

  it('refuses drafts, the live revision, other species and a stale view', async () => {
    const draft = await wf.newDraft(editor, speciesId);
    const go = (b: object) => authed(http().post(`/api/v1/staff/species/${speciesId}/rollback`), admin).send({ reason: 'test', ...b });
    expect((await go({ targetRevisionId: draft.id, expectedPublishedRevisionId: v2.id }).expect(422)).body.error.code).toBe('NOT_PUBLISHED');
    expect((await go({ targetRevisionId: v2.id, expectedPublishedRevisionId: v2.id }).expect(422)).body.error.code).toBe('ALREADY_LIVE');
    expect((await go({ targetRevisionId: v1.id, expectedPublishedRevisionId: v1.id }).expect(409)).body.error.code).toBe('ROLLBACK_CONFLICT');
    const other = await wf.saveAndPublish(editor, admin, await wf.createSpecies(editor, 'fictus-other'), wf.content('Other', sourceId));
    expect((await go({ targetRevisionId: other.id, expectedPublishedRevisionId: v2.id }).expect(422)).body.error.code).toBe('NOT_PUBLISHED');
  });

  it('restores v1 on the profile and in the catalogue, writes an audit event and revalidates', async () => {
    const spy = jest.spyOn(app.get(RevalidationService), 'revalidate');
    const res = await authed(http().post(`/api/v1/staff/species/${speciesId}/rollback`), admin)
      .send({ targetRevisionId: v1.id, expectedPublishedRevisionId: v2.id, reason: 'v2 had an error' })
      .expect(200);
    expect(res.body.publishedRevisionId).toBe(v1.id);
    const page = (await pub('fictus-rollback').expect(200)).body;
    expect(page.overview).toBe('Version ONE');
    expect(page.review.version).toBe(1);
    expect(spy).toHaveBeenCalledWith(['species:fictus-rollback', 'catalogue']);
    const audit = await pool.query(`SELECT summary, actor_id FROM audit_events WHERE action = 'species.rollback' AND entity_id = $1`, [speciesId]);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].summary).toMatch(/from v2 .* to v1 .*Reason: v2 had an error/);
    expect(audit.rows[0].actor_id).toBeTruthy();
    // A draft based on v2 can no longer be published over the restored v1.
    const stale = await wf.newDraft(editor, speciesId); // based on v1 now
    expect(stale.version).toBeGreaterThan(2);
    // And rolling forward again works (it is just another published revision).
    await authed(http().post(`/api/v1/staff/species/${speciesId}/rollback`), admin)
      .send({ targetRevisionId: v2.id, expectedPublishedRevisionId: v1.id, reason: 'fixed' })
      .expect(200);
    expect((await pub('fictus-rollback').expect(200)).body.overview).toBe('Version TWO');
    spy.mockRestore();
  });

  it('a draft started before a rollback cannot be published over it', async () => {
    const before = await wf.newDraft(editor, speciesId); // base = v2 (live)
    await authed(http().post(`/api/v1/staff/species/${speciesId}/rollback`), admin)
      .send({ targetRevisionId: v1.id, expectedPublishedRevisionId: v2.id, reason: 'again' })
      .expect(200);
    const saved = await wf.save(editor, before, wf.content('Stale draft', sourceId));
    await wf.submit(editor, saved.id).expect(200);
    expect((await wf.publish(admin, saved.id).expect(409)).body.error.code).toBe('PUBLISH_CONFLICT');
  });
});

describe('published pages need no outbound network', () => {
  it('serves profile, list, filters, compare, map, region, support and images with fetch, DNS and https blocked', async () => {
    const m = (await upload(editor, await syntheticJpeg(700, 500), 'o.jpg', 'image/jpeg').expect(201)).body;
    await authed(http().post(`/api/v1/staff/media/${m.id}/approve`), admin).expect(200);
    const d = await wf.createSpecies(editor, 'fictus-offline');
    const fiji = (await pool.query(`SELECT id FROM regions WHERE slug = 'fiji'`)).rows[0].id;
    await wf.saveAndPublish(editor, admin, d, wf.content('Offline test', sourceId, {
      media: [{ mediaId: m.id, position: 0, role: 'primary', altText: 'Synthetic' }],
      regions: [{ regionId: fiji, presence: 'extant', origin: 'native', seasonality: 'resident', sourceId }],
    }));

    // Listen on an IP before blocking DNS: supertest's own ephemeral server start uses dns.lookup.
    const server = app.getHttpServer() as import('node:http').Server;
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
    const blocked = () => {
      throw new Error('outbound network attempted');
    };
    // The CommonJS module objects (what the app's compiled code calls), not TypeScript namespace copies.
    /* eslint-disable @typescript-eslint/no-require-imports */
    const https = require('node:https') as typeof import('node:https');
    const dns = require('node:dns') as typeof import('node:dns');
    const dnsPromises = require('node:dns/promises') as typeof import('node:dns/promises');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const spies = [
      jest.spyOn(globalThis, 'fetch').mockImplementation(blocked),
      jest.spyOn(https, 'request').mockImplementation(blocked),
      jest.spyOn(https, 'get').mockImplementation(blocked),
      jest.spyOn(dns, 'lookup').mockImplementation(blocked),
      jest.spyOn(dnsPromises, 'lookup').mockImplementation(blocked),
    ];
    try {
      for (const url of [
        '/api/v1/species/fictus-offline', '/api/v1/species', '/api/v1/species?q=fictus', '/api/v1/filters', '/api/v1/compare?species=fictus-offline,fictus-rollback',
        '/api/v1/map', '/api/v1/map?species=fictus-offline', '/api/v1/map/basemap', '/api/v1/regions/fiji', '/api/v1/support',
        `/api/v1/media/${m.storageKey}/640.webp`,
      ]) {
        const res = await request(base).get(url);
        expect({ url, status: res.status }).toEqual({ url, status: 200 });
      }
      for (const sp of spies) expect(sp).not.toHaveBeenCalled();
    } finally {
      spies.forEach((sp) => sp.mockRestore());
      await new Promise((r) => server.close(r));
    }

    // Rejecting an image afterwards is a takedown: it leaves the profile and the cards at once, without a new revision.
    expect((await pub('fictus-offline').expect(200)).body.media).toHaveLength(1);
    await authed(http().post(`/api/v1/staff/media/${m.id}/reject`), admin).send({ note: 'Takedown request' }).expect(200);
    expect((await pub('fictus-offline').expect(200)).body.media).toEqual([]);
    const cards = (await http().get('/api/v1/species?q=fictus').expect(200)).body.items;
    expect(cards.find((c: { slug: string }) => c.slug === 'fictus-offline').image).toBeNull();
    await http().get(`/api/v1/media/${m.storageKey}/640.webp`).expect(404);
  });
});
