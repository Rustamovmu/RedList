import { SQL, sql } from 'drizzle-orm';
import type { DbOrTx } from '../db/db.module';
import { CardStatusDto, SpeciesCardDto } from './dto';

/**
 * THE published-species set. Every public list, filter, count, related and compare query starts here:
 * the revision is reached only through species.published_revision_id, and must be in state 'published'.
 * PublishedSpeciesRepository.findProfileBySlug applies the same join for single profiles.
 */
export const PUBLISHED = sql`
  SELECT sp.id AS species_id, sp.slug, sp.accepted_scientific_name, sp.location_sensitivity,
         r.id AS revision_id, r.display_group, r.published_at, r.editorial
  FROM species sp
  JOIN species_revisions r ON r.id = sp.published_revision_id AND r.state = 'published'
  WHERE sp.archived_at IS NULL`;

/** Headline assessment: global before regional, newest first. Used for the card badge, category and trend filters. */
const HEADLINE = sql`
  LEFT JOIN LATERAL (
    SELECT a.category, a.scope, a.assessed_on, a.trend FROM assessments a
    WHERE a.revision_id = p.revision_id
    ORDER BY (a.scope = 'global') DESC, a.assessed_on DESC NULLS LAST, a.id
    LIMIT 1
  ) ha ON true`;

export const COMMON_NAME = sql`
  LEFT JOIN LATERAL (
    SELECT n.name FROM species_names n
    WHERE n.revision_id = p.revision_id AND n.name_type = 'common'
    ORDER BY (n.language = 'en') DESC, n.preferred DESC, n.name
    LIMIT 1
  ) cn ON true`;

/** Most threatened first. DD, NE and unassessed are not "low risk": they sort after every ranked category. */
export const SEVERITY = sql`CASE ha.category
  WHEN 'EX' THEN 0 WHEN 'EW' THEN 1 WHEN 'CR' THEN 2 WHEN 'EN' THEN 3 WHEN 'VU' THEN 4
  WHEN 'NT' THEN 5 WHEN 'LC' THEN 6 WHEN 'DD' THEN 7 WHEN 'NE' THEN 8 ELSE 9 END`;
export const DISPLAY_NAME = sql`lower(coalesce(cn.name, p.accepted_scientific_name))`;

/**
 * The photo shown for a species wherever it appears outside its profile (cards, group tiles): the primary image first.
 * A rejected image is a takedown and disappears at once (DECISIONS D-022).
 */
export const CARD_IMAGE = sql`
  LEFT JOIN LATERAL (
    SELECT ma.storage_key, ma.width, ma.height, rm.alt_text, rm.credit_snapshot, rm.license_snapshot
    FROM revision_media rm JOIN media_assets ma ON ma.id = rm.media_id
    WHERE rm.revision_id = p.revision_id AND ma.review_state <> 'rejected' ORDER BY (rm.role = 'primary') DESC, rm.position LIMIT 1
  ) img ON true`;

export type ListFilters = {
  q?: string;
  group?: string[];
  environment?: string[];
  category?: string[];
  region?: string[];
  /** Only with `region`: how the species occurs there. */
  regionOrigin?: string[];
  regionSeasonality?: string[];
  habitat?: string[];
  trend?: string[];
  slugs?: string[];
  speciesIds?: string[];
};

/** Turns free text into a prefix tsquery over letters and digits only, e.g. "red pan" → "red:* & pan:*". */
export function toPrefixQuery(q: string | undefined): string | null {
  const words = (q ?? '').toLowerCase().match(/[\p{L}\p{N}]+/gu)?.slice(0, 6) ?? [];
  return words.length ? words.map((w) => `${w}:*`).join(' & ') : null;
}

