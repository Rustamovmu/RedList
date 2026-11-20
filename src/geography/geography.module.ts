import { Global, Module } from '@nestjs/common';
import { GeographyController } from './geography.controller';
import { GeoRepository } from './geo.repository';
import { RegionsService } from './regions.service';

/** Regions, map and GeoRepository (the only home of spatial SQL). Global so editorial can store ranges through it. */
@Global()
@Module({
  controllers: [GeographyController],
  providers: [GeoRepository, RegionsService],
  exports: [GeoRepository],
})
export class GeographyModule {}
