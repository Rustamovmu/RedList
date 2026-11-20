import { ApiProperty } from '@nestjs/swagger';
import * as s from '../db/schema';

type Enum<T extends { enumValues: readonly string[] }> = T['enumValues'][number];
const N = { nullable: true, type: String } as const;

export class SourceRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty(N) publisher!: string | null;
  @ApiProperty(N) authors!: string | null;
  @ApiProperty(N) url!: string | null;
  @ApiProperty(N) doi!: string | null;
  @ApiProperty({ ...N, description: 'Source publication date' }) publishedOn!: string | null;
  @ApiProperty({ ...N, description: 'Date the source was accessed (import date)' }) accessedOn!: string | null;
  @ApiProperty(N) license!: string | null;
}

export class CitationDto {
  @ApiProperty() sectionKey!: string;
  @ApiProperty({ format: 'uuid' }) sourceId!: string;
  @ApiProperty(N) locator!: string | null;
  @ApiProperty(N) note!: string | null;
}

export class RegionLinkDto {
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: s.regionType.enumValues }) type!: Enum<typeof s.regionType>;
}

export class AssessmentDto {
  @ApiProperty({ enum: s.iucnCategory.enumValues }) category!: Enum<typeof s.iucnCategory>;
  @ApiProperty({ enum: s.assessmentScope.enumValues }) scope!: Enum<typeof s.assessmentScope>;
  @ApiProperty({ type: RegionLinkDto, nullable: true }) region!: RegionLinkDto | null;
  @ApiProperty({ enum: s.populationTrend.enumValues }) trend!: Enum<typeof s.populationTrend>;
  @ApiProperty(N) assessedOn!: string | null;
  @ApiProperty(N) publishedOn!: string | null;
  @ApiProperty(N) criteria!: string | null;
  @ApiProperty({ format: 'uuid' }) sourceId!: string;
}

export class EstimateDto {
  @ApiProperty({ enum: s.assessmentScope.enumValues }) scope!: Enum<typeof s.assessmentScope>;
  @ApiProperty({ type: RegionLinkDto, nullable: true }) region!: RegionLinkDto | null;
  @ApiProperty({ enum: s.populationContext.enumValues }) context!: Enum<typeof s.populationContext>;
  @ApiProperty({ enum: s.populationBasis.enumValues }) basis!: Enum<typeof s.populationBasis>;
  @ApiProperty({ enum: s.estimateForm.enumValues }) form!: Enum<typeof s.estimateForm>;
  @ApiProperty({ ...N, description: 'Counts are decimal strings (bigint). null is "not stated", never zero.' }) pointValue!: string | null;
  @ApiProperty(N) minValue!: string | null;
  @ApiProperty(N) maxValue!: string | null;
  @ApiProperty(N) qualitativeText!: string | null;
  @ApiProperty(N) referenceStart!: string | null;
  @ApiProperty(N) referenceEnd!: string | null;
  @ApiProperty(N) method!: string | null;
  @ApiProperty(N) uncertaintyNote!: string | null;
  @ApiProperty({ format: 'uuid' }) sourceId!: string;
}

export class PresenceDto {
  @ApiProperty({ type: RegionLinkDto }) region!: RegionLinkDto;
  @ApiProperty({ enum: s.presence.enumValues }) presence!: Enum<typeof s.presence>;
  @ApiProperty({ enum: s.origin.enumValues }) origin!: Enum<typeof s.origin>;
  @ApiProperty({ enum: s.seasonality.enumValues }) seasonality!: Enum<typeof s.seasonality>;
  @ApiProperty({ format: 'uuid' }) sourceId!: string;
}

export class HabitatDto {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty(N) suitability!: string | null;
  @ApiProperty({ enum: s.seasonality.enumValues, nullable: true }) seasonality!: Enum<typeof s.seasonality> | null;
  @ApiProperty({ format: 'uuid' }) sourceId!: string;
}

export class ThreatDto {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty(N) severity!: string | null;
  @ApiProperty(N) timing!: string | null;
  @ApiProperty({ format: 'uuid' }) sourceId!: string;
}

export class RangeValueDto {
  @ApiProperty() label!: string;
  @ApiProperty({ nullable: true, type: Number }) value!: number | null;
  @ApiProperty({ nullable: true, type: Number }) min!: number | null;
  @ApiProperty({ nullable: true, type: Number }) max!: number | null;
  @ApiProperty() unit!: string;
  @ApiProperty(N) context!: string | null;
}

export class MediaDto {
  @ApiProperty() storageKey!: string;
  @ApiProperty() width!: number;
  @ApiProperty() height!: number;
  @ApiProperty({ enum: ['primary', 'gallery'] }) role!: string;
  @ApiProperty() altText!: string;
  @ApiProperty(N) caption!: string | null;
  @ApiProperty({ description: 'Credit as recorded when this revision was saved' }) credit!: string;
  @ApiProperty({ description: 'Licence as recorded when this revision was saved' }) license!: string;
  @ApiProperty(N) sourceUrl!: string | null;
}

