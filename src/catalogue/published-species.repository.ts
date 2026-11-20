import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { domainOf } from '../common/url';
import { Db, InjectDb } from '../db/db.module';
import * as s from '../db/schema';
import { CURRENT_EDITORIAL_VERSION, Editorial, parseEditorial } from '../editorial/editorial-schema';
import { countCards, DISPLAY_NAME, HEADLINE, ListFilters, PUBLISHED, selectCards, SEVERITY } from './catalogue-sql';
import { FacetDto, FiltersDto, HabitatFacetDto, RangeValueDto, RegionFacetDto, RegionLinkDto, SpeciesCardDto, SpeciesListDto, SpeciesProfileDto } from './dto';
import { MAX_PAGE_SIZE } from './list-query.dto';

const region = (r: { slug: string | null; name: string | null; type: RegionLinkDto['type'] | null }): RegionLinkDto | null =>
  r.slug && r.name && r.type ? { slug: r.slug, name: r.name, type: r.type } : null;

const rangeValue = (m: { label: string; value?: number; min?: number; max?: number; unit: string; context?: string }): RangeValueDto => ({
  label: m.label, value: m.value ?? null, min: m.min ?? null, max: m.max ?? null, unit: m.unit, context: m.context ?? null,
});


/**
 * THE public read path for species content (PLAN §6 "Publication"): the revision id is taken only from
 * species.published_revision_id, and every child query is keyed by that id. Drafts, submitted and
 * superseded revisions are unreachable from here. Do not add another public read path; extend this one.
 */
@Injectable()
export class PublishedSpeciesRepository {
  constructor(@InjectDb() private readonly db: Db) {}

