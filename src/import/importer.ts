import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { createHash } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { audit } from '../common/audit';
import { Db, Tx } from '../db/db.module';
import * as s from '../db/schema';
import { RevisionContentDto, SaveDraftDto } from '../editorial/dto';
import { CURRENT_EDITORIAL_VERSION, EditorialSchemaError, parseEditorial } from '../editorial/editorial-schema';
import { EditorialService } from '../editorial/editorial.service';
import { RevisionContentRepository } from '../editorial/revision-content.repository';
import type { StaffPrincipal } from '../identity/session.service';
import { MediaService } from '../media/media.service';
import { ImportFile, ImportFileT, ImportSpeciesT } from './import-schema';

/**
 * Import CLI engine (PLAN §8, DECISIONS D-023).
 *
 * - Validates the whole file with zod before touching the database.
 * - Matches species on stable provider identifiers, then slug. Never matches on common names.
 * - Creates or updates DRAFTS only. It never submits, publishes or edits species identity (name, rank, sensitivity).
 * - Applies one file in one transaction. `dryRun` runs everything and then rolls back, writing no files.
 * - Idempotent: each content section is compared in a normalized form, so re-running the same file changes nothing.
 * - Manual-edit protection: `import_records` keeps the hash of what the importer last wrote per section. If the
 *   current value differs from it, a person changed it, and the section is skipped unless `reconcile` is set.
 */

export type FetchBytes = (url: string) => Promise<Buffer>;
export type ReadLocal = (relativePath: string) => Promise<Buffer>;

export interface ImportOptions {
  dryRun: boolean;
  reconcile: boolean;
  fileName: string;
}

export type SectionOutcome = 'unchanged' | 'applied' | 'skipped_manual_edit' | 'overwritten_reconcile';

export interface SpeciesReport {
  slug: string;
  action: 'created' | 'draft_created' | 'draft_updated' | 'unchanged' | 'skipped';
  draftVersion: number | null;
  sections: Array<{ key: string; outcome: SectionOutcome }>;
  notes: string[];
}

export interface ImportReport {
  fileName: string;
  mode: 'dry-run' | 'apply';
  reconcile: boolean;
  startedAt: string;
  sourcesCreated: string[];
  mediaCreated: string[];
  identifiersAdded: string[];
  notes: string[];
  species: SpeciesReport[];
  /** Everything that changed the database. Zero means the run was a no-op. */
  changeCount: number;
}