export class SupportLinkDto {
  @ApiProperty() organizationName!: string;
  @ApiProperty() organizationWebsite!: string;
  @ApiProperty() url!: string;
  @ApiProperty({ description: 'Destination domain, shown next to the link' }) domain!: string;
  @ApiProperty({ enum: s.supportActionType.enumValues }) actionType!: Enum<typeof s.supportActionType>;
  @ApiProperty() description!: string;
  @ApiProperty(N) contextNote!: string | null;
}

export class NameDto {
  @ApiProperty() language!: string;
  @ApiProperty() name!: string;
}

export class TaxonomyDto {
  @ApiProperty(N) kingdom!: string | null;
  @ApiProperty(N) phylum!: string | null;
  @ApiProperty(N) class!: string | null;
  @ApiProperty(N) order!: string | null;
  @ApiProperty(N) family!: string | null;
  @ApiProperty(N) genus!: string | null;
}

export class StatusSectionDto {
  @ApiProperty({ type: [AssessmentDto] }) assessments!: AssessmentDto[];
  @ApiProperty({ description: 'Explicitly marked "Not assessed" by an editor' }) notAssessed!: boolean;
}

export class PopulationSectionDto {
  @ApiProperty({ type: [EstimateDto] }) estimates!: EstimateDto[];
  @ApiProperty({ description: 'Explicitly marked "Unknown" by an editor' }) unknown!: boolean;
  @ApiProperty(N) unknownNote!: string | null;
}

export class ClimateDto {
  @ApiProperty(N) narrative!: string | null;
  @ApiProperty({ type: [RangeValueDto] }) ranges!: RangeValueDto[];
}

/** A published range map, without its shape (the shape comes from GET /map?species=<slug>). */
export class RangeMetaDto {
  @ApiProperty({ enum: s.seasonality.enumValues }) seasonality!: Enum<typeof s.seasonality>;
  @ApiProperty({ enum: s.presence.enumValues }) presence!: Enum<typeof s.presence>;
  @ApiProperty(N) datasetVersion!: string | null;
  @ApiProperty(N) generalizationNote!: string | null;
  @ApiProperty({ format: 'uuid' }) sourceId!: string;
}

export class GeographySectionDto {
  @ApiProperty({ enum: s.environment.enumValues, isArray: true }) environments!: Array<Enum<typeof s.environment>>;
  @ApiProperty({ description: 'True when the species is location-sensitive and its regions are withheld' }) locationWithheld!: boolean;
  @ApiProperty({ description: 'True when locations are shown only at whole-country (or sea) level to protect the species' })
  locationGeneralized!: boolean;
  @ApiProperty({ type: [PresenceDto] }) regions!: PresenceDto[];
  @ApiProperty({ type: [RangeMetaDto], description: 'Published range maps. Empty when only country-level presence is known.' })
  ranges!: RangeMetaDto[];
  @ApiProperty({ type: [HabitatDto] }) habitats!: HabitatDto[];
  @ApiProperty({ type: ClimateDto }) climate!: ClimateDto;
}

export class DietSectionDto {
  @ApiProperty(N) narrative!: string | null;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiProperty(N) context!: string | null;
}

export class ThreatsSectionDto {
  @ApiProperty({ type: [ThreatDto] }) threats!: ThreatDto[];
  @ApiProperty(N) conservationActions!: string | null;
}

export class BiologySectionDto {
  @ApiProperty(N) narrative!: string | null;
  @ApiProperty({ type: [RangeValueDto] }) measurements!: RangeValueDto[];
}

export class ReviewDto {
  @ApiProperty() version!: number;
  @ApiProperty() publishedAt!: string;
  @ApiProperty({ description: 'Editorial review date' }) reviewedAt!: string;
  @ApiProperty({ enum: ['editor', 'admin'], nullable: true, description: 'Role of the reviewer. Names are never published.' })
  reviewerRole!: 'editor' | 'admin' | null;
  @ApiProperty({ description: 'True when the author published their own revision. Never presented as independent review.' })
  selfReviewed!: boolean;
}

