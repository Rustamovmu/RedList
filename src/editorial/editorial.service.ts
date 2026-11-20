import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { and, asc, eq, ilike, inArray, max, sql } from 'drizzle-orm';
import { audit } from '../common/audit';
import { Db, DbOrTx, InjectDb, Tx } from '../db/db.module';
import * as s from '../db/schema';
import type { StaffPrincipal } from '../identity/session.service';
import { checklistPasses, runChecklist } from './checklist';
import {
  AddIdentifierDto, ChecklistItemDto, CreateSourceDto, CreateSpeciesDto, ReferenceListsDto, RevisionContentDto,
  RevisionDetailDto, RollbackDto, SaveDraftDto, SourceDto, SourceUpdateResultDto, StaffSpeciesDto, UpdateSourceDto,
} from './dto';
import { CURRENT_EDITORIAL_VERSION, EditorialSchemaError, parseEditorial } from './editorial-schema';
import { RevalidationService } from './revalidation.service';
import { RevisionContentRepository } from './revision-content.repository';

const iso = (d: Date | null) => (d ? d.toISOString() : null);

const EMPTY_CONTENT = (displayGroup: RevisionContentDto['displayGroup']): RevisionContentDto => ({
  displayGroup, editorial: {}, names: [], environments: [], assessments: [], populationEstimates: [], regions: [], ranges: [],
  habitats: [], threats: [], citations: [], media: [], supportLinks: [],
});

function validateEditorial(raw: unknown) {
  try {
    return parseEditorial(CURRENT_EDITORIAL_VERSION, raw);
  } catch (e) {
    if (e instanceof EditorialSchemaError) throw new BadRequestException({ code: 'EDITORIAL_INVALID', message: e.message, details: e.issues });
    throw e;
  }
}

/**
 * Editorial workflow (PLAN §6 "Publication", §7):
 *   create species (draft v1) → save draft → submit (checklist) → publish (admin, checklist, one transaction)
 *   submitted → changes_requested; the editor then continues in a new draft.
 * Editing a published species copies the published aggregate into a new draft whose base_revision_id is
 * the published revision; publishing fails with 409 if the published revision has changed since.
 */
