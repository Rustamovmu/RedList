import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DbOrTx, Tx } from '../db/db.module';
import * as s from '../db/schema';
import { GeoRepository, Sensitivity } from '../geography/geo.repository';
import { RevisionContentDto, SECTION_KEYS } from './dto';

const big = (v: string | null | undefined) => (v === null || v === undefined ? null : BigInt(v));
const str = (v: bigint | null) => (v === null ? null : v.toString());

/** Child tables of a revision, in an order that is safe for delete (dependents first). */
const CHILD_TABLES = [
  s.populationEstimates, s.assessments, s.speciesNames, s.speciesEnvironments, s.speciesRegions, s.speciesRanges,
  s.speciesHabitats, s.speciesThreats, s.revisionCitations, s.revisionMedia, s.revisionSupportLinks,
] as const;

/**
 * Reads and writes the full content of ONE revision by id (staff side).
 * Public reads never use this: they go through PublishedSpeciesRepository and published_revision_id.
 * Database triggers reject writes to anything but a draft, so this cannot alter submitted or published content.
 */
@Injectable()
export class RevisionContentRepository {
  constructor(private readonly geo: GeoRepository) {}

  async load(db: DbOrTx, revisionId: string): Promise<RevisionContentDto> {
    const [rev] = await db
      .select({ displayGroup: s.speciesRevisions.displayGroup, editorial: s.speciesRevisions.editorial })
      .from(s.speciesRevisions)
      .where(eq(s.speciesRevisions.id, revisionId));
    if (!rev) throw new Error(`revision ${revisionId} not found`);

    const by = <T extends { revisionId: unknown }>(t: T) => eq(t.revisionId as typeof s.speciesNames.revisionId, revisionId);
    // Sequential on purpose: `db` may be a transaction client, which must not run queries concurrently.
    const names = await db.select().from(s.speciesNames).where(by(s.speciesNames)).orderBy(asc(s.speciesNames.language), asc(s.speciesNames.name));
    const envs = await db.select().from(s.speciesEnvironments).where(by(s.speciesEnvironments)).orderBy(asc(s.speciesEnvironments.environment));
    const assessments = await db.select().from(s.assessments).where(by(s.assessments)).orderBy(asc(s.assessments.assessedOn), asc(s.assessments.id));
    const estimates = await db.select().from(s.populationEstimates).where(by(s.populationEstimates)).orderBy(asc(s.populationEstimates.position));
    const regions = await db.select().from(s.speciesRegions).where(by(s.speciesRegions)).orderBy(asc(s.speciesRegions.id));
    const habitats = await db.select().from(s.speciesHabitats).where(by(s.speciesHabitats)).orderBy(asc(s.speciesHabitats.id));
    const threats = await db.select().from(s.speciesThreats).where(by(s.speciesThreats)).orderBy(asc(s.speciesThreats.id));
    const citations = await db.select().from(s.revisionCitations).where(by(s.revisionCitations)).orderBy(asc(s.revisionCitations.sectionKey), asc(s.revisionCitations.id));
    const media = await db.select().from(s.revisionMedia).where(by(s.revisionMedia)).orderBy(asc(s.revisionMedia.position));
    const links = await db.select().from(s.revisionSupportLinks).where(by(s.revisionSupportLinks)).orderBy(asc(s.revisionSupportLinks.id));
    const ranges = await this.geo.loadRanges(db, revisionId);
    const assessmentIndex = new Map(assessments.map((a, i) => [a.id, i]));

    return {
      displayGroup: rev.displayGroup,
      editorial: rev.editorial as Record<string, unknown>,
      names: names.map((n) => ({ language: n.language, name: n.name, nameType: n.nameType, preferred: n.preferred })),
      environments: envs.map((e) => e.environment),
      assessments: assessments.map((a) => ({
        providerAssessmentId: a.providerAssessmentId, sourceId: a.sourceId, scope: a.scope, regionId: a.regionId,
        category: a.category, trend: a.trend, assessedOn: a.assessedOn, publishedOn: a.publishedOn, criteria: a.criteria,
      })),
      populationEstimates: estimates.map((p) => ({
        assessmentIndex: p.assessmentId ? (assessmentIndex.get(p.assessmentId) ?? null) : null,
        sourceId: p.sourceId, scope: p.scope, regionId: p.regionId, context: p.context, basis: p.basis, form: p.form,
        pointValue: str(p.pointValue), minValue: str(p.minValue), maxValue: str(p.maxValue), qualitativeText: p.qualitativeText,
        referenceStart: p.referenceStart, referenceEnd: p.referenceEnd, method: p.method, uncertaintyNote: p.uncertaintyNote,
      })),
      regions: regions.map((r) => ({ regionId: r.regionId, presence: r.presence, origin: r.origin, seasonality: r.seasonality, sourceId: r.sourceId })),
      ranges: ranges.map((r) => ({ ...r, geometry: r.geometry as RevisionContentDto['ranges'][number]['geometry'] })),
      habitats: habitats.map((h) => ({ habitatId: h.habitatId, suitability: h.suitability, seasonality: h.seasonality, sourceId: h.sourceId })),
      threats: threats.map((t) => ({ threatId: t.threatId, severity: t.severity, timing: t.timing, sourceId: t.sourceId })),
      citations: citations.map((c) => ({
        sectionKey: c.sectionKey as (typeof SECTION_KEYS)[number], sourceId: c.sourceId, locator: c.locator, note: c.note,
      })),
      media: media.map((m) => ({
        mediaId: m.mediaId, position: m.position, role: m.role as 'primary' | 'gallery', altText: m.altText, caption: m.caption,
      })),
      supportLinks: links.map((l) => ({ supportLinkId: l.supportLinkId, contextNote: l.contextNote })),
    };
  }

