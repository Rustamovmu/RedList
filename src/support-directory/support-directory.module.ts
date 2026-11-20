import { Module } from '@nestjs/common';
import { EditorialModule } from '../editorial/editorial.module';
import { StaffSupportController, SupportController } from './support-directory.controller';
import { SupportDirectoryService } from './support-directory.service';

/** Organizations and support links: public directory plus the admin workflow (M3). */
@Module({
  imports: [EditorialModule],
  controllers: [SupportController, StaffSupportController],
  providers: [SupportDirectoryService],
  exports: [SupportDirectoryService],
})
export class SupportDirectoryModule {}
