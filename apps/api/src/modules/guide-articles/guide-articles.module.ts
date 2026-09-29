import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GuideArticle } from './entities/guide-article.entity';
import { GuideBlock } from './entities/guide-block.entity';
import { Media } from '../media/entities/media.entity';
import { GuideArticlesService } from './guide-articles.service';
import { GuideArticlesPublicController, GuideArticlesAdminController } from './guide-articles.controller';
import { RevisionsModule } from '../revisions/revisions.module';
import { OwnerDecisionQueueModule } from '../owner-decision-queue/owner-decision-queue.module';
import { ModerationCoreModule } from '../moderation/moderation-core.module';

// Phú Quốc Guide CMS candidate (2026-09-18). MediaUrlModule/AuditModule are @Global() — not listed
// here, same precedent as OwnerDecisionQueueModule's own comment for AuditModule.
//
// ModerationCoreModule (not the full ModerationModule) — 2026-09-27, closes the "guide media never
// gets a moderation case" P0: it's the dependency-free leaf module MediaModule itself imports for
// exactly this reason (see that module's own header comment on the cycle it avoids), so importing
// it here creates no new cycle.
@Module({
  imports: [
    TypeOrmModule.forFeature([GuideArticle, GuideBlock, Media]),
    RevisionsModule,
    OwnerDecisionQueueModule,
    ModerationCoreModule,
  ],
  controllers: [GuideArticlesPublicController, GuideArticlesAdminController],
  providers: [GuideArticlesService],
  exports: [GuideArticlesService],
})
export class GuideArticlesModule {}
