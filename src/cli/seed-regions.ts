/**
 * Loads country and ocean/sea regions from Natural Earth 1:110m (public domain) into `regions`.
 * The script is idempotent: it upserts by slug, so re-running it changes nothing unless the data changed.
 *
 *   npm run db:seed:regions
 *
 * Geometry is validated (ST_MakeValid), polygons are extracted and stored as MultiPolygon in 4326.
 * Natural Earth already splits shapes at the antimeridian.
 */
import { config } from 'dotenv';
config({ quiet: true });
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';

type Feature = { properties: Record<string, unknown>; geometry: unknown };

const DATA = path.resolve(__dirname, '../../data/natural-earth');

export function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function iso2(p: Record<string, unknown>): string | null {
  for (const k of ['ISO_A2_EH', 'ISO_A2']) {
    const v = p[k];
    if (typeof v === 'string' && /^[A-Z]{2}$/.test(v)) return v;
  }
  return null;
}

export async function seedRegions(pool: Pool): Promise<{ countries: number; marine: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const src = await client.query<{ id: string }>(
      `INSERT INTO sources (title, publisher, url, license, permitted_use_note, accessed_on)
       SELECT 'Natural Earth 1:110m Cultural and Physical Vectors', 'Natural Earth', 'https://www.naturalearthdata.com/',
              'Public domain', 'Free to use in any type of project; attribution appreciated, not required.', CURRENT_DATE
       WHERE NOT EXISTS (SELECT 1 FROM sources WHERE url = 'https://www.naturalearthdata.com/' AND title LIKE 'Natural Earth 1:110m%')
       RETURNING id`,
    );
    const sourceId =
      src.rows[0]?.id ??
      (await client.query<{ id: string }>(`SELECT id FROM sources WHERE title LIKE 'Natural Earth 1:110m%' LIMIT 1`)).rows[0].id;

    const upsert = `
      INSERT INTO regions (slug, name, type, iso_a2, geom, source_id)
      VALUES ($1, $2, $3::region_type, $4,
              ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326)), 3)), $6)
      ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, iso_a2 = EXCLUDED.iso_a2,
        geom = EXCLUDED.geom, source_id = EXCLUDED.source_id
      WHERE regions.geom IS DISTINCT FROM EXCLUDED.geom OR regions.name IS DISTINCT FROM EXCLUDED.name`;

    const countries = JSON.parse(readFileSync(path.join(DATA, 'ne_110m_admin_0_countries.geojson'), 'utf8')) as { features: Feature[] };
    const seenIso = new Set<string>();
    let c = 0;
    for (const f of countries.features) {
      const name = String(f.properties.NAME ?? f.properties.ADMIN);
      let code = iso2(f.properties);
      if (code && seenIso.has(code)) code = null; // keep iso_a2 unique (a few NE units share a code)
      if (code) seenIso.add(code);
      await client.query(upsert, [slugify(name), name, 'country', code, JSON.stringify(f.geometry), sourceId]);
      c++;
    }

    const marine = JSON.parse(readFileSync(path.join(DATA, 'ne_110m_geography_marine_polys.geojson'), 'utf8')) as { features: Feature[] };
    let m = 0;
    for (const f of marine.features) {
      const raw = String(f.properties.name ?? f.properties.NAME);
      const name = raw === raw.toUpperCase() ? raw.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase()) : raw;
      const cls = String(f.properties.featurecla);
      const type = cls === 'ocean' ? 'ocean' : cls === 'sea' ? 'sea' : 'other';
      await client.query(upsert, [slugify(name), name, type, null, JSON.stringify(f.geometry), sourceId]);
      m++;
    }
    await client.query('COMMIT');
    return { countries: c, marine: m };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  seedRegions(pool)
    .then((r) => console.log(`regions: ${r.countries} countries, ${r.marine} marine areas`))
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
