import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  registerDecorator,
  ValidateNested,
} from 'class-validator';
import * as s from '../db/schema';
import { geometryProblem, MAX_RANGE_VERTICES } from '../geography/geo-schema';
import { editorialOpenApiSchema } from './editorial-schema';

/** Citation section keys. Must match the CHECK constraint revision_citations_section in drizzle/0002_integrity.sql. */
export const SECTION_KEYS = [
  'overview', 'classification', 'status', 'population', 'geography', 'habitat', 'climate', 'diet', 'biology', 'threats', 'actions', 'media',
] as const;
export const MEDIA_ROLES = ['primary', 'gallery'] as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COUNT = /^\d{1,18}$/;
const LANG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

type Enum<T extends { enumValues: readonly string[] }> = T['enumValues'][number];

// ---------- revision content (input and output share one shape) ----------

export class NameInput {
  @ApiProperty({ example: 'en' }) @Matches(LANG) language!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @ApiProperty({ enum: s.nameType.enumValues }) @IsIn(s.nameType.enumValues) nameType!: Enum<typeof s.nameType>;
  @ApiProperty() @IsBoolean() preferred!: boolean;
}

export class AssessmentInput {
  @ApiPropertyOptional({ nullable: true, type: String }) @IsOptional() @IsString() @MaxLength(100) providerAssessmentId?: string | null;
  @ApiProperty({ format: 'uuid' }) @IsUUID() sourceId!: string;
  @ApiProperty({ enum: s.assessmentScope.enumValues }) @IsIn(s.assessmentScope.enumValues) scope!: Enum<typeof s.assessmentScope>;
  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String }) @IsOptional() @IsUUID() regionId?: string | null;
  @ApiProperty({ enum: s.iucnCategory.enumValues }) @IsIn(s.iucnCategory.enumValues) category!: Enum<typeof s.iucnCategory>;
  @ApiProperty({ enum: s.populationTrend.enumValues }) @IsIn(s.populationTrend.enumValues) trend!: Enum<typeof s.populationTrend>;
  @ApiPropertyOptional({ example: '2021-06-01', nullable: true, type: String }) @IsOptional() @Matches(DATE) assessedOn?: string | null;
  @ApiPropertyOptional({ example: '2021-12-09', nullable: true, type: String }) @IsOptional() @Matches(DATE) publishedOn?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @IsOptional() @IsString() @MaxLength(200) criteria?: string | null;
}

export class EstimateInput {
  @ApiPropertyOptional({ description: 'Index into `assessments` of the same payload', nullable: true, type: Number })
  @IsOptional()
  @IsInt()
  @Min(0)
  assessmentIndex?: number | null;
  @ApiProperty({ format: 'uuid' }) @IsUUID() sourceId!: string;
  @ApiProperty({ enum: s.assessmentScope.enumValues }) @IsIn(s.assessmentScope.enumValues) scope!: Enum<typeof s.assessmentScope>;
  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String }) @IsOptional() @IsUUID() regionId?: string | null;
  @ApiProperty({ enum: s.populationContext.enumValues }) @IsIn(s.populationContext.enumValues) context!: Enum<typeof s.populationContext>;
  @ApiProperty({ enum: s.populationBasis.enumValues }) @IsIn(s.populationBasis.enumValues) basis!: Enum<typeof s.populationBasis>;
  @ApiProperty({ enum: s.estimateForm.enumValues }) @IsIn(s.estimateForm.enumValues) form!: Enum<typeof s.estimateForm>;
  @ApiPropertyOptional({ description: 'Count as a decimal string (bigint)', example: '2500', nullable: true, type: String })
  @IsOptional()
  @Matches(COUNT)
  pointValue?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @IsOptional() @Matches(COUNT) minValue?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @IsOptional() @Matches(COUNT) maxValue?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @IsOptional() @IsString() @MaxLength(500) qualitativeText?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @IsOptional() @Matches(DATE) referenceStart?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @IsOptional() @Matches(DATE) referenceEnd?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @IsOptional() @IsString() @MaxLength(500) method?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @IsOptional() @IsString() @MaxLength(500) uncertaintyNote?: string | null;
}

