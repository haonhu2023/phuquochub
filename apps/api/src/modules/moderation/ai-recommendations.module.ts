import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiRecommendation } from './entities/ai-recommendation.entity';
import { AiRecommendationsRepository } from './repositories/ai-recommendations.repository';
import { AiRecommendationsService } from './ai-recommendations.service';
import { AiRecommendationsController } from './ai-recommendations.controller';
import { ModerationCoreModule } from './moderation-core.module';
import { AI_MODERATION_PROVIDER } from './ai/ai-moderation-provider';
import { LoggingAiModerationProvider } from './ai/logging-ai-moderation-provider';

// Moderation M7 — AI Shadow Mode. Imports CHỈ `ModerationCoreModule` (cho
// `ModerationCasesRepository` — controller cần load case trước khi generate — và
// `MODERATION_EVENT_PUBLISHER`, tái dùng, KHÔNG token event thứ hai). KHÔNG import MediaModule/
// PlacesModule/RbacModule/ModerationModule — module này KHÔNG bao giờ chạm FSM hay quyết định,
// nên không cần bất kỳ phụ thuộc nào của chúng.
//
// `ModerationModule` import module NÀY (để `ModerationService` gọi
// `AiRecommendationsService.evaluateModeratorDecision()` SAU KHI T2 commit) — một chiều, module
// này KHÔNG import lại `ModerationModule`, nên không có cycle.
@Module({
  imports: [TypeOrmModule.forFeature([AiRecommendation]), ModerationCoreModule],
  controllers: [AiRecommendationsController],
  providers: [
    AiRecommendationsRepository,
    AiRecommendationsService,
    { provide: AI_MODERATION_PROVIDER, useClass: LoggingAiModerationProvider },
  ],
  exports: [AiRecommendationsService, AiRecommendationsRepository],
})
export class AiRecommendationsModule {}
