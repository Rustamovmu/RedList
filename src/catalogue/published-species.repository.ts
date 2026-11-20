import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { Db, InjectDb } from '../db/db.module';
import * as s from '../db/schema';
import { CURRENT_EDITORIAL_VERSION, Editorial, parseEditorial } from '../editorial/editorial-schema';
import { RangeValueDto, RegionLinkDto, SpeciesProfileDto } from './dto';

const region = (r: { slug: string | null; name: string | null; type: RegionLinkDto['type'] | null }): RegionLinkDto | null =>
  r.slug && r.name && r.type ? { slug: r.slug, name: r.name, type: r.type } : null;

const rangeValue = (m: { label: string; value?: number; min?: number; max?: number; unit: string; context?: string }): RangeValueDto => ({
  label: m.label, value: m.value ?? null, min: m.min ?? null, max: m.max ?? null, unit: m.unit, context: m.context ?? null,
});

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

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

    const [names, envs, assessments, estimates, regions, habitats, threats, citations, media, links] = await Promise.all([
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
      ...habitats.map((x) => x.h.sourceId),
      ...threats.map((x) => x.t.sourceId),
      ...citations.map((x) => x.sourceId),
    ]);
    const sources = sourceIds.size
      ? await this.db.select().from(s.sources).where(inArray(s.sources.id, [...sourceIds])).orderBy(asc(s.sources.title))
      : [];

    const common = names.filter((n) => n.nameType === 'common');
    const preferred = common.find((n) => n.preferred && n.language === 'en') ?? common.find((n) => n.language === 'en') ?? null;

    return {
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
}
