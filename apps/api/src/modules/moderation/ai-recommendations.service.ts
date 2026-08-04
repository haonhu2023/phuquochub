import { Inject, Injectable, Logger } from '@nestjs/common';
import { AiRecommendation } from './entities/ai-recommendation.entity';
import { ModerationCase } from './entities/moderation-case.entity';
import { AiRecommendationsRepository, AiRecommendationStatistics } from './repositories/ai-recommendations.repository';
import { AI_MODERATION_PROVIDER, AiModerationProvider } from './ai/ai-moderation-provider';
import {
  AiRecommendationCreatedEvent,
  AiRecommendationEvaluatedEvent,
  MODERATION_EVENT_PUBLISHER,
  ModerationEventPublisher,
} from './events/moderation-events';
import { ModerationDecision } from './moderation.enums';

// Moderation M7 — AI Shadow Mode. TOÀN BỘ bề mặt ghi của service này là bảng `ai_recommendations`
// (qua AiRecommendationsRepository) — KHÔNG UPDATE `moderation_cases`/`media`/`reviews`, KHÔNG gọi
// `assertValidMediaTransition`/`assertValidReviewTransition` hay bất kỳ FSM nào. "Shadow" nghĩa là
// service này CHỈ QUAN SÁT (đọc case được truyền vào, gọi AI, lưu gợi ý) — nó không bao giờ là một
// bước bắt buộc trong T1/T2/T3, và lỗi ở đây không bao giờ được phép cản một quyết định kiểm duyệt
// thật (xem cách ModerationService.emitPostCommit gọi evaluateModeratorDecision() trong try/catch).
@Injectable()
export class AiRecommendationsService {
  private readonly logger = new Logger(AiRecommendationsService.name);

  constructor(
    private readonly repo: AiRecommendationsRepository,
    @Inject(AI_MODERATION_PROVIDER)
    private readonly provider: AiModerationProvider,
    @Inject(MODERATION_EVENT_PUBLISHER)
    private readonly events: ModerationEventPublisher,
  ) {}

  /**
   * Nhận một `ModerationCase` ĐÃ TỒN TẠI (caller — controller — chịu trách nhiệm load nó, cùng
   * nguyên tắc `ModerationService.decide()` nhận `caseId` rồi tự load trong transaction của NÓ,
   * không phải của đây). Gọi provider, persist MỘT dòng `ai_recommendations` mới, trả về dòng đó.
   * KHÔNG transaction — chỉ một INSERT, không có bất biến đa-bảng nào cần bảo vệ.
   */
  async generateRecommendation(moderationCase: ModerationCase): Promise<AiRecommendation> {
    const start = Date.now();
    const result = await this.provider.recommend({
      caseId: moderationCase.id,
      targetType: moderationCase.targetType,
      targetId: moderationCase.targetId,
    });

    const recommendation = await this.repo.create({
      caseId: moderationCase.id,
      provider: result.provider,
      model: result.model,
      decision: result.decision,
      confidence: result.confidence,
      labels: result.labels,
      reasoning: result.reasoning,
      promptVersion: result.promptVersion,
      latencyMs: result.latencyMs ?? Date.now() - start,
      metadata: result.metadata ?? null,
    });

    try {
      await this.events.publish(
        new AiRecommendationCreatedEvent(recommendation.id, moderationCase.id, recommendation.decision),
      );
    } catch (err) {
      this.logger.error(
        `Phát event ai.recommendation.created cho case ${moderationCase.id} thất bại: ${(err as Error).message}`,
      );
    }

    return recommendation;
  }

  /**
   * Gọi SAU KHI ModerationService.decide() (T2) đã COMMIT — cùng nguyên tắc INV-9 (audit/event chỉ
   * sau commit). So sánh recommendation MỚI NHẤT của case (nếu có) với quyết định thật của
   * moderator; ghi `matched`/`evaluated_at`/`moderator_decision` — ĐÚNG MỘT UPDATE, một bảng, không
   * có gì khác bị chạm. No-op nếu case chưa có recommendation nào, hoặc recommendation mới nhất đã
   * được evaluate trước đó (case reopen + quyết định lại KHÔNG ghi đè lần evaluate đầu tiên — giữ
   * nguyên phép đo "AI đoán đúng lần quyết định đầu tiên hay không").
   */
  async evaluateModeratorDecision(caseId: string, moderatorDecision: ModerationDecision): Promise<void> {
    const latest = await this.repo.findLatestByCase(caseId);
    if (!latest || latest.evaluatedAt !== null) {
      return;
    }

    const matched = latest.decision === moderatorDecision;
    const evaluatedAt = new Date();
    await this.repo.recordModeratorOutcome(latest.id, { moderatorDecision, matched, evaluatedAt });

    try {
      await this.events.publish(new AiRecommendationEvaluatedEvent(latest.id, caseId, matched));
    } catch (err) {
      this.logger.error(
        `Phát event ai.recommendation.evaluated cho case ${caseId} thất bại: ${(err as Error).message}`,
      );
    }
  }

  findLatestByCase(caseId: string): Promise<AiRecommendation | null> {
    return this.repo.findLatestByCase(caseId);
  }

  /** Repository + service ONLY (M7 spec) — KHÔNG có endpoint/dashboard nào lộ hàm này ra HTTP. */
  getStatistics(): Promise<AiRecommendationStatistics> {
    return this.repo.getStatistics();
  }
}