export class RegionPresenceInput {
  @ApiProperty({ format: 'uuid' }) @IsUUID() regionId!: string;
  @ApiProperty({ enum: s.presence.enumValues }) @IsIn(s.presence.enumValues) presence!: Enum<typeof s.presence>;
  @ApiProperty({ enum: s.origin.enumValues }) @IsIn(s.origin.enumValues) origin!: Enum<typeof s.origin>;
  @ApiProperty({ enum: s.seasonality.enumValues }) @IsIn(s.seasonality.enumValues) seasonality!: Enum<typeof s.seasonality>;
  @ApiProperty({ format: 'uuid' }) @IsUUID() sourceId!: string;
}

export class HabitatInput {
  @ApiProperty({ format: 'uuid' }) @IsUUID() habitatId!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) @IsOptional() @IsString() @MaxLength(100) suitability?: string | null;
  @ApiPropertyOptional({ enum: s.seasonality.enumValues, nullable: true }) @IsOptional() @IsIn(s.seasonality.enumValues) seasonality?: Enum<typeof s.seasonality> | null;
  @ApiProperty({ format: 'uuid' }) @IsUUID() sourceId!: string;
}

export class ThreatInput {
  @ApiProperty({ format: 'uuid' }) @IsUUID() threatId!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) @IsOptional() @IsString() @MaxLength(100) severity?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @IsOptional() @IsString() @MaxLength(100) timing?: string | null;
  @ApiProperty({ format: 'uuid' }) @IsUUID() sourceId!: string;
}

export class CitationInput {
  @ApiProperty({ enum: SECTION_KEYS }) @IsIn(SECTION_KEYS) sectionKey!: (typeof SECTION_KEYS)[number];
  @ApiProperty({ format: 'uuid' }) @IsUUID() sourceId!: string;
  @ApiPropertyOptional({ description: 'Page, table or section in the source', nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  locator?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @IsOptional() @IsString() @MaxLength(500) note?: string | null;
}

export class MediaInput {
  @ApiProperty({ format: 'uuid' }) @IsUUID() mediaId!: string;
  @ApiProperty() @IsInt() @Min(0) position!: number;
  @ApiProperty({ enum: MEDIA_ROLES }) @IsIn(MEDIA_ROLES) role!: (typeof MEDIA_ROLES)[number];
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(300) altText!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) @IsOptional() @IsString() @MaxLength(500) caption?: string | null;
}

export class SupportLinkInput {
  @ApiProperty({ format: 'uuid' }) @IsUUID() supportLinkId!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) @IsOptional() @IsString() @MaxLength(300) contextNote?: string | null;
}

/** Validates GeoJSON range geometry with the zod schema in geography/geo-schema.ts. */
function IsRangeGeometry(): PropertyDecorator {
  return (target, key) =>
    registerDecorator({
      name: 'isRangeGeometry',
      target: target.constructor,
      propertyName: String(key),
      validator: {
        validate: (v: unknown) => geometryProblem(v) === null,
        defaultMessage: (a) => `${a?.property ?? 'geometry'}: ${geometryProblem(a?.value) ?? 'invalid geometry'}`,
      },
    });
}

