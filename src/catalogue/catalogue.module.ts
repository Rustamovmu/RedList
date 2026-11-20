import { Module } from '@nestjs/common';
import { PublishedSpeciesRepository } from './published-species.repository';
import { SpeciesController } from './species.controller';

/** Public, published-only reads. */
@Module({
  controllers: [SpeciesController],
  providers: [PublishedSpeciesRepository],
})
export class CatalogueModule {}
