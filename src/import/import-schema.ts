import { z } from 'zod';
import * as s from '../db/schema';
import { SECTION_KEYS } from '../editorial/dto';

/**
 * The import file format (PLAN §8 "R1 import CLI", DECISIONS D-023). JSON only in R1.
 *
 * References inside a file are by local `key` (sources, media) or by stable code (region slug, habitat and
 * threat codes), never by database id, so the same file works on any database. Range maps and support links
 * are not imported: ranges wait for a licensed source, and support links go through the admin review.
 */

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const KEY = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Keys are lowercase words joined by hyphens').max(80);
const SLUG = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(120);
const COUNT = z.string().regex(/^\d{1,18}$/, 'Counts are whole numbers written as strings');
const https = z.string().url().max(1000).refine((u) => u.startsWith('https://'), 'Must be an https URL');
const text = (max: number) => z.string().trim().min(1).max(max);
const opt = <T extends z.ZodTypeAny>(t: T) => t.nullish().transform((v) => v ?? null);
const enumOf = <T extends { enumValues: [string, ...string[]] }>(e: T) => z.enum(e.enumValues as T['enumValues']);

export const ImportSource = z
  .object({
    key: KEY,
    title: text(500),
    publisher: opt(text(200)),
    authors: opt(text(500)),
    url: opt(z.string().url().max(1000)),
    doi: opt(z.string().regex(/^10\.\d{4,9}\/\S+$/)),
    publishedOn: opt(DATE),
    accessedOn: opt(DATE),
    license: opt(text(100)),
    permittedUseNote: opt(text(1000)),
  })
  .strict();

export const ImportMedia = z
  .object({
    key: KEY,
    /** Download location (https). Fetched through the SSRF-safe fetcher. */
    url: https.optional(),
    /** Or a file next to the import file (tests and local files). */
    path: z.string().regex(/^[A-Za-z0-9._/-]+$/).refine((p) => !p.split('/').includes('..') && !p.startsWith('/'), 'Relative path inside the import folder').optional(),
    creator: text(200),
    credit: text(300),
    license: text(40),
    licenseUrl: opt(https),
    sourceUrl: opt(https),
    modifications: opt(text(500)),
  })
  .strict()
  .refine((m) => (m.url ? 1 : 0) + (m.path ? 1 : 0) === 1, 'Give exactly one of url or path');

const Name = z.object({ language: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/), name: text(200), nameType: enumOf(s.nameType), preferred: z.boolean() }).strict();

const Assessment = z
  .object({
    providerAssessmentId: opt(text(100)),
    sourceKey: KEY,
    scope: enumOf(s.assessmentScope),
    region: opt(SLUG),
    category: enumOf(s.iucnCategory),
    trend: enumOf(s.populationTrend),
    assessedOn: opt(DATE),
    publishedOn: opt(DATE),
    criteria: opt(text(200)),
  })
  .strict();

const Estimate = z
  .object({
    assessmentIndex: opt(z.number().int().min(0)),
    sourceKey: KEY,
    scope: enumOf(s.assessmentScope),
    region: opt(SLUG),
    context: enumOf(s.populationContext),
    basis: enumOf(s.populationBasis),
    form: enumOf(s.estimateForm),
    pointValue: opt(COUNT),
    minValue: opt(COUNT),
    maxValue: opt(COUNT),
    qualitativeText: opt(text(500)),
    referenceStart: opt(DATE),
    referenceEnd: opt(DATE),
    method: opt(text(500)),
    uncertaintyNote: opt(text(500)),
  })
  .strict();

const RegionRow = z
  .object({ region: SLUG, presence: enumOf(s.presence), origin: enumOf(s.origin), seasonality: enumOf(s.seasonality), sourceKey: KEY })
  .strict();
const HabitatRow = z
  .object({ code: text(40), suitability: opt(text(100)), seasonality: opt(enumOf(s.seasonality)), sourceKey: KEY })
  .strict();