export class RangeInput {
  @ApiProperty({ format: 'uuid' }) @IsUUID() sourceId!: string;
  @ApiProperty({ enum: s.seasonality.enumValues }) @IsIn(s.seasonality.enumValues) seasonality!: Enum<typeof s.seasonality>;
  @ApiProperty({ enum: s.presence.enumValues }) @IsIn(s.presence.enumValues) presence!: Enum<typeof s.presence>;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'Version of the source dataset, if any' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  datasetVersion?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, description: 'How the shape was simplified. Set automatically for location-sensitive species.' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  generalizationNote?: string | null;
  @ApiProperty({
    type: 'object',
    description:
      `GeoJSON Polygon or MultiPolygon, WGS84 [lon, lat], at most ${MAX_RANGE_VERTICES} vertices. Longitudes may run to ±540 to cross the ` +
      'antimeridian in one shape; it is split at ±180 on save. For "generalize_country" species the shape is replaced by the whole ' +
      'countries (or seas) it covers; "hide_regions" species cannot have ranges.',
    properties: {
      type: { type: 'string', enum: ['Polygon', 'MultiPolygon'] },
      coordinates: { type: 'array', items: {} },
    },
    required: ['type', 'coordinates'],
  })
  @IsRangeGeometry()
  geometry!: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown[] };
}

const nested = <T>(cls: new () => T, max: number) => [IsArray(), ArrayMaxSize(max), ValidateNested({ each: true }), Type(() => cls)];
function Nested<T>(cls: new () => T, max: number): PropertyDecorator {
  return (target, key) => nested(cls, max).forEach((d) => d(target, key));
}

/** Everything public about a species that belongs to one revision. Saving a draft replaces all of it. */
export class RevisionContentDto {
  @ApiProperty({ enum: s.displayGroup.enumValues }) @IsIn(s.displayGroup.enumValues) displayGroup!: Enum<typeof s.displayGroup>;
  @ApiProperty({ ...editorialOpenApiSchema(), description: 'Editorial JSON, validated by the versioned zod schema' })
  @IsObject()
  editorial!: Record<string, unknown>;
  @ApiProperty({ type: [NameInput] }) @Nested(NameInput, 100) names!: NameInput[];
  @ApiProperty({ enum: s.environment.enumValues, isArray: true }) @IsArray() @ArrayMaxSize(6) @IsIn(s.environment.enumValues, { each: true })
  environments!: Array<Enum<typeof s.environment>>;
  @ApiProperty({ type: [AssessmentInput] }) @Nested(AssessmentInput, 50) assessments!: AssessmentInput[];
  @ApiProperty({ type: [EstimateInput] }) @Nested(EstimateInput, 100) populationEstimates!: EstimateInput[];
  @ApiProperty({ type: [RegionPresenceInput] }) @Nested(RegionPresenceInput, 500) regions!: RegionPresenceInput[];
  @ApiProperty({ type: [RangeInput], description: 'Published range maps (approved through the revision workflow)' })
  @Nested(RangeInput, 20)
  ranges!: RangeInput[];
  @ApiProperty({ type: [HabitatInput] }) @Nested(HabitatInput, 100) habitats!: HabitatInput[];
  @ApiProperty({ type: [ThreatInput] }) @Nested(ThreatInput, 100) threats!: ThreatInput[];
  @ApiProperty({ type: [CitationInput] }) @Nested(CitationInput, 200) citations!: CitationInput[];
  @ApiProperty({ type: [MediaInput] }) @Nested(MediaInput, 50) media!: MediaInput[];
  @ApiProperty({ type: [SupportLinkInput] }) @Nested(SupportLinkInput, 50) supportLinks!: SupportLinkInput[];
}

export class SaveDraftDto extends RevisionContentDto {
  @ApiProperty({ description: 'updatedAt from your last read. A mismatch means someone else saved first (409).' })
  @IsISO8601()
  expectedUpdatedAt!: string;
}

// ---------- species identity ----------

