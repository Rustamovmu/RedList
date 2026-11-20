import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import * as s from '../db/schema';

export const SORTS = ['name', 'status', 'reviewed'] as const;
export const MAX_PAGE_SIZE = 48;

/** Query params arrive as "a,b,c" (or repeated). Normalize to a trimmed, de-duplicated list. */
const csv = ({ value }: { value: unknown }) => {
  const parts = (Array.isArray(value) ? value : [value]).flatMap((v) => (typeof v === 'string' ? v.split(',') : []));
  const list = [...new Set(parts.map((p) => p.trim()).filter(Boolean))];
  return list.length ? list : undefined;
};
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CODE = /^[a-z0-9][a-z0-9._-]{0,40}$/;
const list = (description: string) => ({ type: String, description: `${description}. Comma-separated; any of the values matches.` });

/**
 * GET /api/v1/species (PLAN §9). Filters combine with AND; values inside one filter combine with OR.
 * There is deliberately no population sort: population units are not comparable (PLAN §4).
 */
export class ListSpeciesQuery {
  @ApiPropertyOptional({ description: 'Search common names, scientific names and synonyms (prefix match per word)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional(list(`Animal group: ${s.displayGroup.enumValues.join(', ')}`))
  @IsOptional() @Transform(csv) @IsArray() @ArrayMaxSize(11) @IsIn(s.displayGroup.enumValues, { each: true })
  group?: string[];

  @ApiPropertyOptional(list(`Environment: ${s.environment.enumValues.join(', ')}`))
  @IsOptional() @Transform(csv) @IsArray() @ArrayMaxSize(6) @IsIn(s.environment.enumValues, { each: true })
  environment?: string[];

  @ApiPropertyOptional(list('IUCN category of the headline (global, most recent) assessment'))
  @IsOptional() @Transform(csv) @IsArray() @ArrayMaxSize(9) @IsIn(s.iucnCategory.enumValues, { each: true })
  category?: string[];

  @ApiPropertyOptional(list('Country, sea or ocean slug. Location-sensitive species never match.'))
  @IsOptional() @Transform(csv) @IsArray() @ArrayMaxSize(20) @Matches(SLUG, { each: true })
  region?: string[];

  @ApiPropertyOptional(list('Habitat code'))
  @IsOptional() @Transform(csv) @IsArray() @ArrayMaxSize(20) @Matches(CODE, { each: true })
  habitat?: string[];

  @ApiPropertyOptional(list('Population trend of the headline assessment'))
  @IsOptional() @Transform(csv) @IsArray() @ArrayMaxSize(4) @IsIn(s.populationTrend.enumValues, { each: true })
  trend?: string[];

  @ApiPropertyOptional({ enum: SORTS, default: 'name', description: 'name, status (most threatened first; DD, NE and unassessed last), reviewed (newest first)' })
  @IsOptional()
  @IsIn(SORTS)
  sort?: (typeof SORTS)[number];

  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1, maximum: 1000 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  page?: number;

  @ApiPropertyOptional({ type: Number, default: 24, minimum: 1, maximum: MAX_PAGE_SIZE })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PAGE_SIZE)
  pageSize?: number;
}

export class CompareQuery {
  @ApiPropertyOptional({ type: String, description: '1 to 3 species slugs, comma-separated. Duplicates are ignored.' })
  @Transform(csv)
  @IsArray()
  @Matches(SLUG, { each: true })
  species!: string[];
}
