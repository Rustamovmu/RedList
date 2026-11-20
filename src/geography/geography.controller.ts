import { BadRequestException, Controller, Get, Header, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Db, InjectDb } from '../db/db.module';
import { Bbox, BboxError, parseBbox } from './bbox';
import { BasemapDto, MapDto, MapQuery, RegionPageDto, RegionQuery } from './dto';
import { GeoRepository, MAP_MAX_SPECIES, MAP_MAX_VERTICES } from './geo.repository';
import { RegionsService } from './regions.service';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Public geography: map, basemap and region pages. Published data only. */
@ApiTags('geography')
@Controller()
export class GeographyController {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly geo: GeoRepository,
    private readonly regions: RegionsService,
  ) {}

  /** Published species in a viewport, with the layers that place them ("Country-level presence" or "Published range map"). */
  @Get('map')
  @ApiOkResponse({ type: MapDto })
  @ApiBadRequestResponse({ description: 'BAD_BBOX: bbox is not four numbers in range with south < north and west ≠ east' })
  async map(@Query() q: MapQuery): Promise<MapDto> {
    let bbox: Bbox;
    try {
      bbox = parseBbox(q.bbox);
    } catch (e) {
      if (e instanceof BboxError) throw new BadRequestException({ code: 'BAD_BBOX', message: e.message });
      throw e;
    }
    const result = await this.geo.mapQuery(this.db, bbox, { group: q.group, category: q.category, slugs: q.species ? [q.species] : undefined });
    return {
      bbox: [bbox.west, bbox.south, bbox.east, bbox.north],
      ...result,
      limits: { maxSpecies: MAP_MAX_SPECIES, maxVertices: MAP_MAX_VERTICES },
    };
  }

  /** The R1 basemap: Natural Earth 1:110m countries, seas and oceans (public domain). No tile provider is used. */
  @Get('map/basemap')
  @Header('Cache-Control', 'public, max-age=86400')
  @ApiOkResponse({ type: BasemapDto })
  async basemap(): Promise<BasemapDto> {
    const rows = await this.geo.basemap(this.db);
    return {
      type: 'FeatureCollection',
      attribution: 'Boundaries: Natural Earth (public domain)',
      features: rows.map((r) => ({ type: 'Feature', properties: { slug: r.slug, name: r.name, kind: r.kind }, geometry: r.geometry })),
    };
  }

  /** A country, sea or ocean with the published species recorded there. */
  @Get('regions/:slug')
  @ApiOkResponse({ type: RegionPageDto })
  @ApiNotFoundResponse({ description: 'No region with this slug' })
  async region(@Param('slug') slug: string, @Query() q: RegionQuery): Promise<RegionPageDto> {
    const page = SLUG.test(slug) && slug.length <= 120 ? await this.regions.page(slug, q) : null;
    if (!page) throw new NotFoundException('Region not found');
    return page;
  }
}
