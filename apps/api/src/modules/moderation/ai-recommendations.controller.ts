import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { ModerationCasesRepository } from './repositories/moderation-cases.repository';
import { AiRecommendationsService } from './ai-recommendations.service';
import { toAiRecommendationResponse } from './ai-recommendation.mapper';

// M7 (AI Shadow Mode). Route dưới ĐÚNG prefix `/moderation/cases/{id}` đã có (M2/M3/M4) nhưng ở
// MỘT controller riêng — `AiRecommendationsService`/`AiRecommendationsRepository` sống trong
// `AiRecommendationsModule` (leaf, không phụ thuộc MediaModule/PlacesModule/RbacModule như
// `ModerationModule`), tách bạch để `ModerationModule` chỉ cần IMPORT nó (cho post-commit
// evaluateModeratorDecision() ở ModerationService), không cần export ngược lại.
//
// KHÔNG quyền mới: `POST` tái dùng `AI.ModerateMedia` (D10 — quyền vốn dành cho ai_agent "chỉ gắn
// cờ", generalize tự nhiên sang "chỉ gợi ý shadow", không bao giờ quyết định — cùng tinh thần
// INV-7). `GET` tái dùng `Moderation.Queue.View` (đọc hàng chờ đã có, cùng quyền mọi endpoint đọc
// khác của module này).
@Controller('moderation/cases/:caseId/ai-recommendation')
export class AiRecommendationsController {
  constructor(
    private readonly casesRepo: ModerationCasesRepository,
    private readonly service: AiRecommendationsService,
  ) {}

  @Post()
  @RequirePermissions('AI.ModerateMedia')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async generate(@Param('caseId', ParseUUIDPipe) caseId: string) {
    const found = await this.casesRepo.findById(caseId);
    if (!found) {
      throw new NotFoundException('Không tìm thấy case kiểm duyệt');
    }
    const recommendation = await this.service.generateRecommendation(found);
    return toAiRecommendationResponse(recommendation);
  }

  @Get()
  @RequirePermissions('Moderation.Queue.View')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async getLatest(@Param('caseId', ParseUUIDPipe) caseId: string) {
    const found = await this.casesRepo.findById(caseId);
    if (!found) {
      throw new NotFoundException('Không tìm thấy case kiểm duyệt');
    }
    const latest = await this.service.findLatestByCase(caseId);
    if (!latest) {
      throw new NotFoundException('Case này chưa có gợi ý AI nào');
    }
    return toAiRecommendationResponse(latest);
  }
}
