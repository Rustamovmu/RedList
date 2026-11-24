import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { SQL, sql } from 'drizzle-orm';
import type { PoolClient } from 'pg';
import { DISPLAY_NAME, HEADLINE, ListFilters, PUBLISHED, selectCards, whereClause } from '../catalogue/catalogue-sql';
import type { DbOrTx, Tx } from '../db/db.module';
import { Bbox, bboxWidth, envelopes } from './bbox';
import type { CountryPresenceDto, MapDto, MapRangeDto, MultiPolygonDto, RegionDto, SpeciesPinDto } from './dto';
import { geometryProblem, MAX_RANGE_VERTICES } from './geo-schema';

/**
 * THE home of spatial SQL (AGENTS.md "Code conventions"). Every statement is parameterized.
 * Geometry never leaves this file as raw PostGIS values: reads use ST_AsGeoJSON, writes go through the
 * normalization below (validity, antimeridian split, vertex cap, generalization for sensitive species).
 * Error messages never contain coordinates: PostGIS messages are not passed on, and nothing here logs.
 */

export const MAP_MAX_SPECIES = 200;
export const MAP_MAX_VERTICES = 20_000;
/** Shown on generalized shapes. The precise input is never stored. */
export const GENERALIZATION_NOTE = 'Generalized to whole countries or seas to protect this species.';

export type Sensitivity = 'none' | 'generalize_country' | 'hide_regions';
type Seasonality = MapRangeDto['seasonality'];
type Presence = MapRangeDto['presence'];

export type RangeWrite = {
  sourceId: string;
  seasonality: Seasonality;
  presence: Presence;
  datasetVersion?: string | null;
  generalizationNote?: string | null;
  geometry: unknown;
};
export type RangeRead = Omit<RangeWrite, 'geometry'> & { geometry: MultiPolygonDto };

/** Splits at ±180 (moving the parts past it back into range), then repairs and keeps polygons only. */
const normalized = (input: SQL) => sql`ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_WrapX(ST_WrapX(${input}, 180, -360), -180, 360)), 3))`;

/** The viewport as one geometry: one envelope, or two when the box crosses the antimeridian. */
function envelope(b: Bbox): SQL {
  const parts = envelopes(b).map(([w, s, e, n]) => sql`ST_MakeEnvelope(${w}::float8, ${s}::float8, ${e}::float8, ${n}::float8, 4326)`);
  return parts.length === 1 ? parts[0] : sql`ST_Multi(ST_Collect(${parts[0]}, ${parts[1]}))`;
}

const invalid = (message: string) => new UnprocessableEntityException({ code: 'INVALID_GEOMETRY', message });

/** Used by the seed-regions CLI (a plain pg client, outside Nest). Upserts by slug; unchanged rows are not rewritten. */
export async function upsertRegion(
  client: PoolClient,
  r: { slug: string; name: string; type: 'country' | 'ocean' | 'sea' | 'other'; isoA2: string | null; geometry: unknown; sourceId: string },
): Promise<void> {
  await client.query(
    `INSERT INTO regions (slug, name, type, iso_a2, geom, source_id)
     VALUES ($1, $2, $3::region_type, $4,
             ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326)), 3)), $6)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, iso_a2 = EXCLUDED.iso_a2,
       geom = EXCLUDED.geom, source_id = EXCLUDED.source_id
     WHERE regions.geom IS DISTINCT FROM EXCLUDED.geom OR regions.name IS DISTINCT FROM EXCLUDED.name`,
    [r.slug, r.name, r.type, r.isoA2, JSON.stringify(r.geometry), r.sourceId],
  );
}

@Injectable()
export class GeoRepository {
  // ---------- staff: ranges of one revision ----------

