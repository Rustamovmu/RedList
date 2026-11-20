import { Module } from '@nestjs/common';
import { loadConfig } from '../config';
import { EditorialModule } from '../editorial/editorial.module';
import { PublicMediaController, StaffMediaController } from './media.controller';
import { MediaService } from './media.service';
import { LocalDiskStorage, STORAGE } from './storage';

/** Media upload, review and serving (M4). Storage is local disk in R1 (DECISIONS D-022). */
@Module({
  imports: [EditorialModule],
  controllers: [PublicMediaController, StaffMediaController],
  providers: [MediaService, { provide: STORAGE, useFactory: () => new LocalDiskStorage(loadConfig().MEDIA_DIR) }],
  exports: [MediaService, STORAGE],
})
export class MediaModule {}