const ThreatRow = z.object({ code: text(40), severity: opt(text(100)), timing: opt(text(100)), sourceKey: KEY }).strict();
const Citation = z.object({ sectionKey: z.enum(SECTION_KEYS), sourceKey: KEY, locator: opt(text(200)), note: opt(text(500)) }).strict();
const MediaRef = z
  .object({ mediaKey: KEY, position: z.number().int().min(0), role: z.enum(['primary', 'gallery']), altText: text(300), caption: opt(text(500)) })
  .strict();

export const ImportSpecies = z
  .object({
    slug: SLUG,
    scientificName: text(200),
    rank: enumOf(s.taxonRank),
    locationSensitivity: enumOf(s.locationSensitivity).default('none'),
    identifiers: z
      .array(z.object({ provider: z.string().regex(/^[a-z][a-z0-9_-]{1,30}$/), externalId: text(100), sourceUrl: opt(https) }).strict())
      .min(1, 'At least one provider identifier (PLAN §7)')
      .max(10),
    content: z
      .object({
        displayGroup: enumOf(s.displayGroup),
        /** Validated again by the versioned editorial schema when the draft is saved. */
        editorial: z.record(z.string(), z.unknown()),
        names: z.array(Name).max(100).default([]),
        environments: z.array(enumOf(s.environment)).max(6).default([]),
        assessments: z.array(Assessment).max(50).default([]),
        populationEstimates: z.array(Estimate).max(100).default([]),
        regions: z.array(RegionRow).max(500).default([]),
        habitats: z.array(HabitatRow).max(100).default([]),
        threats: z.array(ThreatRow).max(100).default([]),
        citations: z.array(Citation).max(200).default([]),
        media: z.array(MediaRef).max(50).default([]),
      })
      .strict(),
  })
  .strict();

export const ImportFile = z
  .object({
    format: z.literal('wildward-import'),
    version: z.literal(1),
    /** Free text for people reading the file: who prepared it, when, and how facts were checked. */
    notes: z.string().max(4000).optional(),
    sources: z.array(ImportSource).max(1000).default([]),
    media: z.array(ImportMedia).max(500).default([]),
    species: z.array(ImportSpecies).min(1).max(500),
  })
  .strict()
  .superRefine((f, ctx) => {
    const dup = (items: Array<{ key?: string; slug?: string }>, field: 'key' | 'slug', path: string) => {
      const seen = new Set<string>();
      items.forEach((it, i) => {
        const v = it[field] as string;
        if (seen.has(v)) ctx.addIssue({ code: 'custom', path: [path, i, field], message: `Duplicate ${field} "${v}"` });
        seen.add(v);
      });
    };
    dup(f.sources, 'key', 'sources');
    dup(f.media, 'key', 'media');
    dup(f.species, 'slug', 'species');
    const sourceKeys = new Set(f.sources.map((x) => x.key));
    const mediaKeys = new Set(f.media.map((x) => x.key));
    f.species.forEach((sp, i) => {
      const c = sp.content;
      const refs = [...c.assessments, ...c.populationEstimates, ...c.regions, ...c.habitats, ...c.threats, ...c.citations].map((r) => r.sourceKey);
      for (const k of refs) if (!sourceKeys.has(k)) ctx.addIssue({ code: 'custom', path: ['species', i], message: `Unknown sourceKey "${k}"` });
      for (const m of c.media) if (!mediaKeys.has(m.mediaKey)) ctx.addIssue({ code: 'custom', path: ['species', i], message: `Unknown mediaKey "${m.mediaKey}"` });
      c.populationEstimates.forEach((e, j) => {
        if (e.assessmentIndex != null && e.assessmentIndex >= c.assessments.length) {
          ctx.addIssue({ code: 'custom', path: ['species', i, 'content', 'populationEstimates', j], message: 'assessmentIndex is out of range' });
        }
      });
    });
  });

export type ImportFileT = z.infer<typeof ImportFile>;
export type ImportSpeciesT = z.infer<typeof ImportSpecies>;
