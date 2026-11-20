import { BadRequestException, Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { comparePopulations } from './compare';
import { CompareDto, FiltersDto, PublicSourceDto, SitemapDto, SpeciesListDto, SpeciesProfileDto } from './dto';
import { CompareQuery, ListSpeciesQuery } from './list-query.dto';
import { PublishedSpeciesRepository } from './published-species.repository';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_COMPARE = 3;

/** Public catalogue. Published data only; everything here reads through PublishedSpeciesRepository. */
@ApiTags('catalogue')
@Controller()
export class SpeciesController {
  constructor(private readonly published: PublishedSpeciesRepository) {}

  /** Search, filter, sort and page published species. */
  @Get('species')
  @ApiOkResponse({ type: SpeciesListDto })
  @ApiBadRequestResponse({ description: 'Invalid filter value or pageSize above 48' })
  list(@Query() q: ListSpeciesQuery): Promise<SpeciesListDto> {
    return this.published.list(q);
  }

  /** A published species profile. Unpublished, archived and unknown slugs are all 404. */
  @Get('species/:slug')
  @ApiOkResponse({ type: SpeciesProfileDto })
  @ApiNotFoundResponse({ description: 'No published species with this slug' })
  async profile(@Param('slug') slug: string): Promise<SpeciesProfileDto> {
    const profile = SLUG.test(slug) && slug.length <= 120 ? await this.published.findProfileBySlug(slug) : null;
    if (!profile) throw new NotFoundException('Species not found');
    return profile;
  }

  /** Filter options with counts of published species in this catalogue. */
  @Get('filters')
  @ApiOkResponse({ type: FiltersDto })
  filters(): Promise<FiltersDto> {
    return this.published.filters();
  }

  /** Up to 3 published species side by side. No score and no winner; population comparability is stated, never computed. */
  @Get('compare')
  @ApiOkResponse({ type: CompareDto })
  @ApiBadRequestResponse({ description: 'Not 1 to 3 distinct valid slugs' })
  @ApiNotFoundResponse({ description: 'A slug is not a published species' })
  async compare(@Query() q: CompareQuery): Promise<CompareDto> {
    const slugs = q.species ?? [];
    if (slugs.length < 1 || slugs.length > MAX_COMPARE) {
      throw new BadRequestException({ code: 'BAD_REQUEST', message: `Compare takes 1 to ${MAX_COMPARE} species` });
    }
    const profiles = await Promise.all(slugs.map((s) => this.published.findProfileBySlug(s)));
    const missing = slugs.filter((_, i) => !profiles[i]);
    if (missing.length) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Species not found', details: missing });
    const species = profiles as SpeciesProfileDto[];
    return { species, population: comparePopulations(species) };
  }

  /** Every source cited by published content, with the species that cite it (the public /sources page). */
  @Get('sources')
  @ApiOkResponse({ type: [PublicSourceDto] })
  sources(): Promise<PublicSourceDto[]> {
    return this.published.sources();
  }

  /** Published species slugs with publication dates, and region slugs, for sitemap.xml. */
  @Get('sitemap')
  @ApiOkResponse({ type: SitemapDto })
  sitemap(): Promise<SitemapDto> {
    return this.published.sitemap();
  }
}