@Injectable()
export class EditorialService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly content: RevisionContentRepository,
    private readonly revalidation: RevalidationService,
  ) {}

  // ---------- species ----------

  async listSpecies(): Promise<StaffSpeciesDto[]> {
    const rows = await this.db.select().from(s.species).orderBy(asc(s.species.slug));
    return this.withDetails(rows);
  }

  async getSpecies(id: string, db: DbOrTx = this.db): Promise<StaffSpeciesDto> {
    const rows = await db.select().from(s.species).where(eq(s.species.id, id));
    if (!rows.length) throw new NotFoundException('Species not found');
    return (await this.withDetails(rows, db))[0];
  }

  private async withDetails(rows: Array<typeof s.species.$inferSelect>, db: DbOrTx = this.db): Promise<StaffSpeciesDto[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    // Sequential: `db` may be a transaction client.
    const idents = await db.select().from(s.speciesIdentifiers).where(inArray(s.speciesIdentifiers.speciesId, ids));
    const revs = await db
        .select({
          id: s.speciesRevisions.id, speciesId: s.speciesRevisions.speciesId, version: s.speciesRevisions.version,
          state: s.speciesRevisions.state, updatedAt: s.speciesRevisions.updatedAt, publishedAt: s.speciesRevisions.publishedAt,
        })
        .from(s.speciesRevisions)
        .where(inArray(s.speciesRevisions.speciesId, ids))
        .orderBy(asc(s.speciesRevisions.version));
    return rows.map((r) => ({
      id: r.id, slug: r.slug, acceptedScientificName: r.acceptedScientificName, rank: r.rank,
      locationSensitivity: r.locationSensitivity, publishedRevisionId: r.publishedRevisionId,
      identifiers: idents
        .filter((i) => i.speciesId === r.id)
        .map((i) => ({ id: i.id, provider: i.provider, externalId: i.externalId, sourceUrl: i.sourceUrl })),
      revisions: revs
        .filter((v) => v.speciesId === r.id)
        .map((v) => ({
          id: v.id, version: v.version, state: v.state, updatedAt: v.updatedAt.toISOString(), publishedAt: iso(v.publishedAt),
          isPublished: v.id === r.publishedRevisionId,
        })),
    }));
  }

  /**
   * The write methods below take an optional outer transaction (`db`), so the import CLI can apply a whole
   * file in one transaction. Inside one, `db.transaction` becomes a savepoint.
   */
  async createSpecies(staff: StaffPrincipal, dto: CreateSpeciesDto, db: DbOrTx = this.db): Promise<RevisionDetailDto> {
    const revisionId = await db.transaction(async (tx) => {
      const [sp] = await tx
        .insert(s.species)
        .values({
          slug: dto.slug, acceptedScientificName: dto.acceptedScientificName, rank: dto.rank,
          locationSensitivity: dto.locationSensitivity ?? 'none',
        })
        .returning({ id: s.species.id });
      const [rev] = await tx
        .insert(s.speciesRevisions)
        .values({ speciesId: sp.id, version: 1, displayGroup: dto.displayGroup, authorId: staff.id, schemaVersion: CURRENT_EDITORIAL_VERSION })
        .returning({ id: s.speciesRevisions.id });
      await audit(tx, { actorId: staff.id, action: 'species.create', entityType: 'species', entityId: sp.id, summary: `Created ${dto.slug} with draft v1` });
      return rev.id;
    });
    return this.getRevision(revisionId, db);
  }

  async addIdentifier(staff: StaffPrincipal, speciesId: string, dto: AddIdentifierDto, db: DbOrTx = this.db): Promise<StaffSpeciesDto> {
    await db.transaction(async (tx) => {
      const [sp] = await tx.select({ id: s.species.id }).from(s.species).where(eq(s.species.id, speciesId));
      if (!sp) throw new NotFoundException('Species not found');
      const [row] = await tx
        .insert(s.speciesIdentifiers)
        .values({ speciesId, provider: dto.provider, externalId: dto.externalId, sourceUrl: dto.sourceUrl ?? null })
        .returning({ id: s.speciesIdentifiers.id });
      await audit(tx, {
        actorId: staff.id, action: 'species.identifier.add', entityType: 'species', entityId: speciesId,
        summary: `Added identifier ${dto.provider}:${dto.externalId} (${row.id})`,
      });
    });
    return this.getSpecies(speciesId, db);
  }

  // ---------- revisions ----------

  async getRevision(id: string, db: DbOrTx = this.db): Promise<RevisionDetailDto> {
    const [row] = await db
      .select({ rev: s.speciesRevisions, slug: s.species.slug, publishedRevisionId: s.species.publishedRevisionId })
      .from(s.speciesRevisions)
      .innerJoin(s.species, eq(s.species.id, s.speciesRevisions.speciesId))
      .where(eq(s.speciesRevisions.id, id));
    if (!row) throw new NotFoundException('Revision not found');
    const { rev } = row;
    const content = await this.content.load(db, id);
    return {
      id: rev.id, speciesId: rev.speciesId, speciesSlug: row.slug, version: rev.version, state: rev.state,
      schemaVersion: rev.schemaVersion, baseRevisionId: rev.baseRevisionId, isPublished: row.publishedRevisionId === rev.id,
      selfReviewed: rev.selfReviewed, reviewNotes: rev.reviewNotes, createdAt: rev.createdAt.toISOString(),
      updatedAt: rev.updatedAt.toISOString(), submittedAt: iso(rev.submittedAt), reviewedAt: iso(rev.reviewedAt),
      publishedAt: iso(rev.publishedAt), content, checklist: await this.checklist(db, rev.speciesId, rev.schemaVersion, content),
    };
  }

  private async checklist(db: DbOrTx, speciesId: string, schemaVersion: number, c: RevisionContentDto): Promise<ChecklistItemDto[]> {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.speciesIdentifiers)
      .where(eq(s.speciesIdentifiers.speciesId, speciesId));
    const media = c.media.length
      ? await db
          .select({ license: s.mediaAssets.license, reviewState: s.mediaAssets.reviewState })
          .from(s.mediaAssets)
          .where(inArray(s.mediaAssets.id, c.media.map((m) => m.mediaId)))
      : [];
    let editorial;
    try {
      editorial = parseEditorial(schemaVersion, c.editorial);
    } catch {
      return [{ key: 'editorial-schema', ok: false, message: 'Editorial content matches the current schema' }];
    }
    return runChecklist({
      identifierCount: n,
      editorial,
      assessmentCount: c.assessments.length,
      estimateCount: c.populationEstimates.length,
      citationSections: c.citations.map((x) => x.sectionKey),
      regionsWithoutSource: [...c.regions, ...(c.ranges ?? [])].filter((r) => !r.sourceId).length,
      media,
    });
  }

  /** Copies the published aggregate (or, if nothing is published, the latest revision's group) into a new draft. */
  async createDraft(staff: StaffPrincipal, speciesId: string, db: DbOrTx = this.db): Promise<RevisionDetailDto> {
    const id = await db.transaction(async (tx) => {
      const [sp] = await tx.select().from(s.species).where(eq(s.species.id, speciesId)).for('update');
      if (!sp) throw new NotFoundException('Species not found');
      const [{ v }] = await tx.select({ v: max(s.speciesRevisions.version) }).from(s.speciesRevisions).where(eq(s.speciesRevisions.speciesId, speciesId));
      let content: RevisionContentDto;
      if (sp.publishedRevisionId) {
        content = await this.content.load(tx, sp.publishedRevisionId);
      } else {
        const [latest] = await tx
          .select({ g: s.speciesRevisions.displayGroup })
          .from(s.speciesRevisions)
          .where(eq(s.speciesRevisions.speciesId, speciesId))
          .orderBy(sql`${s.speciesRevisions.version} DESC`)
          .limit(1);
        content = EMPTY_CONTENT(latest?.g ?? 'other_invertebrate');
      }
      const [rev] = await tx
        .insert(s.speciesRevisions)
        .values({
          speciesId, version: (v ?? 0) + 1, displayGroup: content.displayGroup, editorial: content.editorial,
          authorId: staff.id, baseRevisionId: sp.publishedRevisionId, schemaVersion: CURRENT_EDITORIAL_VERSION,
        })
        .returning({ id: s.speciesRevisions.id });
      await this.content.replaceChildren(tx, rev.id, content, sp.locationSensitivity);
      await audit(tx, {
        actorId: staff.id, action: 'revision.create', entityType: 'species_revision', entityId: rev.id,
        summary: `Draft v${(v ?? 0) + 1} of ${sp.slug}${sp.publishedRevisionId ? ' copied from the published revision' : ''}`,
      });
      return rev.id;
    });
    return this.getRevision(id, db);
  }

  private async lockRevision(tx: Tx, id: string) {
    const [rev] = await tx.select().from(s.speciesRevisions).where(eq(s.speciesRevisions.id, id)).for('update');
    if (!rev) throw new NotFoundException('Revision not found');
    return rev;
  }

  async saveDraft(staff: StaffPrincipal, id: string, dto: SaveDraftDto, db: DbOrTx = this.db): Promise<RevisionDetailDto> {
    const editorial = validateEditorial(dto.editorial);
    const { expectedUpdatedAt, ...content } = dto;
    await db.transaction(async (tx) => {
      const rev = await this.lockRevision(tx, id);
      if (rev.state !== 'draft') throw new ConflictException({ code: 'NOT_DRAFT', message: `Revision is ${rev.state}; only drafts can be edited` });
      if (rev.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
        throw new ConflictException({ code: 'STALE_DRAFT', message: 'The draft was saved by someone else since you loaded it. Reload and reapply your changes.' });
      }
      await tx
        .update(s.speciesRevisions)
        .set({ editorial, displayGroup: content.displayGroup, schemaVersion: CURRENT_EDITORIAL_VERSION, updatedAt: new Date() })
        .where(eq(s.speciesRevisions.id, id));
      const [sp] = await tx.select({ sensitivity: s.species.locationSensitivity }).from(s.species).where(eq(s.species.id, rev.speciesId));
      await this.content.replaceChildren(tx, id, { ...content, editorial }, sp.sensitivity);
      await audit(tx, { actorId: staff.id, action: 'revision.save', entityType: 'species_revision', entityId: id, summary: `Saved draft v${rev.version}` });
    });
    return this.getRevision(id, db);
  }

  async submit(staff: StaffPrincipal, id: string): Promise<RevisionDetailDto> {
    await this.db.transaction(async (tx) => {
      const rev = await this.lockRevision(tx, id);
      if (rev.state !== 'draft') throw new ConflictException({ code: 'NOT_DRAFT', message: `Revision is ${rev.state}; only drafts can be submitted` });
      await this.assertChecklist(tx, id);
      await tx.update(s.speciesRevisions).set({ state: 'submitted', submittedAt: new Date(), updatedAt: new Date() }).where(eq(s.speciesRevisions.id, id));
      await audit(tx, { actorId: staff.id, action: 'revision.submit', entityType: 'species_revision', entityId: id, summary: `Submitted v${rev.version}` });
    });
    return this.getRevision(id);
  }

  private async assertChecklist(tx: Tx, id: string) {
    const detail = await this.getRevision(id, tx);
    if (!checklistPasses(detail.checklist)) {
      throw new UnprocessableEntityException({
        code: 'CHECKLIST_FAILED',
        message: 'The publication checklist is not complete',
        details: detail.checklist.filter((c) => !c.ok).map((c) => c.message),
      });
    }
  }

  /**
   * One transaction: lock the species row (serializes concurrent publishes), verify the revision is submitted,
   * re-run the checklist, verify the published pointer still equals the draft's base, mark published,
   * switch the pointer, audit. Revalidation runs after commit.
   */
  async publish(staff: StaffPrincipal, id: string): Promise<RevisionDetailDto> {
    const slug = await this.db.transaction(async (tx) => {
      const [target] = await tx.select({ speciesId: s.speciesRevisions.speciesId }).from(s.speciesRevisions).where(eq(s.speciesRevisions.id, id));
      if (!target) throw new NotFoundException('Revision not found');
      const [sp] = await tx.select().from(s.species).where(eq(s.species.id, target.speciesId)).for('update');
      const rev = await this.lockRevision(tx, id);
      if (rev.state !== 'submitted') {
        throw new ConflictException({ code: 'NOT_SUBMITTED', message: `Revision is ${rev.state}; only a submitted revision can be published` });
      }
      if ((sp.publishedRevisionId ?? null) !== (rev.baseRevisionId ?? null)) {
        throw new ConflictException({
          code: 'PUBLISH_CONFLICT',
          message: 'Another revision was published after this draft was started. Create a new draft from the current published version.',
        });
      }
      await this.assertChecklist(tx, id);
      const now = new Date();
      await tx
        .update(s.speciesRevisions)
        .set({ state: 'published', reviewerId: staff.id, reviewedAt: now, publishedAt: now, selfReviewed: rev.authorId === staff.id, updatedAt: now })
        .where(eq(s.speciesRevisions.id, id));
      await tx.update(s.species).set({ publishedRevisionId: id }).where(eq(s.species.id, sp.id));
      await audit(tx, {
        actorId: staff.id, action: 'revision.publish', entityType: 'species_revision', entityId: id,
        summary: `Published v${rev.version} of ${sp.slug}${rev.authorId === staff.id ? ' (self-reviewed)' : ''}`,
      });
      return sp.slug;
    });
    await this.revalidation.revalidate([`species:${slug}`, 'catalogue']);
    return this.getRevision(id);
  }

  /**
   * Rollback (PLAN §6): move the published pointer back to an earlier *published* revision of the same species.
   * One transaction with the species row locked, like publish. `expectedPublishedRevisionId` is the optimistic
   * check: if someone published or rolled back in the meantime, this fails with 409. Audited; revalidates after commit.
   * Drafts that were based on the replaced revision can no longer be published (PUBLISH_CONFLICT), by design.
   */
  async rollback(staff: StaffPrincipal, speciesId: string, dto: RollbackDto): Promise<StaffSpeciesDto> {
    const slug = await this.db.transaction(async (tx) => {
      const [sp] = await tx.select().from(s.species).where(eq(s.species.id, speciesId)).for('update');
      if (!sp) throw new NotFoundException('Species not found');
      if (sp.publishedRevisionId !== dto.expectedPublishedRevisionId) {
        throw new ConflictException({ code: 'ROLLBACK_CONFLICT', message: 'The live version changed since you loaded this page. Reload and try again.' });
      }
      if (dto.targetRevisionId === sp.publishedRevisionId) {
        throw new UnprocessableEntityException({ code: 'ALREADY_LIVE', message: 'That version is already live' });
      }
      const [target] = await tx
        .select({ id: s.speciesRevisions.id, version: s.speciesRevisions.version, state: s.speciesRevisions.state })
        .from(s.speciesRevisions)
        .where(and(eq(s.speciesRevisions.id, dto.targetRevisionId), eq(s.speciesRevisions.speciesId, speciesId)));
      if (!target || target.state !== 'published') {
        throw new UnprocessableEntityException({ code: 'NOT_PUBLISHED', message: 'Only an earlier published version of this species can be restored' });
      }
      const [current] = await tx
        .select({ version: s.speciesRevisions.version })
        .from(s.speciesRevisions)
        .where(eq(s.speciesRevisions.id, sp.publishedRevisionId as string));
      await tx.update(s.species).set({ publishedRevisionId: target.id }).where(eq(s.species.id, speciesId));
      await audit(tx, {
        actorId: staff.id, action: 'species.rollback', entityType: 'species', entityId: speciesId,
        summary: `Rolled back ${sp.slug} from v${current?.version ?? '?'} (${sp.publishedRevisionId}) to v${target.version} (${target.id}). Reason: ${dto.reason}`,
      });
      return sp.slug;
    });
    await this.revalidation.revalidate([`species:${slug}`, 'catalogue']);
    return this.getSpecies(speciesId);
  }

  async requestChanges(staff: StaffPrincipal, id: string, notes: string): Promise<RevisionDetailDto> {
    await this.db.transaction(async (tx) => {
      const rev = await this.lockRevision(tx, id);
      if (rev.state !== 'submitted') throw new ConflictException({ code: 'NOT_SUBMITTED', message: `Revision is ${rev.state}` });
      const now = new Date();
      await tx
        .update(s.speciesRevisions)
        .set({ state: 'changes_requested', reviewNotes: notes, reviewerId: staff.id, reviewedAt: now, updatedAt: now })
        .where(eq(s.speciesRevisions.id, id));
      await audit(tx, { actorId: staff.id, action: 'revision.request_changes', entityType: 'species_revision', entityId: id, summary: `Changes requested on v${rev.version}` });
    });
    return this.getRevision(id);
  }

  // ---------- sources and reference lists ----------

  async listSources(q?: string): Promise<SourceDto[]> {
    const rows = await this.db
      .select()
      .from(s.sources)
      .where(q ? ilike(s.sources.title, `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`) : undefined)
      .orderBy(asc(s.sources.title))
      .limit(50);
    return rows.map(toSourceDto);
  }

  /** Sources are never edited in place (PLAN §6): a correction is a new source row. */
  async createSource(staff: StaffPrincipal, dto: CreateSourceDto): Promise<SourceDto> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(s.sources)
        .values({
          title: dto.title, publisher: dto.publisher ?? null, authors: dto.authors ?? null, url: dto.url ?? null, doi: dto.doi ?? null,
          publishedOn: dto.publishedOn ?? null, accessedOn: dto.accessedOn ?? null, license: dto.license ?? null,
          permittedUseNote: dto.permittedUseNote ?? null,
        })
        .returning();
      await audit(tx, { actorId: staff.id, action: 'source.create', entityType: 'source', entityId: row.id, summary: 'Created source' });
      return toSourceDto(row);
    });
  }

  /**
   * Edits a source (PLAN §6 "sources"). If any submitted or published revision cites it, the old row is left
   * untouched and a NEW source row is created: published citations keep pointing at what was actually cited,
   * and new drafts can pick the corrected source. An uncited source (only drafts) is corrected in place.
   */
  async updateSource(staff: StaffPrincipal, id: string, dto: UpdateSourceDto): Promise<SourceUpdateResultDto> {
    return this.db.transaction(async (tx) => {
      const [old] = await tx.select().from(s.sources).where(eq(s.sources.id, id)).for('update');
      if (!old) throw new NotFoundException('Source not found');
      const values = {
        title: dto.title, publisher: dto.publisher ?? null, authors: dto.authors ?? null, url: dto.url ?? null, doi: dto.doi ?? null,
        publishedOn: dto.publishedOn ?? null, accessedOn: dto.accessedOn ?? null, license: dto.license ?? null,
        permittedUseNote: dto.permittedUseNote ?? null,
      };
      const cited = await sourceIsCitedOutsideDrafts(tx, id);
      if (cited) {
        const [row] = await tx.insert(s.sources).values(values).returning();
        await audit(tx, {
          actorId: staff.id, action: 'source.supersede', entityType: 'source', entityId: row.id,
          summary: `New source row for a correction of ${id}, which is cited by a submitted or published revision and stays unchanged`,
        });
        return { source: toSourceDto(row), createdNewRow: true };
      }
      const [row] = await tx.update(s.sources).set(values).where(eq(s.sources.id, id)).returning();
      await audit(tx, { actorId: staff.id, action: 'source.edit', entityType: 'source', entityId: id, summary: 'Edited source (cited by drafts only)' });
      return { source: toSourceDto(row), createdNewRow: false };
    });
  }

  async referenceLists(): Promise<ReferenceListsDto> {
    const [regions, habitats, threats, media, links] = await Promise.all([
      this.db.select({ id: s.regions.id, slug: s.regions.slug, name: s.regions.name, type: s.regions.type }).from(s.regions).orderBy(asc(s.regions.name)),
      this.db.select({ id: s.habitats.id, code: s.habitats.code, name: s.habitats.name }).from(s.habitats).orderBy(asc(s.habitats.code)),
      this.db.select({ id: s.threats.id, code: s.threats.code, name: s.threats.name }).from(s.threats).orderBy(asc(s.threats.code)),
      this.db
        .select({ id: s.mediaAssets.id, credit: s.mediaAssets.credit, license: s.mediaAssets.license, reviewState: s.mediaAssets.reviewState })
        .from(s.mediaAssets)
        .orderBy(asc(s.mediaAssets.createdAt)),
      this.db
        .select({ id: s.supportLinks.id, organizationName: s.organizations.name, url: s.supportLinks.url, editorialStatus: s.supportLinks.editorialStatus })
        .from(s.supportLinks)
        .innerJoin(s.organizations, and(eq(s.organizations.id, s.supportLinks.organizationId)))
        .orderBy(asc(s.organizations.name)),
    ]);
    return { regions, habitats, threats, media, supportLinks: links };
  }
}

