/**
 * R1 database schema (Drizzle ORM). See docs/DATABASE.md for the ER diagram and reasoning.
 *
 * - Every piece of public species content hangs off a species_revisions row.
 *   Public reads go through species.published_revision_id only.
 * - Geometry columns are PostGIS geometry(MultiPolygon,4326). They are read and written only
 *   through src/geography/geo.repository.ts with parameterized SQL.
 * - CHECK constraints and integrity triggers live in drizzle/0002_integrity.sql.
 */
import { sql } from 'drizzle-orm';
import {
  AnyPgColumn,
  bigint,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** PostGIS MultiPolygon in WGS84. Never selected raw; use ST_AsGeoJSON in GeoRepository. */
export const multiPolygon = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geometry(MultiPolygon,4326)';
  },
});

const id = () => uuid('id').primaryKey().defaultRandom();
const tsz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

// ---------- enums ----------
export const displayGroup = pgEnum('display_group', [
  'mammal', 'bird', 'reptile', 'amphibian', 'fish', 'insect', 'arachnid', 'mollusc', 'crustacean', 'coral', 'other_invertebrate',
]);
export const environment = pgEnum('environment', ['terrestrial', 'freshwater', 'marine', 'brackish', 'subterranean', 'aerial']);
export const taxonRank = pgEnum('taxon_rank', ['species', 'subspecies']);
export const locationSensitivity = pgEnum('location_sensitivity', ['none', 'generalize_country', 'hide_regions']);
export const revisionState = pgEnum('revision_state', ['draft', 'submitted', 'changes_requested', 'published', 'withdrawn']);
export const iucnCategory = pgEnum('iucn_category', ['EX', 'EW', 'CR', 'EN', 'VU', 'NT', 'LC', 'DD', 'NE']);
export const assessmentScope = pgEnum('assessment_scope', ['global', 'regional']);
export const populationTrend = pgEnum('population_trend', ['increasing', 'decreasing', 'stable', 'unknown']);
export const populationContext = pgEnum('population_context', ['wild', 'captive']);
export const populationBasis = pgEnum('population_basis', ['mature_individuals', 'breeding_pairs', 'individuals', 'other']);
export const estimateForm = pgEnum('estimate_form', ['exact', 'range', 'at_least', 'at_most', 'qualitative', 'unknown']);
export const presence = pgEnum('presence', ['extant', 'probably_extant', 'possibly_extant', 'possibly_extinct', 'extinct', 'presence_uncertain']);
export const origin = pgEnum('origin', ['native', 'reintroduced', 'introduced', 'vagrant', 'origin_uncertain']);
export const seasonality = pgEnum('seasonality', ['resident', 'breeding', 'non_breeding', 'passage', 'seasonal_uncertain']);
export const regionType = pgEnum('region_type', ['country', 'ocean', 'sea', 'other']);
export const nameType = pgEnum('name_type', ['common', 'synonym']);
export const mediaReviewState = pgEnum('media_review_state', ['pending', 'approved', 'rejected']);
export const editorialStatus = pgEnum('editorial_status', ['pending', 'approved', 'disabled']);
export const supportActionType = pgEnum('support_action_type', ['donate', 'volunteer', 'adopt', 'learn', 'advocate', 'other']);
export const staffRole = pgEnum('staff_role', ['editor', 'admin']);
export const tokenPurpose = pgEnum('token_purpose', ['invite', 'reset']);

// ---------- staff ----------
export const staffUsers = pgTable('staff_users', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash'),
  role: staffRole('role').notNull().default('editor'),
  disabledAt: tsz('disabled_at'),
  createdAt: tsz('created_at').notNull().defaultNow(),
});

export const staffSessions = pgTable(
  'staff_sessions',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => staffUsers.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    csrfToken: text('csrf_token').notNull(),
    createdAt: tsz('created_at').notNull().defaultNow(),
    lastSeenAt: tsz('last_seen_at').notNull().defaultNow(),
    expiresAt: tsz('expires_at').notNull(),
    revokedAt: tsz('revoked_at'),
    userAgent: text('user_agent'),
  },
  (t) => [index('staff_sessions_user_idx').on(t.userId)],
);

