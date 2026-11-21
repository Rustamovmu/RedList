/**
 * Import species content from a JSON file into DRAFTS (PLAN §8, DECISIONS D-023).
 *
 *   npm run import -- <file.json> --dry-run        validate and report, write nothing
 *   npm run import -- <file.json> --apply          create or update drafts in one transaction
 *   npm run import -- <file.json> --apply --reconcile   also overwrite sections a person edited (listed in the report)
 *
 * A Markdown change report is written to import-reports/. Nothing is ever submitted or published:
 * staff review the drafts (and approve any new images) in /admin.
 */
import { loadDotEnv } from '../common/load-env';
loadDotEnv();
import { NestFactory } from '@nestjs/core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { AppModule } from '../app.module';
import { safeFetch } from '../common/safe-fetch';
import { loadConfig } from '../config';
import { DB, Db } from '../db/db.module';
import { EditorialService } from '../editorial/editorial.service';
import { RevisionContentRepository } from '../editorial/revision-content.repository';
import { FetchBytes, Importer, importStaff, ImportValidationError, reportMarkdown } from '../import/importer';
import { MediaService } from '../media/media.service';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastDownload = 0;

/**
 * Downloads one image through the SSRF-safe fetcher. Polite to image hosts: one request at a time, at least
 * 1.5 s apart, and a 429/503 is retried twice after the server's Retry-After (capped at 3 minutes).
 */
export const downloadImage: FetchBytes = async (url) => {
  for (let attempt = 0; ; attempt++) {
    const wait = lastDownload + 1500 - Date.now();
    if (wait > 0) await sleep(wait);
    lastDownload = Date.now();
    const res = await safeFetch(url, { maxBytes: loadConfig().MEDIA_MAX_BYTES, accept: 'image/jpeg, image/png, image/webp', timeoutMs: 60_000 });
    if (res.status === 200) return res.body;
    if ((res.status === 429 || res.status === 503) && attempt < 2) {
      const retryAfter = Number(res.headers['retry-after']);
      await sleep(Math.min(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 5000, 180_000));
      continue;
    }
    throw new Error(`HTTP ${res.status}`);
  }
};

export function localReader(baseDir: string) {
  const root = resolve(baseDir);
  return async (rel: string) => {
    const p = resolve(root, rel);
    if (!p.startsWith(`${root}/`)) throw new Error('Path leaves the import folder');
    return readFile(p);
  };
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const apply = args.includes('--apply');
  const reconcile = args.includes('--reconcile');
  const unknown = args.filter((a) => a.startsWith('--') && !['--dry-run', '--apply', '--reconcile'].includes(a));
  if (!file || dryRun === apply || unknown.length) {
    console.error('Usage: npm run import -- <file.json> (--dry-run | --apply) [--reconcile]');
    process.exit(2);
  }
  const raw = JSON.parse(await readFile(file, 'utf8')) as unknown;

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const db = app.get<Db>(DB);
    const importer = new Importer(db, app.get(EditorialService), app.get(RevisionContentRepository), app.get(MediaService), downloadImage, localReader(dirname(file)));
    const report = await importer.run(await importStaff(db), raw, { dryRun, reconcile, fileName: basename(file) });
    const md = reportMarkdown(report);
    await mkdir('import-reports', { recursive: true });
    const out = join('import-reports', `${report.startedAt.replace(/[:.]/g, '-')}-${basename(file, '.json')}-${report.mode}.md`);
    await writeFile(out, md);
    const skipped = report.species.flatMap((x) => x.sections.filter((y) => y.outcome === 'skipped_manual_edit').map((y) => `${x.slug}/${y.key}`));
    console.log(`${report.mode}: ${report.changeCount} change(s); ${report.species.length} species; report: ${out}`);
    if (skipped.length) console.log(`Skipped because edited by hand (use --reconcile): ${skipped.join(', ')}`);
    for (const n of report.notes) console.log(`Note: ${n}`);
  } catch (e) {
    if (e instanceof ImportValidationError) {
      console.error(e.message);
      process.exitCode = 1;
    } else throw e;
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
