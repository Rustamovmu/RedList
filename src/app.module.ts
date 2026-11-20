import { Module } from '@nestjs/common';
import { CatalogueModule } from './catalogue/catalogue.module';
import { DbModule } from './db/db.module';
import { EditorialModule } from './editorial/editorial.module';
import { HealthController } from './health/health.controller';
import { IdentityModule } from './identity/identity.module';

/**
 * R1 modules are added milestone by milestone (see docs/PLAN.md §12 and docs/ARCHITECTURE.md).
 * M1: identity, editorial, catalogue (profile). Later: geography, media, support-directory.
 */
@Module({
  imports: [DbModule, IdentityModule, EditorialModule, CatalogueModule],
  controllers: [HealthController],
})
export class AppModule {}