export class CreateSpeciesDto {
  @ApiProperty({ example: 'fictus-exemplaris' }) @Matches(SLUG) @MaxLength(120) slug!: string;
  @ApiProperty({ example: 'Fictus exemplaris' }) @IsString() @MinLength(3) @MaxLength(200) acceptedScientificName!: string;
  @ApiProperty({ enum: s.taxonRank.enumValues }) @IsIn(s.taxonRank.enumValues) rank!: Enum<typeof s.taxonRank>;
  @ApiProperty({ enum: s.displayGroup.enumValues }) @IsIn(s.displayGroup.enumValues) displayGroup!: Enum<typeof s.displayGroup>;
  @ApiPropertyOptional({ enum: s.locationSensitivity.enumValues })
  @IsOptional()
  @IsIn(s.locationSensitivity.enumValues)
  locationSensitivity?: Enum<typeof s.locationSensitivity>;
}

export class AddIdentifierDto {
  @ApiProperty({ example: 'gbif' }) @Matches(/^[a-z][a-z0-9_-]{1,30}$/) provider!: string;
  @ApiProperty({ example: '2435099' }) @IsString() @MinLength(1) @MaxLength(100) externalId!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) sourceUrl?: string | null;
}

export class IdentifierDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() provider!: string;
  @ApiProperty() externalId!: string;
  @ApiProperty({ nullable: true, type: String }) sourceUrl!: string | null;
}

export class RevisionSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ enum: s.revisionState.enumValues }) state!: Enum<typeof s.revisionState>;
  @ApiProperty() updatedAt!: string;
  @ApiProperty({ nullable: true, type: String }) publishedAt!: string | null;
  @ApiProperty() isPublished!: boolean;
}

/**
 * A photo as one revision carries it: the alt text and credit of that revision, not the asset's current ones
 * (PLAN §6 `revision_media` snapshots). `reviewState` is the asset's state now, so staff can see that a live
 * photo has been sent back to review. Staff see the bytes through `GET staff/media/:id/preview/:width.webp`.
 */
export class RevisionPhotoDto {
  @ApiProperty({ format: 'uuid' }) mediaId!: string;
  @ApiProperty({ enum: MEDIA_ROLES }) role!: (typeof MEDIA_ROLES)[number];
  @ApiProperty() position!: number;
  @ApiProperty() altText!: string;
  @ApiProperty({ nullable: true, type: String }) caption!: string | null;
  @ApiProperty({ description: 'The credit recorded when this revision was saved' }) credit!: string;
  @ApiProperty({ description: 'The licence recorded when this revision was saved' }) license!: string;
  @ApiProperty({ enum: s.mediaReviewState.enumValues, description: "The asset's review state now" })
  reviewState!: Enum<typeof s.mediaReviewState>;
  @ApiProperty() width!: number;
  @ApiProperty() height!: number;
}

export class StaffSpeciesDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() acceptedScientificName!: string;
  @ApiProperty({ enum: s.taxonRank.enumValues }) rank!: Enum<typeof s.taxonRank>;
  @ApiProperty({ enum: s.locationSensitivity.enumValues }) locationSensitivity!: Enum<typeof s.locationSensitivity>;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) publishedRevisionId!: string | null;
  @ApiProperty({ type: [IdentifierDto] }) identifiers!: IdentifierDto[];
  @ApiProperty({ type: [RevisionSummaryDto] }) revisions!: RevisionSummaryDto[];
  @ApiProperty({ type: [RevisionPhotoDto], description: 'The photos on the published revision, in order. Empty when nothing is published.' })
  publishedPhotos!: RevisionPhotoDto[];
}

export class ChecklistItemDto {
  @ApiProperty() key!: string;
  @ApiProperty() ok!: boolean;
  @ApiProperty({ description: 'A failing blocking item stops submit and publish; a failing non-blocking item is advice only' }) blocking!: boolean;
  @ApiProperty() message!: string;
}

