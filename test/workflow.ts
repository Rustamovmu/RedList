import { rm } from 'node:fs/promises';
import sharp from 'sharp';
import type { Test } from 'supertest';
import { Auth, authed } from './helpers';

/** Editorial workflow helpers over HTTP, shared by the M4 suites. All taxa are synthetic. */

export type Rev = { id: string; speciesId: string; updatedAt: string; state: string; version: number };

export function workflow(http: () => { get: (u: string) => Test; post: (u: string) => Test; put: (u: string) => Test }) {
  const content = (overview: string, sourceId: string, extra: Record<string, unknown> = {}) => ({
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
    ...extra,
  });

  async function save(auth: Auth, rev: Rev, body: object, status = 200): Promise<Rev> {
    const res = await authed(http().put(`/api/v1/staff/revisions/${rev.id}`), auth).send({ ...body, expectedUpdatedAt: rev.updatedAt });
    if (res.status !== status) throw new Error(`save: expected ${status}, got ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  }
  const submit = (auth: Auth, id: string) => authed(http().post(`/api/v1/staff/revisions/${id}/submit`), auth);
  const publish = (auth: Auth, id: string) => authed(http().post(`/api/v1/staff/revisions/${id}/publish`), auth);
  const newDraft = async (auth: Auth, speciesId: string): Promise<Rev> =>
    (await authed(http().post(`/api/v1/staff/species/${speciesId}/drafts`), auth).expect(201)).body;

  /** Saves, submits (as `editor`) and publishes (as `admin`). */
  async function saveAndPublish(editor: Auth, admin: Auth, rev: Rev, body: object): Promise<Rev> {
    const saved = await save(editor, rev, body);
    await submit(editor, saved.id).expect(200);
    return (await publish(admin, saved.id).expect(200)).body;
  }

  async function createSpecies(editor: Auth, slug: string): Promise<Rev> {
    const draft: Rev = (
      await authed(http().post('/api/v1/staff/species'), editor)
        .send({ slug, acceptedScientificName: 'Fictus testus', rank: 'species', displayGroup: 'mammal' })
        .expect(201)
    ).body;
    await authed(http().post(`/api/v1/staff/species/${draft.speciesId}/identifiers`), editor).send({ provider: 'fixture', externalId: slug }).expect(201);
    return draft;
  }

  return { content, save, submit, publish, newDraft, saveAndPublish, createSpecies };
}

/** A synthetic photo-like JPEG (gradient + noise), optionally with an EXIF block that includes a GPS position. */
export async function syntheticJpeg(width = 1400, height = 900, withGps = false): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      raw[i] = (x * 255) / width;
      raw[i + 1] = (y * 255) / height;
      raw[i + 2] = ((x + y) * 7) % 255;
    }
  }
  let img = sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 85 });
  if (withGps) {
    img = img.withExif({
      IFD0: { Artist: 'Synthetic test creator', ImageDescription: 'synthetic test image' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '12/1 34/1 56/1', GPSLongitudeRef: 'E', GPSLongitude: '65/1 43/1 21/1' },
    });
  }
  return img.toBuffer();
}

export async function wipeMediaDir() {
  const dir = process.env.MEDIA_DIR;
  if (!dir || !dir.includes('test')) throw new Error('MEDIA_DIR in .env.test must be a test directory');
  await rm(dir, { recursive: true, force: true });
}