  async findProfileBySlug(slug: string): Promise<SpeciesProfileDto | null> {
    const [head] = await this.db
      .select({ sp: s.species, rev: s.speciesRevisions, reviewerRole: s.staffUsers.role })
      .from(s.species)
      .innerJoin(s.speciesRevisions, eq(s.speciesRevisions.id, s.species.publishedRevisionId))
      .leftJoin(s.staffUsers, eq(s.staffUsers.id, s.speciesRevisions.reviewerId))
      .where(and(eq(s.species.slug, slug), isNull(s.species.archivedAt), eq(s.speciesRevisions.state, 'published')))
      .limit(1);
    if (!head) return null;
    const { sp, rev } = head;
    const revId = rev.id;
    const withheld = sp.locationSensitivity === 'hide_regions';

    const [names, envs, assessments, estimates, regions, ranges, habitats, threats, citations, media, links] = await Promise.all([
      this.db.select().from(s.speciesNames).where(eq(s.speciesNames.revisionId, revId)).orderBy(asc(s.speciesNames.language), asc(s.speciesNames.name)),
      this.db.select().from(s.speciesEnvironments).where(eq(s.speciesEnvironments.revisionId, revId)).orderBy(asc(s.speciesEnvironments.environment)),
      this.db
        .select({ a: s.assessments, slug: s.regions.slug, name: s.regions.name, type: s.regions.type })
        .from(s.assessments)
        .leftJoin(s.regions, eq(s.regions.id, s.assessments.regionId))
        .where(eq(s.assessments.revisionId, revId))
        .orderBy(asc(s.assessments.scope), asc(s.assessments.assessedOn)),
      this.db
        .select({ p: s.populationEstimates, slug: s.regions.slug, name: s.regions.name, type: s.regions.type })
        .from(s.populationEstimates)
        .leftJoin(s.regions, eq(s.regions.id, s.populationEstimates.regionId))
        .where(eq(s.populationEstimates.revisionId, revId))
        .orderBy(asc(s.populationEstimates.position)),
      withheld
        ? Promise.resolve([])
        : this.db
            .select({ r: s.speciesRegions, slug: s.regions.slug, name: s.regions.name, type: s.regions.type })
            .from(s.speciesRegions)
            .innerJoin(s.regions, eq(s.regions.id, s.speciesRegions.regionId))
            .where(eq(s.speciesRegions.revisionId, revId))
            .orderBy(asc(s.regions.name)),
      // Range metadata only: shapes are served by GET /map, through GeoRepository. Never for hidden species.
      withheld
        ? Promise.resolve([])
        : this.db
            .select({
              seasonality: s.speciesRanges.seasonality, presence: s.speciesRanges.presence, datasetVersion: s.speciesRanges.datasetVersion,
              generalizationNote: s.speciesRanges.generalizationNote, sourceId: s.speciesRanges.sourceId,
            })
            .from(s.speciesRanges)
            .where(eq(s.speciesRanges.revisionId, revId))
            .orderBy(asc(s.speciesRanges.seasonality)),
      this.db
        .select({ h: s.speciesHabitats, code: s.habitats.code, name: s.habitats.name })
        .from(s.speciesHabitats)
        .innerJoin(s.habitats, eq(s.habitats.id, s.speciesHabitats.habitatId))
        .where(eq(s.speciesHabitats.revisionId, revId))
        .orderBy(asc(s.habitats.code)),
      this.db
        .select({ t: s.speciesThreats, code: s.threats.code, name: s.threats.name })
        .from(s.speciesThreats)
        .innerJoin(s.threats, eq(s.threats.id, s.speciesThreats.threatId))
        .where(eq(s.speciesThreats.revisionId, revId))
        .orderBy(asc(s.threats.code)),
      this.db.select().from(s.revisionCitations).where(eq(s.revisionCitations.revisionId, revId)).orderBy(asc(s.revisionCitations.sectionKey)),
      this.db
        .select({ m: s.revisionMedia, asset: s.mediaAssets })
        .from(s.revisionMedia)
        .innerJoin(s.mediaAssets, eq(s.mediaAssets.id, s.revisionMedia.mediaId))
        .where(eq(s.revisionMedia.revisionId, revId))
        .orderBy(asc(s.revisionMedia.position)),
      // Only links that are still approved, from approved organizations. Disabling a link hides it at once (PLAN §6).
      this.db
        .select({ l: s.revisionSupportLinks, link: s.supportLinks, org: s.organizations })
        .from(s.revisionSupportLinks)
        .innerJoin(s.supportLinks, eq(s.supportLinks.id, s.revisionSupportLinks.supportLinkId))
        .innerJoin(s.organizations, eq(s.organizations.id, s.supportLinks.organizationId))
        .where(
          and(
            eq(s.revisionSupportLinks.revisionId, revId),
            eq(s.supportLinks.editorialStatus, 'approved'),
            eq(s.organizations.reviewStatus, 'approved'),
          ),
        ),
    ]);

    // Published editorial passed validation at save time; parse again to migrate older schema versions.
    const ed: Editorial = parseEditorial(rev.schemaVersion ?? CURRENT_EDITORIAL_VERSION, rev.editorial);

    const sourceIds = new Set<string>([
      ...assessments.map((x) => x.a.sourceId),
      ...estimates.map((x) => x.p.sourceId),
      ...regions.map((x) => x.r.sourceId),
      ...ranges.map((x) => x.sourceId),
      ...habitats.map((x) => x.h.sourceId),
      ...threats.map((x) => x.t.sourceId),
      ...citations.map((x) => x.sourceId),
    ]);
    const sources = sourceIds.size
      ? await this.db.select().from(s.sources).where(inArray(s.sources.id, [...sourceIds])).orderBy(asc(s.sources.title))
      : [];

    const common = names.filter((n) => n.nameType === 'common');
    const preferred = common.find((n) => n.preferred && n.language === 'en') ?? common.find((n) => n.language === 'en') ?? null;

    const related = await this.related(sp.id, sp.locationSensitivity === 'hide_regions');

    return {
      related,
      slug: sp.slug,
      scientificName: sp.acceptedScientificName,
      rank: sp.rank,
      displayGroup: rev.displayGroup,
      commonName: preferred?.name ?? null,
      commonNames: common.map((n) => ({ language: n.language, name: n.name })),
      synonyms: names.filter((n) => n.nameType === 'synonym').map((n) => ({ language: n.language, name: n.name })),
      taxonomy: {
        kingdom: ed.taxonomy?.kingdom ?? null, phylum: ed.taxonomy?.phylum ?? null, class: ed.taxonomy?.class ?? null,
        order: ed.taxonomy?.order ?? null, family: ed.taxonomy?.family ?? null, genus: ed.taxonomy?.genus ?? null,
      },
      overview: ed.overview ?? null,
      status: {
        notAssessed: ed.status?.notAssessed === true,
        assessments: assessments.map(({ a, ...r }) => ({
          category: a.category, scope: a.scope, region: region(r), trend: a.trend, assessedOn: a.assessedOn,
          publishedOn: a.publishedOn, criteria: a.criteria, sourceId: a.sourceId,
        })),
      },
      population: {
        unknown: ed.population?.unknown === true,
        unknownNote: ed.population?.note ?? null,
        estimates: estimates.map(({ p, ...r }) => ({
          scope: p.scope, region: region(r), context: p.context, basis: p.basis, form: p.form,
          pointValue: p.pointValue?.toString() ?? null, minValue: p.minValue?.toString() ?? null, maxValue: p.maxValue?.toString() ?? null,
          qualitativeText: p.qualitativeText, referenceStart: p.referenceStart, referenceEnd: p.referenceEnd, method: p.method,
          uncertaintyNote: p.uncertaintyNote, sourceId: p.sourceId,
        })),
      },
      geography: {
        environments: envs.map((e) => e.environment),
        locationWithheld: withheld,
        locationGeneralized: sp.locationSensitivity === 'generalize_country',
        ranges,
        regions: regions.map(({ r, slug: rs, name, type }) => ({
          region: { slug: rs, name, type }, presence: r.presence, origin: r.origin, seasonality: r.seasonality, sourceId: r.sourceId,
        })),
        habitats: habitats.map(({ h, code, name }) => ({ code, name, suitability: h.suitability, seasonality: h.seasonality, sourceId: h.sourceId })),
        climate: { narrative: ed.climate?.narrative ?? null, ranges: (ed.climate?.ranges ?? []).map(rangeValue) },
      },
      diet: { narrative: ed.diet?.narrative ?? null, tags: ed.diet?.tags ?? [], context: ed.diet?.context ?? null },
      threats: {
        threats: threats.map(({ t, code, name }) => ({ code, name, severity: t.severity, timing: t.timing, sourceId: t.sourceId })),
        conservationActions: ed.conservationActions ?? null,
      },
      biology: { narrative: ed.biology ?? null, measurements: (ed.measurements ?? []).map(rangeValue) },
      support: links.map(({ l, link, org }) => ({
        organizationName: org.name, organizationWebsite: org.website, url: link.url, domain: domainOf(link.url),
        actionType: link.actionType, description: link.description, contextNote: l.contextNote,
      })),
      media: media.map(({ m, asset }) => ({
        storageKey: asset.storageKey, width: asset.width, height: asset.height, role: m.role, altText: m.altText, caption: m.caption,
        credit: m.creditSnapshot, license: m.licenseSnapshot, sourceUrl: asset.sourceUrl,
      })),
      sources: sources.map((x) => ({
        id: x.id, title: x.title, publisher: x.publisher, authors: x.authors, url: x.url, doi: x.doi,
        publishedOn: x.publishedOn, accessedOn: x.accessedOn, license: x.license,
      })),
      citations: citations.map((c) => ({ sectionKey: c.sectionKey, sourceId: c.sourceId, locator: c.locator, note: c.note })),
      review: {
        version: rev.version,
        publishedAt: (rev.publishedAt ?? rev.updatedAt).toISOString(),
        reviewedAt: (rev.reviewedAt ?? rev.publishedAt ?? rev.updatedAt).toISOString(),
        reviewerRole: head.reviewerRole ?? null,
        selfReviewed: rev.selfReviewed,
      },
    };
  }

