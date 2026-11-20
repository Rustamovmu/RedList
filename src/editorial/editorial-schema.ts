import { z } from 'zod';

/**
 * Editorial JSONB on species_revisions (PLAN §6 "Editorial JSONB").
 * Versioned: every revision stores its schema_version. When the shape changes, add EditorialV2,
 * register a migration from 1 → 2 in MIGRATIONS, and cover it with a test. Old revisions are never rewritten.
 */
export const CURRENT_EDITORIAL_VERSION = 1;

const text = (max: number) => z.string().trim().min(1).max(max);
const num = z.number().finite();

/** A typical-conditions range (PLAN §5.4): needs a unit and a region or season context. */
const ClimateRange = z
  .object({
    label: text(80),
    min: num.optional(),
    max: num.optional(),
    unit: text(20),
    context: text(200),
  })
  .strict()
  .refine((r) => r.min !== undefined || r.max !== undefined, 'A climate range needs a min or a max')
  .refine((r) => r.min === undefined || r.max === undefined || r.min <= r.max, 'min must be ≤ max');

const Measurement = z
  .object({
    label: text(80),
    value: num.optional(),
    min: num.optional(),
    max: num.optional(),
    unit: text(20),
    context: text(200).optional(),
  })
  .strict()
  .refine((m) => m.value !== undefined || m.min !== undefined || m.max !== undefined, 'A measurement needs a value, min or max')
  .refine((m) => m.min === undefined || m.max === undefined || m.min <= m.max, 'min must be ≤ max');

export const EditorialV1 = z
  .object({
    overview: text(4000).optional(),
    taxonomy: z
      .object({
        kingdom: text(80).optional(),
        phylum: text(80).optional(),
        class: text(80).optional(),
        order: text(80).optional(),
        family: text(80).optional(),
        genus: text(80).optional(),
      })
      .strict()
      .optional(),
    /** Explicit "Not assessed" when there is no assessment row (publication checklist). */
    status: z.object({ notAssessed: z.boolean() }).strict().optional(),
    /** Explicit "Unknown" population when there is no estimate row. Unknown is never zero. */
    population: z.object({ unknown: z.boolean(), note: text(500).optional() }).strict().optional(),
    diet: z
      .object({
        narrative: text(4000).optional(),
        tags: z.array(text(40)).max(20).optional(),
        /** Life-stage or seasonal context. */
        context: text(1000).optional(),
      })
      .strict()
      .optional(),
    climate: z
      .object({
        narrative: text(2000).optional(),
        ranges: z.array(ClimateRange).max(10).optional(),
      })
      .strict()
      .optional(),
    measurements: z.array(Measurement).max(20).optional(),
    biology: text(4000).optional(),
    conservationActions: text(4000).optional(),
  })
  .strict();

export type Editorial = z.infer<typeof EditorialV1>;

/** Migrations from version N to N+1. Empty while only version 1 exists. */
const MIGRATIONS: Record<number, (data: unknown) => unknown> = {};

export class EditorialSchemaError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Editorial content is invalid: ${issues.slice(0, 3).join('; ')}`);
  }
}

/** Validates editorial JSON of a given schema version, migrating it forward to the current version. */
export function parseEditorial(schemaVersion: number, raw: unknown): Editorial {
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1 || schemaVersion > CURRENT_EDITORIAL_VERSION) {
    throw new EditorialSchemaError([`Unsupported editorial schema version ${schemaVersion}`]);
  }
  let data = raw;
  for (let v = schemaVersion; v < CURRENT_EDITORIAL_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new EditorialSchemaError([`No migration from editorial schema version ${v}`]);
    data = step(data);
  }
  const parsed = EditorialV1.safeParse(data);
  if (!parsed.success) {
    throw new EditorialSchemaError(parsed.error.issues.map((i) => `editorial.${i.path.join('.') || '(root)'}: ${i.message}`));
  }
  return parsed.data;
}

/** OpenAPI 3.0 schema for the current version, so the generated frontend types match the validator. */
export function editorialOpenApiSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(EditorialV1, { target: 'openapi-3.0', io: 'input' }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}
