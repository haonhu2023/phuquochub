import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GuideArticle } from './entities/guide-article.entity';
import { GuideBlock } from './entities/guide-block.entity';
import { Media } from '../media/entities/media.entity';
import { GuideArticlesService } from './guide-articles.service';
import { GuideArticlesPublicController, GuideArticlesAdminController } from './guide-articles.controller';
import { RevisionsModule } from '../revisions/revisions.module';
import { OwnerDecisionQueueModule } from '../owner-decision-queue/owner-decision-queue.module';

// Phú Quốc Guide CMS candidate (2026-09-18). MediaUrlModule/AuditModule are @Global() — not listed
// here, same precedent as OwnerDecisionQueueModule's own comment for AuditModule.
@Module({
  imports: [
    TypeOrmModule.forFeature([GuideArticle, GuideBlock, Media]),
    RevisionsModule,
    OwnerDecisionQueueModule,
  ],
  controllers: [GuideArticlesPublicController, GuideArticlesAdminController],
  providers: [GuideArticlesService],
  exports: [GuideArticlesService],
})
export class GuideArticlesModule {}