export const staffTokens = pgTable('staff_tokens', {
  id: id(),
  userId: uuid('user_id').notNull().references(() => staffUsers.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  purpose: tokenPurpose('purpose').notNull(),
  expiresAt: tsz('expires_at').notNull(),
  consumedAt: tsz('consumed_at'),
  createdAt: tsz('created_at').notNull().defaultNow(),
});

export const auditEvents = pgTable(
  'audit_events',
  {
    id: id(),
    actorId: uuid('actor_id').references(() => staffUsers.id, { onDelete: 'restrict' }),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    summary: text('summary').notNull(),
    createdAt: tsz('created_at').notNull().defaultNow(),
  },
  (t) => [index('audit_entity_idx').on(t.entityType, t.entityId)],
);

// ---------- reference ----------
export const sources = pgTable('sources', {
  id: id(),
  title: text('title').notNull(),
  publisher: text('publisher'),
  authors: text('authors'),
  url: text('url'),
  doi: text('doi'),
  publishedOn: date('published_on'),
  accessedOn: date('accessed_on'),
  license: text('license'),
  permittedUseNote: text('permitted_use_note'),
  createdAt: tsz('created_at').notNull().defaultNow(),
});

export const regions = pgTable(
  'regions',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    type: regionType('type').notNull(),
    isoA2: text('iso_a2').unique(),
    parentId: uuid('parent_id').references((): AnyPgColumn => regions.id, { onDelete: 'restrict' }),
    geom: multiPolygon('geom'),
    sourceId: uuid('source_id').references(() => sources.id, { onDelete: 'restrict' }),
  },
  (t) => [index('regions_geom_gist').using('gist', t.geom), index('regions_type_idx').on(t.type)],
);

export const habitats = pgTable('habitats', {
  id: id(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  parentId: uuid('parent_id').references((): AnyPgColumn => habitats.id, { onDelete: 'restrict' }),
});

export const threats = pgTable('threats', {
  id: id(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  parentId: uuid('parent_id').references((): AnyPgColumn => threats.id, { onDelete: 'restrict' }),
});

export const mediaAssets = pgTable('media_assets', {
  id: id(),
  storageKey: text('storage_key').notNull().unique(),
  mime: text('mime').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  bytes: integer('bytes').notNull(),
  creator: text('creator').notNull(),
  credit: text('credit').notNull(),
  license: text('license').notNull(),
  sourceUrl: text('source_url'),
  reviewState: mediaReviewState('review_state').notNull().default('pending'),
  createdAt: tsz('created_at').notNull().defaultNow(),
});

export const organizations = pgTable('organizations', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  website: text('website').notNull(),
  description: text('description').notNull(),
  reviewStatus: editorialStatus('review_status').notNull().default('pending'),
  reviewedAt: tsz('reviewed_at'),
  reviewerId: uuid('reviewer_id').references(() => staffUsers.id, { onDelete: 'restrict' }),
});

export const supportLinks = pgTable('support_links', {
  id: id(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'restrict' }),
  url: text('url').notNull(),
  actionType: supportActionType('action_type').notNull(),
  description: text('description').notNull(),
  lastCheckedAt: tsz('last_checked_at'),
  lastStatus: integer('last_status'),
  editorialStatus: editorialStatus('editorial_status').notNull().default('pending'),
});

// ---------- species identity ----------
export const species = pgTable('species', {
  id: id(),
  slug: text('slug').notNull().unique(),
  acceptedScientificName: text('accepted_scientific_name').notNull(),
  rank: taxonRank('rank').notNull().default('species'),
  parentSpeciesId: uuid('parent_species_id').references((): AnyPgColumn => species.id, { onDelete: 'restrict' }),
  locationSensitivity: locationSensitivity('location_sensitivity').notNull().default('none'),
  // FK to species_revisions + "belongs to this species and is published" enforced by trigger (0002_integrity.sql)
  publishedRevisionId: uuid('published_revision_id').unique(),
  archivedAt: tsz('archived_at'),
  createdAt: tsz('created_at').notNull().defaultNow(),
});