  // ---------- M2: lists, filters, related ----------

  async list(f: ListFilters & { sort?: 'name' | 'status' | 'reviewed'; page?: number; pageSize?: number }): Promise<SpeciesListDto> {
    const page = f.page ?? 1;
    const pageSize = Math.min(f.pageSize ?? 24, MAX_PAGE_SIZE);
    const order =
      f.sort === 'status' ? sql`${SEVERITY}, ${DISPLAY_NAME}` : f.sort === 'reviewed' ? sql`p.published_at DESC NULLS LAST` : DISPLAY_NAME;
    const [items, total] = await Promise.all([selectCards(this.db, f, order, pageSize, (page - 1) * pageSize), countCards(this.db, f)]);
    return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async filters(): Promise<FiltersDto> {
    const q = <T>(body: ReturnType<typeof sql>) => this.db.execute<T & Record<string, unknown>>(sql`WITH p AS (${PUBLISHED}) ${body}`).then((r) => r.rows);
    const [totals, groups, envs, cats, trends, regions, habitats] = await Promise.all([
      q<{ total: number; threatened: number }>(sql`
        SELECT count(*)::int AS total, count(*) FILTER (WHERE ha.category IN ('CR','EN','VU'))::int AS threatened FROM p ${HEADLINE}`),
      q<{ value: string; count: number }>(sql`SELECT p.display_group::text AS value, count(*)::int AS count FROM p GROUP BY 1`),
      q<{ value: string; count: number }>(sql`
        SELECT e.environment::text AS value, count(*)::int AS count FROM p JOIN species_environments e ON e.revision_id = p.revision_id GROUP BY 1`),
      q<{ value: string; count: number }>(sql`SELECT ha.category::text AS value, count(*)::int AS count FROM p ${HEADLINE} WHERE ha.category IS NOT NULL GROUP BY 1`),
      q<{ value: string; count: number }>(sql`SELECT ha.trend::text AS value, count(*)::int AS count FROM p ${HEADLINE} WHERE ha.trend IS NOT NULL GROUP BY 1`),
      q<RegionFacetDto>(sql`
        SELECT rg.slug, rg.name, rg.type::text AS type, count(DISTINCT p.species_id)::int AS count
        FROM p JOIN species_regions sr ON sr.revision_id = p.revision_id JOIN regions rg ON rg.id = sr.region_id
        WHERE p.location_sensitivity <> 'hide_regions'
        GROUP BY rg.slug, rg.name, rg.type ORDER BY rg.name`),
      q<HabitatFacetDto>(sql`
        SELECT h.code, h.name, count(DISTINCT p.species_id)::int AS count
        FROM p JOIN species_habitats sh ON sh.revision_id = p.revision_id JOIN habitats h ON h.id = sh.habitat_id
        GROUP BY h.code, h.name ORDER BY h.code`),
    ]);
    const facet = (values: readonly string[], rows: Array<{ value: string; count: number }>): FacetDto[] =>
      values.map((value) => ({ value, count: rows.find((r) => r.value === value)?.count ?? 0 }));
    return {
      total: totals[0].total,
      threatened: totals[0].threatened,
      groups: facet(s.displayGroup.enumValues, groups),
      environments: facet(s.environment.enumValues, envs),
      categories: facet(s.iucnCategory.enumValues, cats),
      trends: facet(s.populationTrend.enumValues, trends),
      regions: regions.map((r) => ({ slug: r.slug, name: r.name, type: r.type, count: r.count })),
      habitats: habitats.map((h) => ({ code: h.code, name: h.name, count: h.count })),
    };
  }

  /**
   * Up to 4 published species that share the group, threats or regions with this one, most shared first.
   * Regions are ignored when either species is location-sensitive, so "related" never hints at where it lives.
   */
  async related(speciesId: string, sensitive: boolean, limit = 4): Promise<SpeciesCardDto[]> {
    const res = await this.db.execute<{ species_id: string }>(sql`
      WITH p AS (${PUBLISHED}), me AS (SELECT * FROM p WHERE p.species_id = ${speciesId}),
      scored AS (
        SELECT o.species_id, o.slug,
            (o.display_group = me.display_group)::int
          + (SELECT count(*) FROM species_threats a JOIN species_threats b ON a.threat_id = b.threat_id
             WHERE a.revision_id = me.revision_id AND b.revision_id = o.revision_id)
          + CASE WHEN ${sensitive} OR o.location_sensitivity = 'hide_regions' THEN 0 ELSE
              (SELECT count(*) FROM species_regions a JOIN species_regions b ON a.region_id = b.region_id
               WHERE a.revision_id = me.revision_id AND b.revision_id = o.revision_id) END AS score
        FROM p o, me WHERE o.species_id <> me.species_id
      )
      SELECT species_id FROM scored WHERE score > 0 ORDER BY score DESC, slug LIMIT ${limit}`);
    const ids = res.rows.map((r) => r.species_id);
    if (!ids.length) return [];
    // Keep the score order from above.
    return selectCards(this.db, { speciesIds: ids }, sql`array_position(${sql.param(ids)}::uuid[], p.species_id)`, limit, 0);
  }
}
