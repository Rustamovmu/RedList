import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { FacetDto, SpeciesCardDto } from '../catalogue/dto';
import { csv } from '../catalogue/list-query.dto';
import * as s from '../db/schema';

type Enum<T extends { enumValues: readonly string[] }> = T['enumValues'][number];
const N = { nullable: true, type: String } as const;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** GeoJSON MultiPolygon coordinates: polygons → rings → [lon, lat] positions. */
const COORDINATES = {
  type: 'array',
  items: { type: 'array', items: { type: 'array', items: { type: 'array', items: { type: 'number' } } } },
} as const;

export class MultiPolygonDto {
  @ApiProperty({ enum: ['MultiPolygon'] }) type!: 'MultiPolygon';
  @ApiProperty({ ...COORDINATES, description: 'WGS84 [longitude, latitude]; never crosses ±180 (shapes are split there)' })
  coordinates!: number[][][][];
}

// ---------- GET /map ----------

export class MapQuery {
  @ApiPropertyOptional({
    description: 'Viewport "west,south,east,north" in degrees. west > east crosses the antimeridian. Default: the whole world.',
    example: '170,-25,-170,-10',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bbox?: string;

  @ApiPropertyOptional({ type: String, description: 'Animal group(s), comma-separated' })
  @IsOptional() @Transform(csv) @IsArray() @ArrayMaxSize(11) @IsIn(s.displayGroup.enumValues, { each: true })
  group?: string[];

  @ApiPropertyOptional({ type: String, description: 'IUCN category of the headline assessment, comma-separated' })
  @IsOptional() @Transform(csv) @IsArray() @ArrayMaxSize(9) @IsIn(s.iucnCategory.enumValues, { each: true })
  category?: string[];

  @ApiPropertyOptional({ description: 'Only this published species (used by the profile map)' })
  @IsOptional() @Matches(SLUG) @MaxLength(120)
  species?: string;
}

export class MapSpeciesDto extends SpeciesCardDto {
  @ApiProperty({
    enum: ['range', 'country'],
    description: 'range: a published range map is shown. country: only country/sea-level presence is known, so whole regions are shaded.',
  })
  layer!: 'range' | 'country';
}

export class CountryPresenceDto {
  @ApiProperty({ description: 'Region slug; its shape is in GET /map/basemap' }) slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: s.regionType.enumValues }) type!: Enum<typeof s.regionType>;
  @ApiProperty() speciesCount!: number;
  @ApiProperty({ type: [String], description: 'Slugs of the species shaded here' }) species!: string[];
}

export class MapRangeDto {
  @ApiProperty() speciesSlug!: string;
  @ApiProperty({ enum: s.seasonality.enumValues }) seasonality!: Enum<typeof s.seasonality>;
  @ApiProperty({ enum: s.presence.enumValues }) presence!: Enum<typeof s.presence>;
  @ApiProperty({ description: 'True when the shape was generalized to whole countries or seas to protect the species' }) generalized!: boolean;
  @ApiProperty(N) note!: string | null;
  @ApiProperty({ format: 'uuid' }) sourceId!: string;
  @ApiProperty({ type: MultiPolygonDto, description: 'Clipped to the viewport and simplified for display' }) geometry!: MultiPolygonDto;
}

export class MapLimitsDto {
  @ApiProperty() maxSpecies!: number;
  @ApiProperty() maxVertices!: number;
}

/** Published species in a viewport, with the map layers that place them. Location-sensitive (hidden) species never appear. */
export class MapDto {
  @ApiProperty({ type: [Number], description: '[west, south, east, north] as interpreted' }) bbox!: number[];
  @ApiProperty({ type: [MapSpeciesDto] }) species!: MapSpeciesDto[];
  @ApiProperty({ type: [CountryPresenceDto], description: 'Layer "Country-level presence"' }) countryPresence!: CountryPresenceDto[];
  @ApiProperty({ type: [MapRangeDto], description: 'Layer "Published range map"' }) ranges!: MapRangeDto[];
  @ApiProperty({ description: 'True when a species or vertex cap cut the result short; zoom in to see everything' }) truncated!: boolean;
  @ApiProperty({ type: MapLimitsDto }) limits!: MapLimitsDto;
}