export const speciesIdentifiers = pgTable(
  'species_identifiers',
  {
    id: id(),
    speciesId: uuid('species_id').notNull().references(() => species.id, { onDelete: 'restrict' }),
    provider: text('provider').notNull(),
    externalId: text('external_id').notNull(),
    sourceUrl: text('source_url'),
  },
  (t) => [uniqueIndex('species_identifiers_provider_ext_uq').on(t.provider, t.externalId), index('species_identifiers_species_idx').on(t.speciesId)],
);

// ---------- revisioned content ----------
export const speciesRevisions = pgTable(
  'species_revisions',
  {
    id: id(),
    speciesId: uuid('species_id').notNull().references(() => species.id, { onDelete: 'restrict' }),
    version: integer('version').notNull(),
    state: revisionState('state').notNull().default('draft'),
    schemaVersion: integer('schema_version').notNull().default(1),
    displayGroup: displayGroup('display_group').notNull(),
    editorial: jsonb('editorial').notNull().default(sql`'{}'::jsonb`),
    baseRevisionId: uuid('base_revision_id').references((): AnyPgColumn => speciesRevisions.id, { onDelete: 'restrict' }),
    authorId: uuid('author_id').notNull().references(() => staffUsers.id, { onDelete: 'restrict' }),
    reviewerId: uuid('reviewer_id').references(() => staffUsers.id, { onDelete: 'restrict' }),
    selfReviewed: boolean('self_reviewed').notNull().default(false),
    reviewNotes: text('review_notes'),
    createdAt: tsz('created_at').notNull().defaultNow(),
    updatedAt: tsz('updated_at').notNull().defaultNow(),
    submittedAt: tsz('submitted_at'),
    reviewedAt: tsz('reviewed_at'),
    publishedAt: tsz('published_at'),
  },
  (t) => [uniqueIndex('species_revisions_species_version_uq').on(t.speciesId, t.version), index('species_revisions_species_state_idx').on(t.speciesId, t.state)],
);

const revisionRef = () => uuid('revision_id').notNull().references(() => speciesRevisions.id, { onDelete: 'cascade' });
const sourceRef = () => uuid('source_id').notNull().references(() => sources.id, { onDelete: 'restrict' });

export const speciesNames = pgTable(
  'species_names',
  {
    id: id(),
    revisionId: revisionRef(),
    language: text('language').notNull().default('en'),
    name: text('name').notNull(),
    nameType: nameType('name_type').notNull().default('common'),
    preferred: boolean('preferred').notNull().default(false),
  },
  (t) => [uniqueIndex('species_names_uq').on(t.revisionId, t.language, t.name, t.nameType), index('species_names_revision_idx').on(t.revisionId)],
);

export const speciesEnvironments = pgTable(
  'species_environments',
  { revisionId: revisionRef(), environment: environment('environment').notNull() },
  (t) => [primaryKey({ columns: [t.revisionId, t.environment] }), index('species_environments_env_idx').on(t.environment)],
);

export const assessments = pgTable(
  'assessments',
  {
    id: id(),
    revisionId: revisionRef(),
    providerAssessmentId: text('provider_assessment_id'),
    sourceId: sourceRef(),
    scope: assessmentScope('scope').notNull().default('global'),
    regionId: uuid('region_id').references(() => regions.id, { onDelete: 'restrict' }),
    category: iucnCategory('category').notNull(),
    trend: populationTrend('trend').notNull().default('unknown'),
    assessedOn: date('assessed_on'),
    publishedOn: date('published_on'),
    criteria: text('criteria'),
  },
  (t) => [index('assessments_revision_idx').on(t.revisionId), index('assessments_category_idx').on(t.category)],
);

export const populationEstimates = pgTable(
  'population_estimates',
  {
    id: id(),
    revisionId: revisionRef(),
    // must reference an assessment of the SAME revision: enforced by trigger
    assessmentId: uuid('assessment_id').references(() => assessments.id),
    sourceId: sourceRef(),
    scope: assessmentScope('scope').notNull().default('global'),
    regionId: uuid('region_id').references(() => regions.id, { onDelete: 'restrict' }),
    context: populationContext('context').notNull().default('wild'),
    basis: populationBasis('basis').notNull(),
    form: estimateForm('form').notNull(),
    pointValue: bigint('point_value', { mode: 'bigint' }),
    minValue: bigint('min_value', { mode: 'bigint' }),
    maxValue: bigint('max_value', { mode: 'bigint' }),
    qualitativeText: text('qualitative_text'),
    referenceStart: date('reference_start'),
    referenceEnd: date('reference_end'),
    method: text('method'),
    uncertaintyNote: text('uncertainty_note'),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('population_revision_idx').on(t.revisionId)],
);

