import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { countCards, DISPLAY_NAME, HEADLINE, ListFilters, PUBLISHED, selectCards } from '../catalogue/catalogue-sql';
import type { FacetDto } from '../catalogue/dto';
import { Db, InjectDb } from '../db/db.module';
import * as s from '../db/schema';
import { OccurrenceDto, RegionFacetsDto, RegionPageDto, RegionQuery } from './dto';
import { GeoRepository } from './geo.repository';

const facet = (values: readonly string[], rows: Array<{ value: string; count: number }>): FacetDto[] =>
  values.map((value) => ({ value, count: rows.find((r) => r.value === value)?.count ?? 0 }));

/**
 * Region pages (PLAN §4 "Regions"). Published species only, through the PUBLISHED fragment; location-sensitive
 * (hide_regions) species are never listed or counted, because listing them would reveal where they live.
 */
@Injectable()
export class RegionsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly geo: GeoRepository,
  ) {}

  async page(slug: string, q: RegionQuery): Promise<RegionPageDto | null> {
    const region = await this.geo.regionBySlug(this.db, slug);
    if (!region) return null;
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 24;
    const f: ListFilters = { region: [slug], regionOrigin: q.origin, regionSeasonality: q.seasonality, group: q.group, category: q.category };
    const [cards, total, facets] = await Promise.all([
      selectCards(this.db, f, DISPLAY_NAME, pageSize, (page - 1) * pageSize),
      countCards(this.db, f),
      this.facets(slug),
    ]);
    const occ = cards.length
      ? (
          await this.db.execute<{ slug: string; presence: OccurrenceDto['presence']; origin: OccurrenceDto['origin']; seasonality: OccurrenceDto['seasonality'] }>(sql`
            WITH p AS (${PUBLISHED})
            SELECT p.slug, sr.presence, sr.origin, sr.seasonality
            FROM p JOIN species_regions sr ON sr.revision_id = p.revision_id JOIN regions rg ON rg.id = sr.region_id
            WHERE rg.slug = ${slug} AND p.location_sensitivity <> 'hide_regions' AND p.slug = ANY(${sql.param(cards.map((c) => c.slug))}::text[])
            ORDER BY sr.seasonality, sr.origin`)
        ).rows
      : [];
    return {
      region,
      facets,
      items: cards.map((card) => ({
        card,
        occurrences: occ.filter((o) => o.slug === card.slug).map(({ presence, origin, seasonality }) => ({ presence, origin, seasonality })),
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  private async facets(slug: string): Promise<RegionFacetsDto> {
    const inRegion = sql`
      WITH p0 AS (${PUBLISHED}),
      inr AS (
        SELECT p0.species_id, p0.revision_id, p0.display_group, sr.origin, sr.seasonality
        FROM p0 JOIN species_regions sr ON sr.revision_id = p0.revision_id JOIN regions rg ON rg.id = sr.region_id
        WHERE rg.slug = ${slug} AND p0.location_sensitivity <> 'hide_regions'
      )`;
    const q = (body: ReturnType<typeof sql>) =>
      this.db.execute<{ value: string; count: number }>(sql`${inRegion} ${body}`).then((r) => r.rows);
    const [groups, categories, origins, seasons] = await Promise.all([
      q(sql`SELECT display_group::text AS value, count(DISTINCT species_id)::int AS count FROM inr GROUP BY 1`),
      q(sql`SELECT ha.category::text AS value, count(*)::int AS count
            FROM (SELECT DISTINCT species_id, revision_id FROM inr) p ${HEADLINE} WHERE ha.category IS NOT NULL GROUP BY 1`),
      q(sql`SELECT origin::text AS value, count(DISTINCT species_id)::int AS count FROM inr GROUP BY 1`),
      q(sql`SELECT seasonality::text AS value, count(DISTINCT species_id)::int AS count FROM inr GROUP BY 1`),
    ]);
    return {
      groups: facet(s.displayGroup.enumValues, groups),
      categories: facet(s.iucnCategory.enumValues, categories),
      origins: facet(s.origin.enumValues, origins),
      seasonalities: facet(s.seasonality.enumValues, seasons),
    };
  }
}