  /**
   * Inserts the ranges of a draft revision (the caller has already deleted the old ones).
   * - hide_regions: refused. No precise geometry is ever stored for a hidden species.
   * - generalize_country: the stored shape is the union of the whole countries the input covers
   *   (or seas/oceans if it covers no country). The precise input is discarded inside this statement.
   * Idempotent for generalized shapes: re-saving a country union yields the same union, because a region
   * counts only when it overlaps more than 0.1% of the input's area (shared borders do not count).
   */
  async insertRanges(tx: Tx, revisionId: string, sensitivity: Sensitivity, ranges: RangeWrite[]): Promise<void> {
    if (!ranges.length) return;
    if (sensitivity === 'hide_regions') {
      throw new UnprocessableEntityException({
        code: 'SENSITIVE_RANGE',
        message: 'This species hides its locations, so range polygons are not accepted. Its regions are stored but never published.',
      });
    }
    const generalize = sensitivity === 'generalize_country';
    for (const [i, r] of ranges.entries()) {
      const problem = geometryProblem(r.geometry);
      if (problem) throw invalid(`ranges[${i}]: ${problem}`);
      const input = sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(r.geometry)}), 4326)`;
      const [check] = (await tx.execute<{ valid: boolean }>(sql`SELECT ST_IsValid(${input}) AS valid`)).rows;
      if (!check.valid) throw invalid(`ranges[${i}]: geometry is not valid (for example, a ring crosses itself or a hole lies outside its shell)`);

      const finalGeom = generalize
        ? sql`(
            WITH g AS (SELECT ${normalized(input)} AS geom),
            hits AS (
              SELECT rg.type, rg.geom FROM regions rg, g
              WHERE rg.geom IS NOT NULL AND rg.geom && g.geom AND ST_Area(ST_Intersection(rg.geom, g.geom)) > 0.001 * ST_Area(g.geom)
            ),
            pick AS (
              SELECT geom FROM hits WHERE type = 'country'
              UNION ALL SELECT geom FROM hits WHERE NOT EXISTS (SELECT 1 FROM hits WHERE type = 'country')
            )
            SELECT ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Union(geom)), 3)) FROM pick)`
        : normalized(input);

      const res = await tx.execute<{ id: string }>(sql`
        WITH f AS (SELECT ${finalGeom} AS geom)
        INSERT INTO species_ranges (revision_id, source_id, geom, seasonality, presence, dataset_version, generalization_note)
        SELECT ${revisionId}, ${r.sourceId}, f.geom, ${r.seasonality}::seasonality, ${r.presence}::presence, ${r.datasetVersion ?? null},
               ${generalize ? GENERALIZATION_NOTE : (r.generalizationNote ?? null)}
        FROM f WHERE f.geom IS NOT NULL AND NOT ST_IsEmpty(f.geom) AND ST_NPoints(f.geom) <= ${MAX_RANGE_VERTICES}
        RETURNING id`);
      if (!res.rows.length) {
        throw invalid(
          generalize
            ? `ranges[${i}]: the shape does not cover any known country or sea, so it cannot be generalized`
            : `ranges[${i}]: the shape is empty or has more than ${MAX_RANGE_VERTICES} vertices after splitting at ±180`,
        );
      }
    }
  }

  /** Staff side only (draft editor and draft copy). Public reads use mapQuery. */
  async loadRanges(db: DbOrTx, revisionId: string): Promise<RangeRead[]> {
    const res = await db.execute<{
      source_id: string; seasonality: Seasonality; presence: Presence; dataset_version: string | null; generalization_note: string | null; geometry: MultiPolygonDto;
    }>(sql`
      SELECT source_id, seasonality, presence, dataset_version, generalization_note, ST_AsGeoJSON(geom, 9)::json AS geometry
      FROM species_ranges WHERE revision_id = ${revisionId}
      ORDER BY seasonality, presence, ST_XMin(geom), id`);
    return res.rows.map((r) => ({
      sourceId: r.source_id, seasonality: r.seasonality, presence: r.presence, datasetVersion: r.dataset_version,
      generalizationNote: r.generalization_note, geometry: r.geometry,
    }));
  }

  // ---------- public ----------

  /** Natural Earth countries, seas and oceans at reduced precision (3 decimals ≈ 100 m), for the map base layer. */
  async basemap(db: DbOrTx): Promise<Array<{ slug: string; name: string; kind: RegionDto['type']; geometry: MultiPolygonDto }>> {
    const res = await db.execute<{ slug: string; name: string; kind: RegionDto['type']; geometry: MultiPolygonDto }>(sql`
      SELECT slug, name, type AS kind, ST_AsGeoJSON(geom, 3)::json AS geometry
      FROM regions WHERE geom IS NOT NULL ORDER BY type, slug`);
    return res.rows;
  }

  /**
   * One point per published species, for the pins on the home page globe (DECISIONS D-064).
   * - The place is a country, sea or ocean where the species is recorded as living: present (extant, probably or
   *   possibly extant) and native or reintroduced. Firmer records first (extant, native, resident), then the SMALLEST
   *   such place, so the pin lands as close to where the species lives as region-level data allows.
   * - The point is inside the place (ST_PointOnSurface): it says "recorded in this place", never "here exactly".
   * - hide_regions species never get a pin, even when asked for by slug. generalize_country species may: their
   *   places are already public at whole-country level. Drafts, archived and unknown slugs are simply absent.
   */
  async pins(db: DbOrTx, slugs: string[]): Promise<SpeciesPinDto[]> {
    if (!slugs.length) return [];
    const res = await db.execute<{ slug: string; place_slug: string; place_name: string; place_type: RegionDto['type']; lat: number; lng: number }>(sql`
      WITH p AS (${PUBLISHED}),
      pick AS (
        SELECT DISTINCT ON (p.slug) p.slug, rg.id AS region_id
        FROM p
        JOIN species_regions spr ON spr.revision_id = p.revision_id
        JOIN regions rg ON rg.id = spr.region_id
        WHERE p.slug = ANY(${sql.param(slugs)}::text[])
          AND p.location_sensitivity <> 'hide_regions'
          AND rg.geom IS NOT NULL
          AND spr.presence IN ('extant', 'probably_extant', 'possibly_extant')
          AND spr.origin IN ('native', 'reintroduced')
        ORDER BY p.slug, (spr.presence = 'extant') DESC, (spr.origin = 'native') DESC, (spr.seasonality = 'resident') DESC,
                 ST_Area(rg.geom::geography), rg.slug
      )
      SELECT pick.slug, rg.slug AS place_slug, rg.name AS place_name, rg.type AS place_type,
             round(ST_Y(pt.g)::numeric, 3)::float8 AS lat, round(ST_X(pt.g)::numeric, 3)::float8 AS lng
      FROM pick JOIN regions rg ON rg.id = pick.region_id
      CROSS JOIN LATERAL (SELECT ST_PointOnSurface(rg.geom) AS g) pt
      ORDER BY pick.slug`);
    return res.rows.map((r) => ({ slug: r.slug, place: { slug: r.place_slug, name: r.place_name, type: r.place_type }, lat: r.lat, lng: r.lng }));
  }

  async regionBySlug(db: DbOrTx, slug: string): Promise<RegionDto | null> {
    const res = await db.execute<{
      slug: string; name: string; type: RegionDto['type']; iso_a2: string | null;
      source_title: string | null; source_url: string | null; source_license: string | null;
      x1: number | null; x2: number | null; y1: number | null; y2: number | null; sx1: number | null; sx2: number | null;
    }>(sql`
      SELECT r.slug, r.name, r.type, r.iso_a2, s.title AS source_title, s.url AS source_url, s.license AS source_license,
             ST_XMin(r.geom) AS x1, ST_XMax(r.geom) AS x2, ST_YMin(r.geom) AS y1, ST_YMax(r.geom) AS y2,
             ST_XMin(ST_ShiftLongitude(r.geom)) AS sx1, ST_XMax(ST_ShiftLongitude(r.geom)) AS sx2
      FROM regions r LEFT JOIN sources s ON s.id = r.source_id
      WHERE r.slug = ${slug}`);
    const r = res.rows[0];
    if (!r) return null;
    let bbox: number[] | null = null;
    if (r.x1 !== null && r.x2 !== null && r.y1 !== null && r.y2 !== null) {
      bbox = [r.x1, r.y1, r.x2, r.y2];
      // A region split at ±180 (Fiji) spans the whole width; measured in 0…360 it is small. Use whichever is narrower.
      if (r.sx1 !== null && r.sx2 !== null && r.sx2 - r.sx1 < r.x2 - r.x1 - 1e-9) {
        const wrap = (x: number) => (x > 180 ? x - 360 : x);
        bbox = [wrap(r.sx1), r.y1, wrap(r.sx2), r.y2];
      }
      bbox = bbox.map((v) => Math.round(v * 1e4) / 1e4);
    }
    return {
      slug: r.slug, name: r.name, type: r.type, isoA2: r.iso_a2, bbox,
      source: r.source_title ? { title: r.source_title, url: r.source_url, license: r.source_license } : null,
    };
  }

  /**
   * Published species in a viewport (PLAN §4 Map, §9). Every read starts from the PUBLISHED fragment.
   * - A species with a published range is placed by its range (layer "range"); otherwise by the regions it
   *   is recorded in (layer "country"). A range is never invented from regions.
   * - hide_regions species never appear: being listed for a viewport would reveal where they live.
   * - Ranges are clipped to the viewport and simplified; species and vertex caps set `truncated`.
   */
  async mapQuery(db: DbOrTx, bbox: Bbox, f: Pick<ListFilters, 'group' | 'category' | 'slugs'>): Promise<Omit<MapDto, 'bbox' | 'limits'>> {
    const env = envelope(bbox);
    const matched = await db.execute<{ species_id: string; slug: string; has_range: boolean }>(sql`
      WITH env AS (SELECT ${env} AS g), p AS (${PUBLISHED})
      SELECT p.species_id, p.slug, EXISTS (SELECT 1 FROM species_ranges r0 WHERE r0.revision_id = p.revision_id) AS has_range
      FROM p ${HEADLINE} CROSS JOIN env
      WHERE p.location_sensitivity <> 'hide_regions' AND ${whereClause(f)}
        AND (
          EXISTS (SELECT 1 FROM species_ranges sr WHERE sr.revision_id = p.revision_id AND sr.geom && env.g AND ST_Intersects(sr.geom, env.g))
          OR (NOT EXISTS (SELECT 1 FROM species_ranges r1 WHERE r1.revision_id = p.revision_id)
              AND EXISTS (SELECT 1 FROM species_regions spr JOIN regions rg ON rg.id = spr.region_id
                          WHERE spr.revision_id = p.revision_id AND rg.geom && env.g AND ST_Intersects(rg.geom, env.g)))
        )
      ORDER BY p.slug
      LIMIT ${MAP_MAX_SPECIES + 1}`);
    let truncated = matched.rows.length > MAP_MAX_SPECIES;
    const rows = matched.rows.slice(0, MAP_MAX_SPECIES);
    if (!rows.length) return { species: [], countryPresence: [], ranges: [], truncated: false };

    const rangeIds = rows.filter((r) => r.has_range).map((r) => r.species_id);
    const countryIds = rows.filter((r) => !r.has_range).map((r) => r.species_id);
    const layerOf = new Map(rows.map((r) => [r.slug, r.has_range ? ('range' as const) : ('country' as const)]));

    const cards = await selectCards(db, { speciesIds: rows.map((r) => r.species_id) }, DISPLAY_NAME, MAP_MAX_SPECIES, 0);

    const countryPresence: CountryPresenceDto[] = countryIds.length
      ? (
          await db.execute<{ slug: string; name: string; type: RegionDto['type']; species_count: number; species: string[] }>(sql`
            WITH env AS (SELECT ${env} AS g), p AS (${PUBLISHED})
            SELECT rg.slug, rg.name, rg.type, count(DISTINCT p.species_id)::int AS species_count, array_agg(DISTINCT p.slug ORDER BY p.slug) AS species
            FROM p JOIN species_regions spr ON spr.revision_id = p.revision_id JOIN regions rg ON rg.id = spr.region_id CROSS JOIN env
            WHERE p.species_id = ANY(${sql.param(countryIds)}::uuid[]) AND rg.geom && env.g AND ST_Intersects(rg.geom, env.g)
            GROUP BY rg.slug, rg.name, rg.type ORDER BY rg.name`)
        ).rows.map((r) => ({ slug: r.slug, name: r.name, type: r.type, speciesCount: r.species_count, species: r.species }))
      : [];

    const ranges: MapRangeDto[] = [];
    if (rangeIds.length) {
      const tolerance = bboxWidth(bbox) / 2000;
      const res = await db.execute<{
        slug: string; sensitivity: Sensitivity; seasonality: Seasonality; presence: Presence; note: string | null; source_id: string; n: number; geometry: MultiPolygonDto;
      }>(sql`
        WITH env AS (SELECT ${env} AS g), p AS (${PUBLISHED}),
        clipped AS (
          SELECT p.slug, p.location_sensitivity AS sensitivity, sr.seasonality, sr.presence, sr.generalization_note AS note, sr.source_id,
                 ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SimplifyPreserveTopology(ST_Intersection(sr.geom, env.g), ${tolerance}::float8)), 3)) AS g
          FROM p JOIN species_ranges sr ON sr.revision_id = p.revision_id CROSS JOIN env
          WHERE p.species_id = ANY(${sql.param(rangeIds)}::uuid[]) AND sr.geom && env.g AND ST_Intersects(sr.geom, env.g)
        )
        SELECT slug, sensitivity, seasonality, presence, note, source_id, ST_NPoints(g) AS n, ST_AsGeoJSON(g, 4)::json AS geometry
        FROM clipped WHERE NOT ST_IsEmpty(g)
        ORDER BY slug, seasonality`);
      let vertices = 0;
      for (const r of res.rows) {
        if (vertices + r.n > MAP_MAX_VERTICES) {
          truncated = true;
          continue;
        }
        vertices += r.n;
        ranges.push({
          speciesSlug: r.slug, seasonality: r.seasonality, presence: r.presence, generalized: r.sensitivity === 'generalize_country',
          note: r.note, sourceId: r.source_id, geometry: r.geometry,
        });
      }
    }

    return {
      species: cards.map((c) => ({ ...c, layer: layerOf.get(c.slug) ?? 'country' })),
      countryPresence,
      ranges,
      truncated,
    };
  }
}