/** Arrays must go through sql.param(): a bare array in drizzle's sql template expands into ($1, $2, ...). */
export function whereClause(f: ListFilters): SQL {
  const conds: SQL[] = [sql`true`];
  const tsq = toPrefixQuery(f.q);
  if (tsq) {
    conds.push(sql`(
      to_tsvector('simple', p.accepted_scientific_name) @@ to_tsquery('simple', ${tsq})
      OR EXISTS (SELECT 1 FROM species_names n WHERE n.revision_id = p.revision_id
                 AND to_tsvector('simple', n.name) @@ to_tsquery('simple', ${tsq})))`);
  }
  if (f.group?.length) conds.push(sql`p.display_group::text = ANY(${sql.param(f.group)}::text[])`);
  if (f.environment?.length) {
    conds.push(sql`EXISTS (SELECT 1 FROM species_environments e WHERE e.revision_id = p.revision_id AND e.environment::text = ANY(${sql.param(f.environment)}::text[]))`);
  }
  if (f.category?.length) conds.push(sql`ha.category::text = ANY(${sql.param(f.category)}::text[])`);
  if (f.trend?.length) conds.push(sql`ha.trend::text = ANY(${sql.param(f.trend)}::text[])`);
  if (f.region?.length) {
    // A location-sensitive species must never be findable by place: that would reveal where it lives.
    const origin = f.regionOrigin?.length ? sql` AND sr.origin::text = ANY(${sql.param(f.regionOrigin)}::text[])` : sql``;
    const season = f.regionSeasonality?.length ? sql` AND sr.seasonality::text = ANY(${sql.param(f.regionSeasonality)}::text[])` : sql``;
    conds.push(sql`p.location_sensitivity <> 'hide_regions' AND EXISTS (
      SELECT 1 FROM species_regions sr JOIN regions rg ON rg.id = sr.region_id
      WHERE sr.revision_id = p.revision_id AND rg.slug = ANY(${sql.param(f.region)}::text[])${origin}${season})`);
  }
  if (f.habitat?.length) {
    conds.push(sql`EXISTS (SELECT 1 FROM species_habitats sh JOIN habitats h ON h.id = sh.habitat_id
      WHERE sh.revision_id = p.revision_id AND h.code = ANY(${sql.param(f.habitat)}::text[]))`);
  }
  if (f.slugs) conds.push(sql`p.slug = ANY(${sql.param(f.slugs)}::text[])`);
  if (f.speciesIds) conds.push(sql`p.species_id = ANY(${sql.param(f.speciesIds)}::uuid[])`);
  return sql.join(conds, sql` AND `);
}

type CardRow = {
  slug: string;
  accepted_scientific_name: string;
  common_name: string | null;
  display_group: SpeciesCardDto['displayGroup'];
  category: CardStatusDto['category'] | null;
  scope: CardStatusDto['scope'] | null;
  assessed_on: string | null;
  trend: CardStatusDto['trend'] | null;
  not_assessed: boolean | null;
  environments: SpeciesCardDto['environments'] | null;
  region_count: number | null;
  location_sensitivity: string;
  image_key: string | null;
  image_alt: string | null;
  image_credit: string | null;
  image_license: string | null;
  image_width: number | null;
  image_height: number | null;
};

export async function selectCards(db: DbOrTx, f: ListFilters, orderBy: SQL, limit: number, offset: number): Promise<SpeciesCardDto[]> {
  const res = await db.execute<CardRow>(sql`
    WITH p AS (${PUBLISHED})
    SELECT p.slug, p.accepted_scientific_name, cn.name AS common_name, p.display_group,
           ha.category, ha.scope, ha.assessed_on::text AS assessed_on, ha.trend,
           (p.editorial -> 'status' ->> 'notAssessed')::boolean AS not_assessed,
           (SELECT array_agg(e.environment::text ORDER BY e.environment) FROM species_environments e WHERE e.revision_id = p.revision_id) AS environments,
           CASE WHEN p.location_sensitivity = 'hide_regions' THEN NULL
                ELSE (SELECT count(*)::int FROM species_regions sr WHERE sr.revision_id = p.revision_id) END AS region_count,
           p.location_sensitivity,
           img.storage_key AS image_key, img.alt_text AS image_alt, img.credit_snapshot AS image_credit, img.license_snapshot AS image_license,
           img.width AS image_width, img.height AS image_height
    FROM p ${COMMON_NAME} ${HEADLINE} ${CARD_IMAGE}
    WHERE ${whereClause(f)}
    ORDER BY ${orderBy}, p.slug
    LIMIT ${limit} OFFSET ${offset}`);
  return res.rows.map((r) => ({
    slug: r.slug,
    scientificName: r.accepted_scientific_name,
    commonName: r.common_name,
    displayGroup: r.display_group,
    status: r.category ? { category: r.category, scope: r.scope!, assessedOn: r.assessed_on, trend: r.trend! } : null,
    notAssessed: r.not_assessed === true,
    environments: r.environments ?? [],
    regionCount: r.region_count,
    locationWithheld: r.location_sensitivity === 'hide_regions',
    image: r.image_key
      ? { storageKey: r.image_key, altText: r.image_alt!, credit: r.image_credit!, license: r.image_license!, width: r.image_width!, height: r.image_height! }
      : null,
  }));
}

export async function countCards(db: DbOrTx, f: ListFilters): Promise<number> {
  const res = await db.execute<{ n: number }>(sql`
    WITH p AS (${PUBLISHED})
    SELECT count(*)::int AS n FROM p ${HEADLINE} WHERE ${whereClause(f)}`);
  return res.rows[0].n;
}

export { HEADLINE };