/** The public species profile. Built only from the published revision. */
export class SpeciesProfileDto {
  @ApiProperty() slug!: string;
  @ApiProperty() scientificName!: string;
  @ApiProperty({ enum: s.taxonRank.enumValues }) rank!: Enum<typeof s.taxonRank>;
  @ApiProperty({ enum: s.displayGroup.enumValues }) displayGroup!: Enum<typeof s.displayGroup>;
  @ApiProperty({ ...N, description: 'Preferred English common name' }) commonName!: string | null;
  @ApiProperty({ type: [NameDto] }) commonNames!: NameDto[];
  @ApiProperty({ type: [NameDto] }) synonyms!: NameDto[];
  @ApiProperty({ type: TaxonomyDto }) taxonomy!: TaxonomyDto;
  @ApiProperty(N) overview!: string | null;
  @ApiProperty({ type: StatusSectionDto }) status!: StatusSectionDto;
  @ApiProperty({ type: PopulationSectionDto }) population!: PopulationSectionDto;
  @ApiProperty({ type: GeographySectionDto }) geography!: GeographySectionDto;
  @ApiProperty({ type: DietSectionDto }) diet!: DietSectionDto;
  @ApiProperty({ type: ThreatsSectionDto }) threats!: ThreatsSectionDto;
  @ApiProperty({ type: BiologySectionDto }) biology!: BiologySectionDto;
  @ApiProperty({ type: [SupportLinkDto] }) support!: SupportLinkDto[];
  @ApiProperty({ type: [MediaDto] }) media!: MediaDto[];
  @ApiProperty({ type: [SourceRefDto] }) sources!: SourceRefDto[];
  @ApiProperty({ type: [CitationDto] }) citations!: CitationDto[];
  @ApiProperty({ type: ReviewDto }) review!: ReviewDto;
  @ApiProperty({ type: () => [SpeciesCardDto], description: 'Up to 4 published species sharing group, threats or (non-sensitive) regions' })
  related!: SpeciesCardDto[];
}

// ---------- M2: list, filters, compare, related ----------

export class CardStatusDto {
  @ApiProperty({ enum: s.iucnCategory.enumValues }) category!: Enum<typeof s.iucnCategory>;
  @ApiProperty({ enum: s.assessmentScope.enumValues }) scope!: Enum<typeof s.assessmentScope>;
  @ApiProperty(N) assessedOn!: string | null;
  @ApiProperty({ enum: s.populationTrend.enumValues }) trend!: Enum<typeof s.populationTrend>;
}

export class CardImageDto {
  @ApiProperty() storageKey!: string;
  @ApiProperty() altText!: string;
  @ApiProperty() credit!: string;
  @ApiProperty() license!: string;
}

/** A species in a list. Built from the published revision only. */
export class SpeciesCardDto {
  @ApiProperty() slug!: string;
  @ApiProperty() scientificName!: string;
  @ApiProperty(N) commonName!: string | null;
  @ApiProperty({ enum: s.displayGroup.enumValues }) displayGroup!: Enum<typeof s.displayGroup>;
  @ApiProperty({ type: CardStatusDto, nullable: true, description: 'Headline assessment: global if there is one, else regional; most recent first' })
  status!: CardStatusDto | null;
  @ApiProperty() notAssessed!: boolean;
  @ApiProperty({ enum: s.environment.enumValues, isArray: true }) environments!: Array<Enum<typeof s.environment>>;
  @ApiProperty({ nullable: true, type: Number, description: 'Number of countries, seas and oceans; null when locations are withheld' })
  regionCount!: number | null;
  @ApiProperty() locationWithheld!: boolean;
  @ApiProperty({ type: CardImageDto, nullable: true }) image!: CardImageDto | null;
}

export class SpeciesListDto {
  @ApiProperty({ type: [SpeciesCardDto] }) items!: SpeciesCardDto[];
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}

export class FacetDto {
  @ApiProperty() value!: string;
  @ApiProperty() count!: number;
}
export class RegionFacetDto {
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: s.regionType.enumValues }) type!: Enum<typeof s.regionType>;
  @ApiProperty() count!: number;
}
export class HabitatFacetDto {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() count!: number;
}

/** Filter options with counts of published species. Counts describe this catalogue, never global totals. */
export class FiltersDto {
  @ApiProperty({ description: 'Published species in this catalogue' }) total!: number;
  @ApiProperty({ description: 'Published species whose headline category is CR, EN or VU' }) threatened!: number;
  @ApiProperty({ type: [FacetDto] }) groups!: FacetDto[];
  @ApiProperty({ type: [FacetDto] }) environments!: FacetDto[];
  @ApiProperty({ type: [FacetDto] }) categories!: FacetDto[];
  @ApiProperty({ type: [FacetDto] }) trends!: FacetDto[];
  @ApiProperty({ type: [RegionFacetDto], description: 'Location-sensitive species are not counted' }) regions!: RegionFacetDto[];
  @ApiProperty({ type: [HabitatFacetDto] }) habitats!: HabitatFacetDto[];
}

export class PopulationComparisonDto {
  @ApiProperty({
    enum: ['same_basis', 'not_directly_comparable', 'unknown'],
    description: 'same_basis: every species has a wild, global, numeric estimate in one shared unit. Values are still never combined or scored.',
  })
  status!: 'same_basis' | 'not_directly_comparable' | 'unknown';
  @ApiProperty() message!: string;
  @ApiProperty({ enum: s.populationBasis.enumValues, nullable: true }) basis!: Enum<typeof s.populationBasis> | null;
}

export class CompareDto {
  @ApiProperty({ type: [SpeciesProfileDto], description: 'In the requested order' }) species!: SpeciesProfileDto[];
  @ApiProperty({ type: PopulationComparisonDto }) population!: PopulationComparisonDto;
}
