import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module';
import { HealthController } from './health/health.controller';

/**
 * R1 modules are added milestone by milestone (see docs/PLAN.md §12):
 * catalogue, geography, editorial, identity, media, support-directory.
 */
@Module({
  imports: [DbModule],
  controllers: [HealthController],
})
export class AppModule {}
