import type { INestApplicationContext } from '@nestjs/common';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { comparePopulations } from '../catalogue/compare';
import type { SpeciesProfileDto } from '../catalogue/dto';
import { PublishedSpeciesRepository } from '../catalogue/published-species.repository';
import { DB, Db } from '../db/db.module';
import * as s from '../db/schema';
import { EditorialService } from '../editorial/editorial.service';
import { isAllowedImageLicence } from '../editorial/licences';
import { STORAGE, StorageAdapter, variantKey } from '../media/storage';

/**
 * Catalogue quality report (PLAN §11 "Quality reports"). Every check reads what the public sees:
 * - 100% of published numeric claims cited
 * - 100% of published images licensed and approved, with their files present
 * - zero drafts reachable publicly
 * - zero mixed units in compare
 * plus the publication checklist re-run against every live revision.
 */

export interface CheckResult {
  key: string;
  title: string;
  checked: number;
  failures: string[];
}

const NUMERIC = new Set(['exact', 'range', 'at_least', 'at_most']);

export async function validateCatalogue(app: INestApplicationContext): Promise<CheckResult[]> {
  const db = app.get<Db>(DB);
  const repo = app.get(PublishedSpeciesRepository);
  const editorial = app.get(EditorialService);
  const storage = app.get<StorageAdapter>(STORAGE);

  const live = await db
    .select({ id: s.species.id, slug: s.species.slug, revisionId: s.species.publishedRevisionId, version: s.speciesRevisions.version, state: s.speciesRevisions.state })
    .from(s.species)
    .innerJoin(s.speciesRevisions, eq(s.speciesRevisions.id, s.species.publishedRevisionId))
    .where(and(isNotNull(s.species.publishedRevisionId), isNull(s.species.archivedAt)))
    .orderBy(s.species.slug);

  const results: CheckResult[] = [];
  const add = (key: string, title: string) => {
    const r: CheckResult = { key, title, checked: 0, failures: [] };
    results.push(r);
    return r;
  };

  // Zero drafts reachable: the pointer only ever names a published revision, and every public read returns that revision.
  const drafts = add('drafts', 'Zero drafts reachable publicly');
  for (const sp of live) {
    drafts.checked++;
    if (sp.state !== 'published') drafts.failures.push(`${sp.slug}: live pointer names a ${sp.state} revision`);
  }
  const profiles = new Map<string, SpeciesProfileDto>();
  for (const sp of live) {
    const p = await repo.findProfileBySlug(sp.slug);
    if (!p) drafts.failures.push(`${sp.slug}: published but the profile is not served`);
    else {
      profiles.set(sp.slug, p);
      if (p.review.version !== sp.version) drafts.failures.push(`${sp.slug}: profile shows v${p.review.version}, live is v${sp.version}`);
    }
  }
  const listedSlugs = new Set<string>();
  for (let page = 1; ; page++) {
    const res = await repo.list({ pageSize: 48, page });
    res.items.forEach((c) => listedSlugs.add(c.slug));
    if (page >= res.totalPages) break;
  }
  const liveSlugs = new Set(live.map((x) => x.slug));
  for (const x of listedSlugs) if (!liveSlugs.has(x)) drafts.failures.push(`${x}: listed in the catalogue but has no live published revision`);
  for (const x of liveSlugs) if (!listedSlugs.has(x)) drafts.failures.push(`${x}: published but missing from the catalogue list`);
  const [{ unpublished }] = (
    await db.execute<{ unpublished: number }>(sql`
      SELECT count(*)::int AS unpublished FROM species sp
      WHERE sp.published_revision_id IS NULL AND sp.slug = ANY(${sql.param([...listedSlugs])})`)
  ).rows;
  if (unpublished > 0) drafts.failures.push(`${unpublished} never-published species appear in the catalogue list`);

  // The publication checklist, re-run against what is live now (e.g. an image edited after publication is pending again).
  const checklist = add('checklist', 'Every live revision still passes the publication checklist');
  for (const sp of live) {
    checklist.checked++;
    const rev = await editorial.getRevision(sp.revisionId as string);
    for (const item of rev.checklist.filter((c) => !c.ok)) checklist.failures.push(`${sp.slug} v${sp.version}: ${item.message}`);
  }

  // Numeric claims: each estimate and assessment names a source, and that source is listed on the page.
  const cited = add('numeric-citations', '100% of published numeric claims cited');
  for (const [slug, p] of profiles) {
    const sourceIds = new Set(p.sources.map((x) => x.id));
    for (const e of p.population.estimates) {
      if (!NUMERIC.has(e.form) && e.form !== 'qualitative') continue;
      cited.checked++;
      if (!sourceIds.has(e.sourceId)) cited.failures.push(`${slug}: a population estimate cites a source that is not listed on the page`);
    }
    for (const a of p.status.assessments) {
      cited.checked++;
      if (!sourceIds.has(a.sourceId)) cited.failures.push(`${slug}: an assessment cites a source that is not listed on the page`);
    }
    for (const m of p.biology.measurements) {
      cited.checked++;
      if (!p.citations.some((c) => c.sectionKey === 'biology')) cited.failures.push(`${slug}: measurement "${m.label}" has no biology citation`);
    }
    for (const r of p.geography.climate.ranges) {
      cited.checked++;
      if (!p.citations.some((c) => c.sectionKey === 'climate')) cited.failures.push(`${slug}: climate range "${r.label}" has no climate citation`);
    }
  }

  // Images: what the page shows has a credit, an allow-listed licence, an approved asset and its files on disk.
  const images = add('images', '100% of published images licensed and approved');
  for (const [slug, p] of profiles) {
    for (const m of p.media) {
      images.checked++;
      if (!m.credit.trim()) images.failures.push(`${slug}: an image has no credit`);
      if (!isAllowedImageLicence(m.license)) images.failures.push(`${slug}: an image shows licence "${m.license}", which is not on the allow-list`);
      const [a] = await db.select().from(s.mediaAssets).where(eq(s.mediaAssets.storageKey, m.storageKey));
      if (!a) {
        images.failures.push(`${slug}: an image has no media record`);
        continue;
      }
      if (a.reviewState !== 'approved') images.failures.push(`${slug}: image ${a.id} is ${a.reviewState}, not approved`);
      if (!a.variants.length) images.failures.push(`${slug}: image ${a.id} has no stored variants`);
      for (const w of a.variants) {
        if (!(await storage.exists(variantKey(a.storageKey, w)))) images.failures.push(`${slug}: image ${a.id} is missing its ${w}px file`);
      }
    }
  }

  // Compare: "same basis" only when every species really has a wild, global, numeric estimate in that unit.
  const units = add('compare-units', 'Zero mixed units in compare');
  const all = [...profiles.values()];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      units.checked++;
      const pair = [all[i], all[j]];
      const c = comparePopulations(pair);
      if (c.status !== 'same_basis') continue;
      for (const p of pair) {
        const ok = p.population.estimates.some((e) => e.context === 'wild' && e.scope === 'global' && NUMERIC.has(e.form) && e.basis === c.basis);
        if (!ok) units.failures.push(`${pair[0].slug} vs ${pair[1].slug}: compared as "${c.basis}" but ${p.slug} has no such estimate`);
      }
    }
  }

  // Synthetic fixtures never reach production (PLAN §7).
  if (process.env.NODE_ENV === 'production') {
    const fx = add('no-fixtures', 'No synthetic fixtures in production');
    const rows = await db.select({ slug: s.species.slug }).from(s.speciesIdentifiers).innerJoin(s.species, eq(s.species.id, s.speciesIdentifiers.speciesId)).where(eq(s.speciesIdentifiers.provider, 'fixture'));
    fx.checked = live.length;
    for (const r of rows) fx.failures.push(`${r.slug} is a synthetic fixture`);
  }
  return results;
}

export function validationMarkdown(results: CheckResult[], speciesCount: number): string {
  const ok = results.every((r) => !r.failures.length);
  const lines = [
    `# Catalogue validation: ${ok ? 'PASS' : 'FAIL'}`,
    '',
    `Published species checked: ${speciesCount}. Run at ${new Date().toISOString()}.`,
    '',
    '| Check | Items | Result |',
    '|---|---|---|',
    ...results.map((r) => `| ${r.title} | ${r.checked} | ${r.failures.length ? `**${r.failures.length} failure(s)**` : 'pass'} |`),
  ];
  for (const r of results.filter((x) => x.failures.length)) lines.push('', `## ${r.title}`, ...r.failures.map((f) => `- ${f}`));
  return `${lines.join('\n')}\n`;
}