/** Every place a source can be cited from revision content, plus region boundaries (which are public). */
async function sourceIsCitedOutsideDrafts(db: DbOrTx, sourceId: string): Promise<boolean> {
  const res = await db.execute<{ cited: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM species_revisions r
      WHERE r.state <> 'draft' AND r.id IN (
        SELECT revision_id FROM revision_citations WHERE source_id = ${sourceId}
        UNION ALL SELECT revision_id FROM assessments WHERE source_id = ${sourceId}
        UNION ALL SELECT revision_id FROM population_estimates WHERE source_id = ${sourceId}
        UNION ALL SELECT revision_id FROM species_regions WHERE source_id = ${sourceId}
        UNION ALL SELECT revision_id FROM species_ranges WHERE source_id = ${sourceId}
        UNION ALL SELECT revision_id FROM species_habitats WHERE source_id = ${sourceId}
        UNION ALL SELECT revision_id FROM species_threats WHERE source_id = ${sourceId})
    ) OR EXISTS (SELECT 1 FROM regions WHERE source_id = ${sourceId}) AS cited`);
  return res.rows[0]?.cited === true;
}

function toSourceDto(r: typeof s.sources.$inferSelect): SourceDto {
  return {
    id: r.id, title: r.title, publisher: r.publisher, authors: r.authors, url: r.url, doi: r.doi,
    publishedOn: r.publishedOn, accessedOn: r.accessedOn, license: r.license,
  };
}
