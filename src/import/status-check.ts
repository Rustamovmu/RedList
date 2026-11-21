import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { and, asc, desc, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { audit } from '../common/audit';
import { Db, Tx } from '../db/db.module';
import * as s from '../db/schema';
import { RevisionContentDto, SaveDraftDto } from '../editorial/dto';
import { EditorialService } from '../editorial/editorial.service';
import { RevisionContentRepository } from '../editorial/revision-content.repository';
import type { StaffPrincipal } from '../identity/session.service';

/**
 * Hand-checked IUCN status (R1 launch readiness, DECISIONS D-032).
 *
 * The coding agent may not read IUCN pages (D-027), so a person checks each published species on the Red List
 * and writes what they saw into a CSV sheet. This module
 *  - builds that sheet from the published catalogue (`buildSheet`), keeping anything already filled in, and
 *  - turns filled-in rows into DRAFTS (`StatusCheckImporter`). It never submits or publishes, and it never
 *    supplies a value: every category, date and trend comes from the sheet.
 *
 * Per filled row, the draft's GLOBAL assessments are replaced by one assessment citing a new source
 * "IUCN Red List, checked by hand". Regional assessments, population estimates and every other section are kept.
 * Status citations that pointed at a replaced assessment's source move to the new source.
 */

// ---------- CSV ----------

export const SHEET_COLUMNS = [
  'slug', 'scientific_name', 'current_category', 'current_source', 'current_edition', 'iucn_taxon_id', 'iucn_search_url',
  'checked_category', 'date_assessed', 'trend', 'criteria', 'assessment_url', 'date_checked', 'owner_note',
] as const;
export const OWNER_COLUMNS = ['checked_category', 'date_assessed', 'trend', 'criteria', 'assessment_url', 'date_checked', 'owner_note'] as const;
/** Owner columns that must all be present for a row to be imported (criteria and owner_note are optional). */
const REQUIRED_OWNER = ['checked_category', 'date_assessed', 'trend', 'assessment_url', 'date_checked'] as const;

export type SheetRow = Record<(typeof SHEET_COLUMNS)[number], string>;

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // drop a byte-order mark (spreadsheet exports)
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (quoted) throw new StatusCheckError(['The CSV has an unclosed quote']);
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const csvCell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
export const toCsv = (rows: SheetRow[]) =>
  [SHEET_COLUMNS.join(','), ...rows.map((r) => SHEET_COLUMNS.map((c) => csvCell(r[c] ?? '')).join(','))].join('\n') + '\n';

export function readSheet(text: string): SheetRow[] {
  const [header, ...body] = parseCsv(text);
  if (!header) throw new StatusCheckError(['The CSV is empty']);
  const names = header.map((h) => h.trim());
  const missing = SHEET_COLUMNS.filter((c) => !names.includes(c));
  if (missing.length) throw new StatusCheckError([`Missing columns: ${missing.join(', ')}`]);
  return body.map((cells) => {
    const r = {} as SheetRow;
    for (const c of SHEET_COLUMNS) r[c] = (cells[names.indexOf(c)] ?? '').trim();
    return r;
  });
}

export class StatusCheckError extends Error {
  constructor(readonly issues: string[]) {
    super(`The status sheet is invalid:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
  }
}

// ---------- building the sheet ----------

const EDITION = /The IUCN Red List of Threatened Species (\d{4}(?:\.\d+)?)/;

/** Search link for the owner. The agent cannot open iucnredlist.org (D-027), so this link was not tested. */
export const iucnSearchUrl = (scientificName: string) =>
  `https://www.iucnredlist.org/search?query=${encodeURIComponent(scientificName)}&searchType=species`;

/**
 * One row per published species, ordered by slug. Owner columns are copied from `previous` (matched by slug).
 * Filled rows for species that are no longer published are kept at the end so no hand-checked value is lost.
 * `excludeFixtures` leaves out the synthetic development taxa (identifier provider `fixture`), which have no
 * IUCN assessment to check.
 */
export async function buildSheet(db: Db, previous: SheetRow[] = [], opts: { excludeFixtures?: boolean } = {}): Promise<{ rows: SheetRow[]; orphaned: string[] }> {
  let species = await db
    .select({ id: s.species.id, slug: s.species.slug, name: s.species.acceptedScientificName, revisionId: s.species.publishedRevisionId })
    .from(s.species)
    .where(and(isNotNull(s.species.publishedRevisionId), isNull(s.species.archivedAt)))
    .orderBy(asc(s.species.slug));
  if (opts.excludeFixtures && species.length) {
    const fx = await db
      .select({ id: s.speciesIdentifiers.speciesId })
      .from(s.speciesIdentifiers)
      .where(and(inArray(s.speciesIdentifiers.speciesId, species.map((x) => x.id)), eq(s.speciesIdentifiers.provider, 'fixture')));
    const skip = new Set(fx.map((x) => x.id));
    species = species.filter((x) => !skip.has(x.id));
  }
  return assembleSheet(db, species.filter((x) => x.revisionId) as Array<{ id: string; slug: string; name: string; revisionId: string }>, previous);
}

async function assembleSheet(db: Db, species: Array<{ id: string; slug: string; name: string; revisionId: string }>, previous: SheetRow[]) {
  const ids = species.map((x) => x.id);
  const revIds = species.map((x) => x.revisionId);
  const idents = ids.length
    ? await db.select().from(s.speciesIdentifiers).where(and(inArray(s.speciesIdentifiers.speciesId, ids), eq(s.speciesIdentifiers.provider, 'iucn')))
    : [];
  const assessed = revIds.length
    ? await db
        .select({ revisionId: s.assessments.revisionId, category: s.assessments.category, scope: s.assessments.scope, title: s.sources.title, publisher: s.sources.publisher, note: s.sources.permittedUseNote })
        .from(s.assessments)
        .innerJoin(s.sources, eq(s.sources.id, s.assessments.sourceId))
        .where(and(inArray(s.assessments.revisionId, revIds), eq(s.assessments.scope, 'global')))
    : [];
  const prev = new Map(previous.map((r) => [r.slug, r]));
  const rows: SheetRow[] = species.map((sp) => {
    const a = assessed.filter((x) => x.revisionId === sp.revisionId);
    const old = prev.get(sp.slug);
    const row = {
      slug: sp.slug,
      scientific_name: sp.name,
      current_category: a.map((x) => x.category).join(' / ') || 'none',
      current_source: a.map((x) => x.publisher ?? x.title).join(' / '),
      current_edition: a.map((x) => (x.note ?? '').match(EDITION)?.[1] ?? 'not stated').join(' / '),
      iucn_taxon_id: idents.find((x) => x.speciesId === sp.id)?.externalId ?? '',
      iucn_search_url: iucnSearchUrl(sp.name),
    } as SheetRow;
    for (const c of OWNER_COLUMNS) row[c] = old?.[c] ?? '';
    return row;
  });
  const published = new Set(species.map((x) => x.slug));
  const orphans = previous.filter((r) => !published.has(r.slug) && OWNER_COLUMNS.some((c) => r[c]));
  return { rows: [...rows, ...orphans], orphaned: orphans.map((r) => r.slug) };
}

/** Markdown view of the sheet for docs/launch/STATUS_CHECK.md (the CSV is the file to edit). */
export function sheetMarkdownTable(rows: SheetRow[]): string {
  const esc = (v: string) => v.replace(/\|/g, '\\|');
  const head = ['#', 'Species', 'Wikidata-cited category', 'Edition', 'IUCN taxon ID', 'IUCN search', 'Checked category', 'Date assessed', 'Trend', 'Date checked'];
  const lines = [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`];
  rows.forEach((r, i) => {
    lines.push(
      `| ${[
        String(i + 1), `*${esc(r.scientific_name)}* (\`${r.slug}\`)`, esc(r.current_category), esc(r.current_edition), r.iucn_taxon_id || '**missing**',
        `[search](${r.iucn_search_url})`, r.checked_category, r.date_assessed, r.trend, r.date_checked,
      ].join(' | ')} |`,
    );
  });
  return lines.join('\n');
}

// ---------- validating filled rows ----------

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const realDate = (v: string) => DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
/** https://www.iucnredlist.org/species/<taxonId>/<assessmentId>, the address of one assessment page. */
const ASSESSMENT_URL = /^https:\/\/www\.iucnredlist\.org\/species\/(\d{1,12})\/(\d{1,12})\/?$/;

const FilledRow = z
  .object({
    slug: z.string().min(1),
    iucn_taxon_id: z.string().regex(/^\d{1,12}$/, 'iucn_taxon_id must be the numeric IUCN taxon ID'),
    checked_category: z.enum(s.iucnCategory.enumValues, { message: `checked_category must be one of ${s.iucnCategory.enumValues.join(', ')}` }),
    date_assessed: z.string().refine(realDate, 'date_assessed must be a real date written YYYY-MM-DD, as shown on the assessment page'),
    trend: z
      .string()
      .transform((v) => v.toLowerCase())
      .pipe(z.enum(s.populationTrend.enumValues, { message: `trend must be one of ${s.populationTrend.enumValues.join(', ')}` })),
    criteria: z.string().max(200),
    assessment_url: z.string().regex(ASSESSMENT_URL, 'assessment_url must be https://www.iucnredlist.org/species/<taxon id>/<assessment id>'),
    date_checked: z.string().refine(realDate, 'date_checked must be a real date written YYYY-MM-DD'),
  })
  .superRefine((r, ctx) => {
    const m = r.assessment_url.match(ASSESSMENT_URL);
    if (m && m[1] !== r.iucn_taxon_id) ctx.addIssue({ code: 'custom', message: `assessment_url is for taxon ${m[1]}, not ${r.iucn_taxon_id}` });
    const today = new Date().toISOString().slice(0, 10);
    if (r.date_checked > today) ctx.addIssue({ code: 'custom', message: 'date_checked is in the future' });
    if (r.date_assessed > r.date_checked) ctx.addIssue({ code: 'custom', message: 'date_assessed is after date_checked' });
  });

export interface CheckedRow {
  slug: string;
  taxonId: string;
  assessmentId: string;
  category: (typeof s.iucnCategory.enumValues)[number];
  trend: (typeof s.populationTrend.enumValues)[number];
  assessedOn: string;
  criteria: string | null;
  url: string;
  checkedOn: string;
}

/** Splits the sheet into rows to import and rows not checked yet. A half-filled row is an error, never guessed. */
export function validateSheet(rows: SheetRow[]): { checked: CheckedRow[]; unchecked: string[] } {
  const issues: string[] = [];
  const checked: CheckedRow[] = [];
  const unchecked: string[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const where = `row ${i + 2} (${r.slug || 'no slug'})`;
    if (seen.has(r.slug)) issues.push(`${where}: duplicate slug`);
    seen.add(r.slug);
    const filled = REQUIRED_OWNER.filter((c) => r[c] !== '');
    if (!filled.length && !r.criteria) {
      unchecked.push(r.slug);
      return;
    }
    const missing = REQUIRED_OWNER.filter((c) => r[c] === '');
    if (missing.length) {
      issues.push(`${where}: partly filled in; also fill ${missing.join(', ')} (or clear the row)`);
      return;
    }
    const p = FilledRow.safeParse(r);
    if (!p.success) {
      issues.push(...p.error.issues.map((x) => `${where}: ${x.message}`));
      return;
    }
    const v = p.data;
    checked.push({
      slug: v.slug, taxonId: v.iucn_taxon_id, assessmentId: (v.assessment_url.match(ASSESSMENT_URL) as RegExpMatchArray)[2],
      category: v.checked_category, trend: v.trend, assessedOn: v.date_assessed, criteria: v.criteria || null,
      url: v.assessment_url.replace(/\/$/, ''), checkedOn: v.date_checked,
    });
  });
  if (issues.length) throw new StatusCheckError(issues);
  return { checked, unchecked };
}

// ---------- importing ----------

export interface StatusSpeciesReport {
  slug: string;
  action: 'draft_created' | 'draft_updated' | 'unchanged' | 'skipped';
  draftVersion: number | null;
  before: string;
  after: string;
  notes: string[];
}

export interface StatusReport {
  fileName: string;
  mode: 'dry-run' | 'apply';
  startedAt: string;
  sourcesCreated: string[];
  unchecked: string[];
  species: StatusSpeciesReport[];
  changeCount: number;
}

class DryRunRollback extends Error {}

/** Canonical JSON: keys sorted, null/undefined dropped. */
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
const str = (v: unknown) => JSON.stringify(canon(v));
const statusPart = (c: RevisionContentDto) =>
  str({
    a: c.assessments.map((x) => str(x)).sort(),
    e: c.populationEstimates.map((e) => ({ ...e, assessmentIndex: e.assessmentIndex != null ? str(c.assessments[e.assessmentIndex]) : null })),
    c: c.citations.filter((x) => x.sectionKey === 'status').map((x) => str(x)).sort(),
  });
const summarize = (c: RevisionContentDto) =>
  c.assessments.filter((a) => a.scope === 'global').map((a) => `${a.category}${a.assessedOn ? ` (${a.assessedOn})` : ''}, trend ${a.trend}`).join('; ') || 'no global assessment';

export const CHECKED_BY_HAND = 'IUCN Red List, checked by hand';

export function sourceFor(row: CheckedRow, scientificName: string) {
  return {
    title: `The IUCN Red List of Threatened Species: ${scientificName} (assessment ${row.assessmentId})`,
    publisher: 'IUCN',
    authors: null,
    url: row.url,
    doi: null,
    publishedOn: null,
    accessedOn: row.checkedOn,
    license: null,
    permittedUseNote:
      `${CHECKED_BY_HAND} on ${row.checkedOn} by the site owner. Only the category, the assessment date, the population trend` +
      `${row.criteria ? ' and the criteria' : ''} were recorded; no IUCN text, data or images were copied.`,
  };
}

export class StatusCheckImporter {
  constructor(
    private readonly db: Db,
    private readonly editorial: EditorialService,
    private readonly content: RevisionContentRepository,
  ) {}

  async run(staff: StaffPrincipal, csvText: string, opts: { dryRun: boolean; fileName: string }): Promise<StatusReport> {
    const { checked, unchecked } = validateSheet(readSheet(csvText));
    const report: StatusReport = {
      fileName: opts.fileName, mode: opts.dryRun ? 'dry-run' : 'apply', startedAt: new Date().toISOString(),
      sourcesCreated: [], unchecked, species: [], changeCount: 0,
    };
    try {
      await this.db.transaction(async (tx) => {
        for (const row of checked) report.species.push(await this.one(tx, staff, row, report));
        report.changeCount = report.sourcesCreated.length + report.species.filter((x) => x.action === 'draft_created' || x.action === 'draft_updated').length;
        if (!opts.dryRun && report.changeCount > 0) {
          await audit(tx, {
            actorId: staff.id, action: 'status_check.apply', entityType: 'import', entityId: opts.fileName.slice(0, 200),
            summary: `Hand-checked IUCN status from ${opts.fileName}: ${report.changeCount} change(s)`,
          });
        }
        if (opts.dryRun) throw new DryRunRollback();
      });
    } catch (e) {
      if (!(e instanceof DryRunRollback)) throw e;
    }
    return report;
  }

  private async one(tx: Tx, staff: StaffPrincipal, row: CheckedRow, report: StatusReport): Promise<StatusSpeciesReport> {
    const [sp] = await tx.select().from(s.species).where(eq(s.species.slug, row.slug));
    if (!sp) throw new StatusCheckError([`${row.slug}: no species with this slug`]);
    const idents = await tx.select().from(s.speciesIdentifiers).where(and(eq(s.speciesIdentifiers.speciesId, sp.id), eq(s.speciesIdentifiers.provider, 'iucn')));
    if (!idents.some((i) => i.externalId === row.taxonId)) {
      throw new StatusCheckError([`${row.slug}: IUCN taxon ID ${row.taxonId} is not an identifier of this species (has: ${idents.map((i) => i.externalId).join(', ') || 'none'})`]);
    }
    const out: StatusSpeciesReport = { slug: row.slug, action: 'unchanged', draftVersion: null, before: '', after: '', notes: [] };

    const revs = await tx
      .select({ id: s.speciesRevisions.id, version: s.speciesRevisions.version, state: s.speciesRevisions.state })
      .from(s.speciesRevisions)
      .where(eq(s.speciesRevisions.speciesId, sp.id))
      .orderBy(desc(s.speciesRevisions.version));
    if (revs[0]?.state === 'submitted') {
      out.action = 'skipped';
      out.notes.push(`v${revs[0].version} is waiting for review. Run this again after it is published or sent back.`);
      return out;
    }
    const openDraft = revs.find((r) => r.state === 'draft') ?? null;
    const baseId = openDraft?.id ?? sp.publishedRevisionId;
    if (!baseId) throw new StatusCheckError([`${row.slug}: has no published revision or open draft`]);
    const current = await this.content.load(tx, baseId);
    out.before = summarize(current);

    // Source: reuse an identical one, otherwise create it (sources are never edited in place, PLAN §6).
    const fields = sourceFor(row, sp.acceptedScientificName);
    const candidates = await tx.select().from(s.sources).where(eq(s.sources.title, fields.title));
    let sourceId = candidates.find((c) =>
      str({ title: c.title, publisher: c.publisher, authors: c.authors, url: c.url, doi: c.doi, publishedOn: c.publishedOn, accessedOn: c.accessedOn, license: c.license, permittedUseNote: c.permittedUseNote }) === str(fields),
    )?.id;
    let createdSource = false;
    if (!sourceId) {
      const [src] = await tx.insert(s.sources).values(fields).returning({ id: s.sources.id });
      sourceId = src.id;
      createdSource = true;
    }

    const next = this.withCheckedStatus(current, row, sourceId, out);
    out.after = summarize(next);
    if (statusPart(next) === statusPart(current)) {
      if (createdSource) await tx.delete(s.sources).where(eq(s.sources.id, sourceId)); // nothing cites it
      return out;
    }
    if (createdSource) {
      await audit(tx, { actorId: staff.id, action: 'source.create', entityType: 'source', entityId: sourceId, summary: `Created source for hand-checked IUCN status (${row.slug})` });
      report.sourcesCreated.push(`${row.slug}: ${fields.title}`);
    }
    const oldCategories = current.assessments.filter((a) => a.scope === 'global').map((a) => a.category);
    if (oldCategories.length && !oldCategories.includes(row.category)) {
      out.notes.push(`Category changes from ${oldCategories.join('/')} to ${row.category}. Check that the overview text does not state the old category.`);
    }

    let draft = openDraft;
    if (!draft) {
      const d = await this.editorial.createDraft(staff, sp.id, tx);
      draft = { id: d.id, version: d.version, state: 'draft' };
      out.action = 'draft_created';
    } else out.action = 'draft_updated';
    const [{ updatedAt }] = await tx.select({ updatedAt: s.speciesRevisions.updatedAt }).from(s.speciesRevisions).where(eq(s.speciesRevisions.id, draft.id));
    const body = { ...next, expectedUpdatedAt: updatedAt.toISOString() };
    const problems = await validate(plainToInstance(SaveDraftDto, body), { whitelist: true, forbidNonWhitelisted: true });
    if (problems.length) throw new StatusCheckError(problems.map((p) => `${row.slug}.${p.property}: ${Object.values(p.constraints ?? {}).join('; ') || 'invalid'}`));
    const saved = await this.editorial.saveDraft(staff, draft.id, body as SaveDraftDto, tx);
    out.draftVersion = saved.version;
    return out;
  }

  /** The content with its global assessments replaced by the checked one. Everything else is kept. */
  private withCheckedStatus(c: RevisionContentDto, row: CheckedRow, sourceId: string, out: StatusSpeciesReport): RevisionContentDto {
    const removed = c.assessments.map((a, i) => (a.scope === 'global' ? i : -1)).filter((i) => i >= 0);
    const removedSources = new Set(removed.map((i) => c.assessments[i].sourceId));
    const checked = {
      providerAssessmentId: row.assessmentId, sourceId, scope: 'global' as const, regionId: null, category: row.category,
      trend: row.trend, assessedOn: row.assessedOn, publishedOn: null, criteria: row.criteria,
    };
    const kept = c.assessments.map((a, i) => ({ a, i })).filter((x) => x.a.scope !== 'global');
    const assessments = [checked, ...kept.map((x) => x.a)];
    const newIndex = new Map(kept.map((x, j) => [x.i, j + 1]));
    const populationEstimates = c.populationEstimates.map((e) => {
      if (e.assessmentIndex == null) return e;
      if (newIndex.has(e.assessmentIndex)) return { ...e, assessmentIndex: newIndex.get(e.assessmentIndex) };
      out.notes.push('A population estimate was linked to the replaced assessment; it is now unlinked. Link it again by hand if it came from the IUCN assessment.');
      return { ...e, assessmentIndex: null };
    });
    const citations = [
      ...c.citations.filter((x) => !(x.sectionKey === 'status' && (removedSources.has(x.sourceId) || x.sourceId === sourceId))),
      { sectionKey: 'status' as const, sourceId, locator: `assessment ${row.assessmentId}`, note: CHECKED_BY_HAND },
    ];
    const stillCited = c.citations.filter((x) => x.sectionKey !== 'status' && removedSources.has(x.sourceId)).map((x) => x.sectionKey);
    if (stillCited.length) out.notes.push(`The old status source is still cited in: ${[...new Set(stillCited)].join(', ')}. Review those citations by hand.`);
    return { ...c, assessments, populationEstimates, citations };
  }
}

export function statusReportMarkdown(r: StatusReport): string {
  const lines = [
    `# Status check import: ${r.fileName}`,
    '',
    `- Mode: **${r.mode}**`,
    `- Started: ${r.startedAt}`,
    `- Changes: **${r.changeCount}**${r.mode === 'dry-run' ? ' (nothing was written)' : ''}`,
    '- Drafts only: nothing was submitted or published. Review each draft in /admin before publishing it.',
    `- Not checked yet (left as they are): ${r.unchecked.length ? r.unchecked.join(', ') : 'none'}`,
    '',
    '## Sources created',
    ...(r.sourcesCreated.length ? r.sourcesCreated.map((x) => `- ${x}`) : ['- none']),
    '',
    '## Species',
  ];
  if (!r.species.length) lines.push('', '- No row was filled in.');
  for (const sp of r.species) {
    lines.push('', `### ${sp.slug}: ${sp.action.replace(/_/g, ' ')}${sp.draftVersion ? ` (draft v${sp.draftVersion})` : ''}`);
    if (sp.before) lines.push(`- Before: ${sp.before}`, `- After: ${sp.after}`);
    for (const n of sp.notes) lines.push(`- Note: ${n}`);
  }
  return `${lines.join('\n')}\n`;
}
