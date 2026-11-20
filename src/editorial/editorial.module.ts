import { Module } from '@nestjs/common';
import { EditorialController } from './editorial.controller';
import { EditorialService } from './editorial.service';
import { RevalidationService } from './revalidation.service';
import { RevisionContentRepository } from './revision-content.repository';

@Module({
  controllers: [EditorialController],
  providers: [EditorialService, RevisionContentRepository, RevalidationService],
  exports: [EditorialService],
})
export class EditorialModule {}