export class BasemapPropertiesDto {
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: s.regionType.enumValues }) kind!: Enum<typeof s.regionType>;
}
export class BasemapFeatureDto {
  @ApiProperty({ enum: ['Feature'] }) type!: 'Feature';
  @ApiProperty({ type: BasemapPropertiesDto }) properties!: BasemapPropertiesDto;
  @ApiProperty({ type: MultiPolygonDto }) geometry!: MultiPolygonDto;
}
/** Natural Earth 1:110m countries, seas and oceans (public domain): the R1 basemap (DECISIONS D-004, D-016). */
export class BasemapDto {
  @ApiProperty({ enum: ['FeatureCollection'] }) type!: 'FeatureCollection';
  @ApiProperty({ type: [BasemapFeatureDto] }) features!: BasemapFeatureDto[];
  @ApiProperty() attribution!: string;
}

// ---------- GET /regions/:slug ----------

export class RegionSourceDto {
  @ApiProperty() title!: string;
  @ApiProperty(N) url!: string | null;
  @ApiProperty(N) license!: string | null;
}

export class RegionDto {
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: s.regionType.enumValues }) type!: Enum<typeof s.regionType>;
  @ApiProperty(N) isoA2!: string | null;
  @ApiProperty({ type: [Number], nullable: true, description: '[west, south, east, north]; west > east crosses the antimeridian' })
  bbox!: number[] | null;
  @ApiProperty({ type: RegionSourceDto, nullable: true }) source!: RegionSourceDto | null;
}

export class OccurrenceDto {
  @ApiProperty({ enum: s.presence.enumValues }) presence!: Enum<typeof s.presence>;
  @ApiProperty({ enum: s.origin.enumValues }) origin!: Enum<typeof s.origin>;
  @ApiProperty({ enum: s.seasonality.enumValues }) seasonality!: Enum<typeof s.seasonality>;
}

export class RegionSpeciesDto {
  @ApiProperty({ type: SpeciesCardDto }) card!: SpeciesCardDto;
  @ApiProperty({ type: [OccurrenceDto], description: 'How the species occurs in this region, as the source records it' })
  occurrences!: OccurrenceDto[];
}

export class RegionFacetsDto {
  @ApiProperty({ type: [FacetDto] }) groups!: FacetDto[];
  @ApiProperty({ type: [FacetDto] }) categories!: FacetDto[];
  @ApiProperty({ type: [FacetDto] }) origins!: FacetDto[];
  @ApiProperty({ type: [FacetDto] }) seasonalities!: FacetDto[];
}

/** A country, sea or ocean with the published species recorded there. Location-sensitive species are never listed. */
export class RegionPageDto {
  @ApiProperty({ type: RegionDto }) region!: RegionDto;
  @ApiProperty({ type: RegionFacetsDto, description: 'Counts of published species in this region' }) facets!: RegionFacetsDto;
  @ApiProperty({ type: [RegionSpeciesDto] }) items!: RegionSpeciesDto[];
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}

export class RegionQuery {
  @ApiPropertyOptional({ type: String, description: 'Animal group(s), comma-separated' })
  @IsOptional() @Transform(csv) @IsArray() @ArrayMaxSize(11) @IsIn(s.displayGroup.enumValues, { each: true })
  group?: string[];

  @ApiPropertyOptional({ type: String, description: 'Headline IUCN category, comma-separated' })
  @IsOptional() @Transform(csv) @IsArray() @ArrayMaxSize(9) @IsIn(s.iucnCategory.enumValues, { each: true })
  category?: string[];

  @ApiPropertyOptional({ type: String, description: 'Origin in this region (native, introduced, …), comma-separated' })
  @IsOptional() @Transform(csv) @IsArray() @ArrayMaxSize(5) @IsIn(s.origin.enumValues, { each: true })
  origin?: string[];

  @ApiPropertyOptional({ type: String, description: 'Seasonality in this region (resident, breeding, …), comma-separated' })
  @IsOptional() @Transform(csv) @IsArray() @ArrayMaxSize(5) @IsIn(s.seasonality.enumValues, { each: true })
  seasonality?: string[];

  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1, maximum: 1000 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  page?: number;

  @ApiPropertyOptional({ type: Number, default: 24, minimum: 1, maximum: 48 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(48)
  pageSize?: number;
}
