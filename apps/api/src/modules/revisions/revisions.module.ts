import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WikiRevision } from './entities/wiki-revision.entity';
import { RevisionsRepository } from './repositories/revisions.repository';
import { RevisionsService } from './revisions.service';

// Module phiên bản (ADR-014). Không có controller riêng — endpoint lịch sử
// nằm dưới `places` (GET /places/:id/revisions, openapi listPlaceRevisions).
@Module({
  imports: [TypeOrmModule.forFeature([WikiRevision])],
  providers: [RevisionsRepository, RevisionsService],
  exports: [RevisionsService],
})
export class RevisionsModule {}