export class ImportValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`The import file is invalid:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
  }
}

class DryRunRollback extends Error {}

// ---------- normalization ----------

/** Canonical JSON: object keys sorted, null/undefined dropped. Arrays keep their order. */
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== null && x !== undefined) out[k] = canon(x);
    }
    return out;
  }
  return v;
}
const str = (v: unknown) => JSON.stringify(canon(v)) ?? 'null';
const sortedBy = <T>(xs: T[]) => [...xs].map((x) => str(x)).sort();
const hash = (v: string) => createHash('sha256').update(v).digest('hex');

type Content = Omit<RevisionContentDto, 'ranges' | 'supportLinks'> & Partial<Pick<RevisionContentDto, 'ranges' | 'supportLinks'>>;

const ARRAY_SECTIONS = ['names', 'environments', 'regions', 'habitats', 'threats', 'citations', 'media'] as const;
const STATUS_SECTION = 'status-population';

/** Section key → normalized string of the section's value in `c`. */
function sectionValues(c: Content): Map<string, string> {
  const m = new Map<string, string>();
  m.set('displayGroup', str(c.displayGroup));
  for (const k of ARRAY_SECTIONS) {
    const arr = (c[k] ?? []) as unknown[];
    m.set(k, JSON.stringify(k === 'media' ? [...arr].sort((a, b) => (a as { position: number }).position - (b as { position: number }).position).map(canon) : sortedBy(arr)));
  }
  // Estimates point at assessments by index, so the two are one section, compared by the assessment they point to.
  const as = c.assessments.map((a) => str(a));
  m.set(
    STATUS_SECTION,
    JSON.stringify({
      assessments: [...as].sort(),
      estimates: c.populationEstimates.map((e) => {
        const { assessmentIndex, ...rest } = e;
        return { ...(canon(rest) as object), assessment: assessmentIndex != null ? (as[assessmentIndex] ?? null) : null };
      }),
    }),
  );
  for (const k of Object.keys(c.editorial ?? {})) m.set(`editorial.${k}`, str(c.editorial[k]));
  return m;
}

const EMPTY_VALUES = new Set(['[]', 'null', JSON.stringify({ assessments: [], estimates: [] })]);

function applySection(target: Content, incoming: Content, key: string) {
  if (key === 'displayGroup') target.displayGroup = incoming.displayGroup;
  else if (key === STATUS_SECTION) {
    target.assessments = incoming.assessments;
    target.populationEstimates = incoming.populationEstimates;
  } else if (key.startsWith('editorial.')) {
    const k = key.slice('editorial.'.length);
    const editorial = { ...target.editorial };
    if (incoming.editorial[k] === undefined) delete editorial[k];
    else editorial[k] = incoming.editorial[k];
    target.editorial = editorial;
  } else {
    (target as unknown as Record<string, unknown>)[key] = (incoming as unknown as Record<string, unknown>)[key];
  }
}

// ---------- importer ----------

export class Importer {
  constructor(
    private readonly db: Db,
    private readonly editorial: EditorialService,
    private readonly content: RevisionContentRepository,
    private readonly media: MediaService,
    private readonly fetchBytes: FetchBytes,
    private readonly readLocal: ReadLocal,
  ) {}

  static parse(raw: unknown): ImportFileT {
    const r = ImportFile.safeParse(raw);
    if (!r.success) throw new ImportValidationError(r.error.issues.map((i) => `${i.path.join('.') || '(file)'}: ${i.message}`));
    return r.data;
  }

  async run(staff: StaffPrincipal, raw: unknown, opts: ImportOptions): Promise<ImportReport> {
    const file = Importer.parse(raw);
    const report: ImportReport = {
      fileName: opts.fileName, mode: opts.dryRun ? 'dry-run' : 'apply', reconcile: opts.reconcile, startedAt: new Date().toISOString(),
      sourcesCreated: [], mediaCreated: [], identifiersAdded: [], notes: [], species: [], changeCount: 0,
    };

    // Network and disk reads happen before the transaction opens.
    const mediaBytes = new Map<string, Buffer>();
    for (const m of file.media) {
      try {
        mediaBytes.set(m.key, m.url ? await this.fetchBytes(m.url) : await this.readLocal(m.path as string));
      } catch (e) {
        throw new ImportValidationError([`media.${m.key}: could not be read (${e instanceof Error ? e.message : 'error'})`]);
      }
    }

    try {
      await this.db.transaction(async (tx) => {
        // References first: an unknown region or code fails the run before any image file is written.
        const refs = await this.lookupReferences(tx, file);
        const sourceIds = await this.resolveSources(tx, staff, file, report);
        const mediaIds = new Map<string, string>();
        for (const m of file.media) {
          const { asset, created } = await this.media.ingest(
            staff.id, mediaBytes.get(m.key) as Buffer,
            { creator: m.creator, credit: m.credit, license: m.license, licenseUrl: m.licenseUrl, sourceUrl: m.sourceUrl, modifications: m.modifications },
            tx, { store: !opts.dryRun },
          );
          mediaIds.set(m.key, asset.id);
          if (created) report.mediaCreated.push(`${m.key} (pending review)`);
          else {
            if (asset.credit !== m.credit.trim() || asset.license !== m.license.trim()) {
              report.notes.push(`media.${m.key}: this image is already stored with different credit or licence; not changed (edit it in /admin/media)`);
            }
            if (asset.reviewState === 'rejected') report.notes.push(`media.${m.key}: this image was rejected in review and will not be shown`);
          }
        }
        for (const sp of file.species) {
          report.species.push(await this.importSpecies(tx, staff, sp, { sourceIds, mediaIds, ...refs }, opts, report));
        }
        report.changeCount =
          report.sourcesCreated.length + report.mediaCreated.length + report.identifiersAdded.length +
          report.species.reduce((n, x) => n + (x.action === 'created' ? 1 : 0) + x.sections.filter((y) => y.outcome === 'applied' || y.outcome === 'overwritten_reconcile').length, 0);
        if (!opts.dryRun && report.changeCount > 0) {
          await audit(tx, {
            actorId: staff.id, action: 'import.apply', entityType: 'import', entityId: opts.fileName.slice(0, 200),
            summary: `Imported ${opts.fileName}: ${report.changeCount} change(s)${opts.reconcile ? ' with --reconcile' : ''}`,
          });
        }
        if (opts.dryRun) throw new DryRunRollback();
      });
    } catch (e) {
      if (!(e instanceof DryRunRollback)) throw e;
    }
    return report;
  }

  /** Sources are matched on every field. A changed source is a new row (sources are never edited in place, PLAN §6). */
  private async resolveSources(tx: Tx, staff: StaffPrincipal, file: ImportFileT, report: ImportReport): Promise<Map<string, string>> {
    const ids = new Map<string, string>();
    for (const src of file.sources) {
      const { key, ...fields } = src;
      const candidates = await tx.select().from(s.sources).where(eq(s.sources.title, fields.title));
      const want = str(fields);
      const hit = candidates.find((c) =>
        str({ title: c.title, publisher: c.publisher, authors: c.authors, url: c.url, doi: c.doi, publishedOn: c.publishedOn, accessedOn: c.accessedOn, license: c.license, permittedUseNote: c.permittedUseNote }) === want,
      );
      if (hit) {
        ids.set(key, hit.id);
        continue;
      }
      const [row] = await tx.insert(s.sources).values(fields).returning({ id: s.sources.id });
      await audit(tx, { actorId: staff.id, action: 'source.create', entityType: 'source', entityId: row.id, summary: `Created source by import (${key})` });
      ids.set(key, row.id);
      report.sourcesCreated.push(key);
    }
    return ids;
  }

  private async lookupReferences(tx: Tx, file: ImportFileT) {
    const all = file.species.map((x) => x.content);
    const regionSlugs = [...new Set(all.flatMap((c) => [...c.regions.map((r) => r.region), ...c.assessments.flatMap((a) => a.region ?? []), ...c.populationEstimates.flatMap((e) => e.region ?? [])]))];
    const habitatCodes = [...new Set(all.flatMap((c) => c.habitats.map((h) => h.code)))];
    const threatCodes = [...new Set(all.flatMap((c) => c.threats.map((t) => t.code)))];
    const regionIds = new Map(
      regionSlugs.length ? (await tx.select({ id: s.regions.id, slug: s.regions.slug }).from(s.regions).where(inArray(s.regions.slug, regionSlugs))).map((r) => [r.slug, r.id]) : [],
    );
    const habitatIds = new Map(
      habitatCodes.length ? (await tx.select({ id: s.habitats.id, code: s.habitats.code }).from(s.habitats).where(inArray(s.habitats.code, habitatCodes))).map((r) => [r.code, r.id]) : [],
    );
    const threatIds = new Map(
      threatCodes.length ? (await tx.select({ id: s.threats.id, code: s.threats.code }).from(s.threats).where(inArray(s.threats.code, threatCodes))).map((r) => [r.code, r.id]) : [],
    );
    const missing = [
      ...regionSlugs.filter((x) => !regionIds.has(x)).map((x) => `region "${x}"`),
      ...habitatCodes.filter((x) => !habitatIds.has(x)).map((x) => `habitat "${x}"`),
      ...threatCodes.filter((x) => !threatIds.has(x)).map((x) => `threat "${x}"`),
    ];
    if (missing.length) throw new ImportValidationError(missing.map((m) => `Unknown ${m}`));
    return { regionIds, habitatIds, threatIds };
  }

  private toContent(
    sp: ImportSpeciesT,
    r: { sourceIds: Map<string, string>; mediaIds: Map<string, string>; regionIds: Map<string, string>; habitatIds: Map<string, string>; threatIds: Map<string, string> },
  ): Content {
    const c = sp.content;
    const src = (k: string) => r.sourceIds.get(k) as string;
    const reg = (slug: string | null) => (slug ? (r.regionIds.get(slug) as string) : null);
    // Normalize through the same versioned schema the save uses, so what is compared is what gets stored.
    let editorial: Record<string, unknown>;
    try {
      editorial = parseEditorial(CURRENT_EDITORIAL_VERSION, c.editorial) as Record<string, unknown>;
    } catch (e) {
      if (e instanceof EditorialSchemaError) throw new ImportValidationError([`${sp.slug}.editorial: ${e.message}`]);
      throw e;
    }
    return {
      displayGroup: c.displayGroup,
      editorial,
      names: c.names,
      environments: c.environments,
      assessments: c.assessments.map(({ sourceKey, region, ...a }) => ({ ...a, sourceId: src(sourceKey), regionId: reg(region) })),
      populationEstimates: c.populationEstimates.map(({ sourceKey, region, ...e }) => ({ ...e, sourceId: src(sourceKey), regionId: reg(region) })),
      regions: c.regions.map(({ sourceKey, region, ...x }) => ({ ...x, regionId: reg(region) as string, sourceId: src(sourceKey) })),
      habitats: c.habitats.map(({ sourceKey, code, ...x }) => ({ ...x, habitatId: r.habitatIds.get(code) as string, sourceId: src(sourceKey) })),
      threats: c.threats.map(({ sourceKey, code, ...x }) => ({ ...x, threatId: r.threatIds.get(code) as string, sourceId: src(sourceKey) })),
      citations: c.citations.map(({ sourceKey, ...x }) => ({ ...x, sourceId: src(sourceKey) })),
      media: c.media.map(({ mediaKey, ...x }) => ({ ...x, mediaId: r.mediaIds.get(mediaKey) as string })),
    };
  }

  private async findSpecies(tx: Tx, sp: ImportSpeciesT): Promise<typeof s.species.$inferSelect | null> {
    const byIdent = await tx
      .select({ speciesId: s.speciesIdentifiers.speciesId })
      .from(s.speciesIdentifiers)
      .where(sql`(${s.speciesIdentifiers.provider}, ${s.speciesIdentifiers.externalId}) IN (${sql.join(
        sp.identifiers.map((i) => sql`(${i.provider}, ${i.externalId})`),
        sql`, `,
      )})`);
    const ids = [...new Set(byIdent.map((x) => x.speciesId))];
    if (ids.length > 1) throw new ImportValidationError([`${sp.slug}: its identifiers belong to ${ids.length} different species`]);
    const [bySlug] = await tx.select().from(s.species).where(eq(s.species.slug, sp.slug));
    if (ids.length === 1) {
      if (bySlug && bySlug.id !== ids[0]) throw new ImportValidationError([`${sp.slug}: the slug and the identifiers point at different species`]);
      const [row] = await tx.select().from(s.species).where(eq(s.species.id, ids[0]));
      return row;
    }
    return bySlug ?? null;
  }

  private async importSpecies(
    tx: Tx, staff: StaffPrincipal, sp: ImportSpeciesT,
    refs: Parameters<Importer['toContent']>[1], opts: ImportOptions, report: ImportReport,
  ): Promise<SpeciesReport> {
    const out: SpeciesReport = { slug: sp.slug, action: 'unchanged', draftVersion: null, sections: [], notes: [] };
    let row = await this.findSpecies(tx, sp);
    let created = false;
    if (!row) {
      await this.editorial.createSpecies(
        staff, { slug: sp.slug, acceptedScientificName: sp.scientificName, rank: sp.rank, displayGroup: sp.content.displayGroup, locationSensitivity: sp.locationSensitivity },
        tx,
      );
      [row] = await tx.select().from(s.species).where(eq(s.species.slug, sp.slug));
      created = true;
      out.action = 'created';
    } else {
      if (row.slug !== sp.slug) out.notes.push(`Matched by identifier to existing slug "${row.slug}"; the slug is not changed`);
      if (row.acceptedScientificName !== sp.scientificName || row.rank !== sp.rank || row.locationSensitivity !== sp.locationSensitivity) {
        out.notes.push('Scientific name, rank or location sensitivity differ from the database. Identity is not changed by import; change it by hand if needed.');
      }
    }
    const speciesId = row.id;

    // Identifiers: add missing ones. One that belongs to another species was refused in findSpecies.
    const have = await tx.select().from(s.speciesIdentifiers).where(eq(s.speciesIdentifiers.speciesId, speciesId));
    for (const i of sp.identifiers) {
      if (have.some((h) => h.provider === i.provider && h.externalId === i.externalId)) continue;
      await this.editorial.addIdentifier(staff, speciesId, { provider: i.provider, externalId: i.externalId, sourceUrl: i.sourceUrl ?? undefined }, tx);
      report.identifiersAdded.push(`${sp.slug}: ${i.provider}:${i.externalId}`);
    }

    const revs = await tx
      .select({ id: s.speciesRevisions.id, version: s.speciesRevisions.version, state: s.speciesRevisions.state, updatedAt: s.speciesRevisions.updatedAt })
      .from(s.speciesRevisions)
      .where(eq(s.speciesRevisions.speciesId, speciesId))
      .orderBy(desc(s.speciesRevisions.version));
    if (revs[0]?.state === 'submitted') {
      out.action = 'skipped';
      out.notes.push(`v${revs[0].version} is waiting for review. Import again after it is published or sent back.`);
      return out;
    }
    const openDraft = revs.find((r) => r.state === 'draft') ?? null;
    const current: Content = openDraft
      ? await this.content.load(tx, openDraft.id)
      : row.publishedRevisionId
        ? await this.content.load(tx, row.publishedRevisionId)
        : {
            displayGroup: sp.content.displayGroup, editorial: {}, names: [], environments: [], assessments: [], populationEstimates: [],
            regions: [], habitats: [], threats: [], citations: [], media: [],
          };

    const incoming = this.toContent(sp, refs);
    const records = new Map(
      (await tx.select().from(s.importRecords).where(eq(s.importRecords.speciesId, speciesId))).map((r) => [r.sectionKey, r.importedHash]),
    );
    const cur = sectionValues(current);
    const inc = sectionValues(incoming);
    const keys = [...new Set([...cur.keys(), ...inc.keys()])].sort();
    const merged: Content = structuredClone(current);
    const toRecord: Array<[string, string]> = [];
    for (const key of keys) {
      const c = cur.get(key) ?? 'null';
      const n = inc.get(key) ?? 'null';
      const recorded = records.get(key);
      if (c === n) {
        out.sections.push({ key, outcome: 'unchanged' });
        if (recorded !== hash(n)) toRecord.push([key, hash(n)]);
        continue;
      }
      const untouched = recorded ? recorded === hash(c) : EMPTY_VALUES.has(c);
      if (untouched || opts.reconcile) {
        applySection(merged, incoming, key);
        out.sections.push({ key, outcome: untouched ? 'applied' : 'overwritten_reconcile' });
        toRecord.push([key, hash(n)]);
      } else {
        out.sections.push({ key, outcome: 'skipped_manual_edit' });
      }
    }

    const changed = out.sections.some((x) => x.outcome === 'applied' || x.outcome === 'overwritten_reconcile');
    if (changed) {
      let draft = openDraft;
      if (!draft) {
        const d = await this.editorial.createDraft(staff, speciesId, tx);
        draft = { id: d.id, version: d.version, state: 'draft', updatedAt: new Date(d.updatedAt) };
        if (!created) out.action = 'draft_created';
      } else if (!created) out.action = 'draft_updated';
      const body = { ...merged, ranges: merged.ranges ?? [], supportLinks: merged.supportLinks ?? [], expectedUpdatedAt: draft.updatedAt.toISOString() };
      const dto = plainToInstance(SaveDraftDto, body);
      const problems = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      if (problems.length) {
        throw new ImportValidationError(problems.map((p) => `${sp.slug}.${p.property}: ${Object.values(p.constraints ?? {}).join('; ') || 'invalid'}`));
      }
      const saved = await this.editorial.saveDraft(staff, draft.id, body as SaveDraftDto, tx);
      out.draftVersion = saved.version;
    }
    for (const [key, h] of toRecord) {
      await tx
        .insert(s.importRecords)
        .values({ speciesId, sectionKey: key, importedHash: h, fileName: opts.fileName })
        .onConflictDoUpdate({ target: [s.importRecords.speciesId, s.importRecords.sectionKey], set: { importedHash: h, fileName: opts.fileName, importedAt: new Date() } });
    }
    return out;
  }
}

// ---------- report ----------

const OUTCOME_LABEL: Record<SectionOutcome, string> = {
  unchanged: 'unchanged',
  applied: 'updated',
  skipped_manual_edit: '**skipped: edited by hand** (use --reconcile to overwrite)',
  overwritten_reconcile: '**overwritten (--reconcile)**: a manual edit was replaced',
};

export function reportMarkdown(r: ImportReport): string {
  const lines = [
    `# Import report: ${r.fileName}`,
    '',
    `- Mode: **${r.mode}**${r.reconcile ? ' with --reconcile' : ''}`,
    `- Started: ${r.startedAt}`,
    `- Changes: **${r.changeCount}**${r.mode === 'dry-run' ? ' (nothing was written)' : ''}`,
    '- Drafts only: nothing was submitted or published.',
    '',
    '## Sources created',
    ...(r.sourcesCreated.length ? r.sourcesCreated.map((x) => `- ${x}`) : ['- none']),
    '',
    '## Images stored',
    ...(r.mediaCreated.length ? r.mediaCreated.map((x) => `- ${x}`) : ['- none']),
    '',
    '## Identifiers added',
    ...(r.identifiersAdded.length ? r.identifiersAdded.map((x) => `- ${x}`) : ['- none']),
  ];
  if (r.notes.length) lines.push('', '## Notes', ...r.notes.map((x) => `- ${x}`));
  lines.push('', '## Species');
  for (const sp of r.species) {
    lines.push('', `### ${sp.slug}: ${sp.action.replace(/_/g, ' ')}${sp.draftVersion ? ` (draft v${sp.draftVersion})` : ''}`);
    for (const n of sp.notes) lines.push(`- Note: ${n}`);
    const interesting = sp.sections.filter((x) => x.outcome !== 'unchanged');
    if (!interesting.length) lines.push('- No section changed.');
    else {
      lines.push('', '| Section | Result |', '|---|---|');
      for (const x of interesting) lines.push(`| ${x.key} | ${OUTCOME_LABEL[x.outcome]} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

export async function importStaff(db: Db): Promise<StaffPrincipal> {
  // The import author has no password, so it can never sign in. Drafts it writes show it as the author.
  const email = 'import@example.invalid';
  await db.insert(s.staffUsers).values({ email, name: 'Import CLI', role: 'editor' }).onConflictDoNothing();
  const [u] = await db.select().from(s.staffUsers).where(and(eq(s.staffUsers.email, email)));
  return { id: u.id, name: u.name, email: u.email, role: 'editor', sessionId: 'cli', csrfToken: 'cli' };
}