  /**
   * Replaces all child rows of a draft revision with `content` (editorial and displayGroup are set by the caller).
   * Media credit and licence are snapshotted from media_assets at this moment, so a later edit to the asset
   * never changes what an already-published revision credits.
   * Ranges go through GeoRepository (validation, antimeridian split, generalization for sensitive species).
   */
  async replaceChildren(tx: Tx, revisionId: string, c: RevisionContentDto, sensitivity: Sensitivity): Promise<void> {
    for (const t of CHILD_TABLES) await tx.delete(t).where(eq(t.revisionId, revisionId));

    if (c.names.length) await tx.insert(s.speciesNames).values(c.names.map((n) => ({ revisionId, ...n })));
    const envs = [...new Set(c.environments)];
    if (envs.length) await tx.insert(s.speciesEnvironments).values(envs.map((environment) => ({ revisionId, environment })));

    const assessmentIds = c.assessments.map(() => randomUUID());
    if (c.assessments.length) {
      await tx.insert(s.assessments).values(
        c.assessments.map((a, i) => ({
          id: assessmentIds[i], revisionId, providerAssessmentId: a.providerAssessmentId ?? null, sourceId: a.sourceId,
          scope: a.scope, regionId: a.regionId ?? null, category: a.category, trend: a.trend,
          assessedOn: a.assessedOn ?? null, publishedOn: a.publishedOn ?? null, criteria: a.criteria ?? null,
        })),
      );
    }
    if (c.populationEstimates.length) {
      await tx.insert(s.populationEstimates).values(
        c.populationEstimates.map((p, position) => {
          const idx = p.assessmentIndex;
          if (idx !== null && idx !== undefined && idx >= assessmentIds.length) {
            throw new UnprocessableEntityException(`populationEstimates[${position}].assessmentIndex points past the assessments list`);
          }
          return {
            revisionId, position, assessmentId: idx === null || idx === undefined ? null : assessmentIds[idx], sourceId: p.sourceId,
            scope: p.scope, regionId: p.regionId ?? null, context: p.context, basis: p.basis, form: p.form,
            pointValue: big(p.pointValue), minValue: big(p.minValue), maxValue: big(p.maxValue), qualitativeText: p.qualitativeText ?? null,
            referenceStart: p.referenceStart ?? null, referenceEnd: p.referenceEnd ?? null, method: p.method ?? null,
            uncertaintyNote: p.uncertaintyNote ?? null,
          };
        }),
      );
    }
    if (c.regions.length) await tx.insert(s.speciesRegions).values(c.regions.map((r) => ({ revisionId, ...r })));
    await this.geo.insertRanges(tx, revisionId, sensitivity, c.ranges ?? []);
    if (c.habitats.length) {
      await tx.insert(s.speciesHabitats).values(
        c.habitats.map((h) => ({ revisionId, habitatId: h.habitatId, suitability: h.suitability ?? null, seasonality: h.seasonality ?? null, sourceId: h.sourceId })),
      );
    }
    if (c.threats.length) {
      await tx.insert(s.speciesThreats).values(
        c.threats.map((t) => ({ revisionId, threatId: t.threatId, severity: t.severity ?? null, timing: t.timing ?? null, sourceId: t.sourceId })),
      );
    }
    if (c.citations.length) {
      await tx.insert(s.revisionCitations).values(
        c.citations.map((x) => ({ revisionId, sectionKey: x.sectionKey, sourceId: x.sourceId, locator: x.locator ?? null, note: x.note ?? null })),
      );
    }
    if (c.media.length) {
      const assets = await tx.select().from(s.mediaAssets).where(inArray(s.mediaAssets.id, c.media.map((m) => m.mediaId)));
      const byId = new Map(assets.map((a) => [a.id, a]));
      await tx.insert(s.revisionMedia).values(
        c.media.map((m, i) => {
          const a = byId.get(m.mediaId);
          if (!a) throw new UnprocessableEntityException(`media[${i}]: media asset not found`);
          return {
            revisionId, mediaId: m.mediaId, position: m.position, role: m.role, altText: m.altText, caption: m.caption ?? null,
            creditSnapshot: a.credit, licenseSnapshot: a.license,
          };
        }),
      );
    }
    if (c.supportLinks.length) {
      await tx.insert(s.revisionSupportLinks).values(c.supportLinks.map((l) => ({ revisionId, supportLinkId: l.supportLinkId, contextNote: l.contextNote ?? null })));
    }
  }
}