export class RevisionDetailDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) speciesId!: string;
  @ApiProperty() speciesSlug!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ enum: s.revisionState.enumValues }) state!: Enum<typeof s.revisionState>;
  @ApiProperty() schemaVersion!: number;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) baseRevisionId!: string | null;
  @ApiProperty() isPublished!: boolean;
  @ApiProperty() selfReviewed!: boolean;
  @ApiProperty({ nullable: true, type: String }) reviewNotes!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
  @ApiProperty({ nullable: true, type: String }) submittedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) reviewedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) publishedAt!: string | null;
  @ApiProperty({ type: RevisionContentDto }) content!: RevisionContentDto;
  @ApiProperty({ type: [ChecklistItemDto] }) checklist!: ChecklistItemDto[];
}

export class RequestChangesDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(2000) notes!: string;
}

/** Moves the published pointer back to an earlier published revision (PLAN §6 "Publication"). */
export class RollbackDto {
  @ApiProperty({ format: 'uuid', description: 'An earlier published revision of this species' }) @IsUUID() targetRevisionId!: string;
  @ApiProperty({ format: 'uuid', description: 'The revision you saw as live; 409 if it has changed since' }) @IsUUID() expectedPublishedRevisionId!: string;
  @ApiProperty({ description: 'Why the earlier version is restored (kept in the audit log)' }) @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

// ---------- sources and reference lists ----------

export class CreateSourceDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(500) title!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) @IsOptional() @IsString() @MaxLength(200) publisher?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @IsOptional() @IsString() @MaxLength(500) authors?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @IsOptional() @IsUrl({ protocols: ['https', 'http'], require_protocol: true }) url?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @IsOptional() @Matches(/^10\.\d{4,9}\/\S+$/) doi?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @IsOptional() @Matches(DATE) publishedOn?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @IsOptional() @Matches(DATE) accessedOn?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @IsOptional() @IsString() @MaxLength(100) license?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) @IsOptional() @IsString() @MaxLength(1000) permittedUseNote?: string | null;
}

/** A full replacement of a source's fields. */
export class UpdateSourceDto extends CreateSourceDto {}

export class SourceDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) publisher!: string | null;
  @ApiProperty({ nullable: true, type: String }) authors!: string | null;
  @ApiProperty({ nullable: true, type: String }) url!: string | null;
  @ApiProperty({ nullable: true, type: String }) doi!: string | null;
  @ApiProperty({ nullable: true, type: String }) publishedOn!: string | null;
  @ApiProperty({ nullable: true, type: String }) accessedOn!: string | null;
  @ApiProperty({ nullable: true, type: String }) license!: string | null;
}

export class SourceUpdateResultDto {
  @ApiProperty({ type: SourceDto, description: 'The source as it now reads. Its id differs from the requested one when a new row was created.' }) source!: SourceDto;
  @ApiProperty({ description: 'True when the old source is cited by a submitted or published revision, so a new source row was created and the old one left unchanged' })
  createdNewRow!: boolean;
}

class RefItemDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
}
class RegionRefDto extends RefItemDto {
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: s.regionType.enumValues }) type!: Enum<typeof s.regionType>;
}
class CodedRefDto extends RefItemDto {
  @ApiProperty() code!: string;
}
class MediaRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() credit!: string;
  @ApiProperty() license!: string;
  @ApiProperty({ enum: s.mediaReviewState.enumValues }) reviewState!: Enum<typeof s.mediaReviewState>;
}
class SupportLinkRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() organizationName!: string;
  @ApiProperty() url!: string;
  @ApiProperty({ enum: s.editorialStatus.enumValues }) editorialStatus!: Enum<typeof s.editorialStatus>;
}

export class ReferenceListsDto {
  @ApiProperty({ type: [RegionRefDto] }) regions!: RegionRefDto[];
  @ApiProperty({ type: [CodedRefDto] }) habitats!: CodedRefDto[];
  @ApiProperty({ type: [CodedRefDto] }) threats!: CodedRefDto[];
  @ApiProperty({ type: [MediaRefDto] }) media!: MediaRefDto[];
  @ApiProperty({ type: [SupportLinkRefDto] }) supportLinks!: SupportLinkRefDto[];
}