export const speciesRegions = pgTable(
  'species_regions',
  {
    id: id(),
    revisionId: revisionRef(),
    regionId: uuid('region_id').notNull().references(() => regions.id, { onDelete: 'restrict' }),
    presence: presence('presence').notNull().default('extant'),
    origin: origin('origin').notNull().default('native'),
    seasonality: seasonality('seasonality').notNull().default('resident'),
    sourceId: sourceRef(),
  },
  (t) => [uniqueIndex('species_regions_uq').on(t.revisionId, t.regionId, t.seasonality), index('species_regions_region_idx').on(t.regionId)],
);

export const speciesRanges = pgTable(
  'species_ranges',
  {
    id: id(),
    revisionId: revisionRef(),
    sourceId: sourceRef(),
    geom: multiPolygon('geom').notNull(),
    seasonality: seasonality('seasonality').notNull().default('resident'),
    presence: presence('presence').notNull().default('extant'),
    datasetVersion: text('dataset_version'),
    generalizationNote: text('generalization_note'),
  },
  (t) => [index('species_ranges_geom_gist').using('gist', t.geom), index('species_ranges_revision_idx').on(t.revisionId)],
);

export const speciesHabitats = pgTable(
  'species_habitats',
  {
    id: id(),
    revisionId: revisionRef(),
    habitatId: uuid('habitat_id').notNull().references(() => habitats.id, { onDelete: 'restrict' }),
    suitability: text('suitability'),
    seasonality: seasonality('seasonality'),
    sourceId: sourceRef(),
  },
  (t) => [uniqueIndex('species_habitats_uq').on(t.revisionId, t.habitatId), index('species_habitats_habitat_idx').on(t.habitatId)],
);

export const speciesThreats = pgTable(
  'species_threats',
  {
    id: id(),
    revisionId: revisionRef(),
    threatId: uuid('threat_id').notNull().references(() => threats.id, { onDelete: 'restrict' }),
    severity: text('severity'),
    timing: text('timing'),
    sourceId: sourceRef(),
  },
  (t) => [uniqueIndex('species_threats_uq').on(t.revisionId, t.threatId), index('species_threats_threat_idx').on(t.threatId)],
);

export const revisionCitations = pgTable(
  'revision_citations',
  {
    id: id(),
    revisionId: revisionRef(),
    sectionKey: text('section_key').notNull(),
    sourceId: sourceRef(),
    locator: text('locator'),
    note: text('note'),
  },
  (t) => [uniqueIndex('revision_citations_uq').on(t.revisionId, t.sectionKey, t.sourceId)],
);

export const revisionMedia = pgTable(
  'revision_media',
  {
    id: id(),
    revisionId: revisionRef(),
    mediaId: uuid('media_id').notNull().references(() => mediaAssets.id, { onDelete: 'restrict' }),
    position: integer('position').notNull().default(0),
    role: text('role').notNull().default('gallery'),
    altText: text('alt_text').notNull(),
    caption: text('caption'),
    creditSnapshot: text('credit_snapshot').notNull(),
    licenseSnapshot: text('license_snapshot').notNull(),
  },
  (t) => [uniqueIndex('revision_media_uq').on(t.revisionId, t.mediaId)],
);

export const revisionSupportLinks = pgTable(
  'revision_support_links',
  {
    id: id(),
    revisionId: revisionRef(),
    supportLinkId: uuid('support_link_id').notNull().references(() => supportLinks.id, { onDelete: 'restrict' }),
    contextNote: text('context_note'),
  },
  (t) => [uniqueIndex('revision_support_links_uq').on(t.revisionId, t.supportLinkId)],
);
