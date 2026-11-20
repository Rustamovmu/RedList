import { Module } from '@nestjs/common';
import { CatalogueModule } from './catalogue/catalogue.module';
import { DbModule } from './db/db.module';
import { EditorialModule } from './editorial/editorial.module';
import { GeographyModule } from './geography/geography.module';
import { HealthController } from './health/health.controller';
import { IdentityModule } from './identity/identity.module';
import { MediaModule } from './media/media.module';
import { SupportDirectoryModule } from './support-directory/support-directory.module';

/**
 * R1 modules are added milestone by milestone (see docs/PLAN.md §12 and docs/ARCHITECTURE.md).
 * M1: identity, editorial, catalogue. M3: geography, support-directory. M4: media.
 */
@Module({
  imports: [DbModule, IdentityModule, GeographyModule, EditorialModule, CatalogueModule, SupportDirectoryModule, MediaModule],
  controllers: [HealthController],
})
export class AppModule {}
