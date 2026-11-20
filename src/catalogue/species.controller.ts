import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SpeciesProfileDto } from './dto';
import { PublishedSpeciesRepository } from './published-species.repository';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

@ApiTags('catalogue')
@Controller('species')
export class SpeciesController {
  constructor(private readonly published: PublishedSpeciesRepository) {}

  /** A published species profile. Unpublished, archived and unknown slugs are all 404. */
  @Get(':slug')
  @ApiOkResponse({ type: SpeciesProfileDto })
  @ApiNotFoundResponse({ description: 'No published species with this slug' })
  async profile(@Param('slug') slug: string): Promise<SpeciesProfileDto> {
    const profile = SLUG.test(slug) && slug.length <= 120 ? await this.published.findProfileBySlug(slug) : null;
    if (!profile) throw new NotFoundException('Species not found');
    return profile;
  }
}
