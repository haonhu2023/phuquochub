import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiRecommendation } from '../entities/ai-recommendation.entity';
import { ModerationDecision, ModerationTargetType } from '../moderation.enums';

export interface NewAiRecommendation {
  caseId: string;
  provider: string;
  model: string;
  decision: ModerationDecision;
  confidence: number;
  labels: string[] | null;
  reasoning: string | null;
  promptVersion: string | null;
  latencyMs: number | null;
  metadata: Record<string, unknown> | null;
}

export interface ModeratorOutcome {
  moderatorDecision: ModerationDecision;
  matched: boolean;
  evaluatedAt: Date;
}

export interface AiRecommendationStatistics {
  totalRecommendations: number;
  totalEvaluated: number;
  /** matched / evaluated — null nếu chưa có recommendation nào được evaluate. */
  agreementRate: number | null;
  /** trung bình confidence trên TOÀN BỘ recommendation (evaluated lẫn chưa). */
  averageConfidence: number | null;
  /** AI đề nghị gỡ (reject|hide) nhưng moderator giữ/khôi phục (approve|restore|dismiss). */
  falsePositives: number;
  /** AI đề nghị giữ (approve|restore|dismiss) nhưng moderator gỡ (reject|hide). */
  falseNegatives: number;
  byDecision: Array<{ decision: ModerationDecision; count: number; evaluatedCount: number; matchedCount: number }>;
  byTargetType: Array<{
    targetType: ModerationTargetType;
    count: number;
    evaluatedCount: number;
    matchedCount: number;
  }>;
}

// Repository `ai_recommendations` (Moderation M7 — AI Shadow Mode). CHỈ primitive lưu trữ — CRUD,
// tra cứu recommendation mới nhất của một case, ghi kết quả so sánh với quyết định moderator, và
// truy vấn thống kê tổng hợp. KHÔNG bao giờ đọc/ghi `moderation_cases`/`media`/`reviews` NGOÀI join
// CHỈ-ĐỌC phục vụ thống kê theo target_type (byTargetType) — không UPDATE nào chạm bảng khác bảng
// `ai_recommendations` ở bất cứ đâu trong file này.
@Injectable()
export class AiRecommendationsRepository {
  constructor(
    @InjectRepository(AiRecommendation)
    private readonly repo: Repository<AiRecommendation>,
  ) {}

  findById(id: string): Promise<AiRecommendation | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** Recommendation mới nhất của một case (nhiều lần chạy AI trên cùng case là hợp lệ — chỉ lần
   * gần nhất mới được so sánh với quyết định moderator, xem AiRecommendationsService). */
  findLatestByCase(caseId: string): Promise<AiRecommendation | null> {
    return this.repo.findOne({ where: { caseId }, order: { createdAt: 'DESC' } });
  }

  async create(data: NewAiRecommendation): Promise<AiRecommendation> {
    const entity = this.repo.create({
      caseId: data.caseId,
      provider: data.provider,
      model: data.model,
      decision: data.decision,
      confidence: data.confidence.toFixed(3),
      labels: data.labels,
      reasoning: data.reasoning,
      promptVersion: data.promptVersion,
      latencyMs: data.latencyMs,
      metadata: data.metadata,
    });
    return this.repo.save(entity);
  }

  /** Ghi kết quả so sánh — CHỈ đổi 3 cột (evaluated_at/moderator_decision/matched) trên ĐÚNG một
   * dòng recommendation. KHÔNG chạm case/media/review. */
  async recordModeratorOutcome(id: string, data: ModeratorOutcome): Promise<void> {
    await this.repo.update(
      { id },
      { moderatorDecision: data.moderatorDecision, matched: data.matched, evaluatedAt: data.evaluatedAt },
    );
  }

  /**
   * Thống kê tổng hợp — agreement rate, confidence trung bình, false positive/negative, breakdown
   * theo decision và theo target_type. `byTargetType` là JOIN CHỈ-ĐỌC sang `moderation_cases` (cần
   * target_type, không denormalize lên `ai_recommendations` — case_id đã đủ tra ngược, tránh một
   * nguồn sự thật thứ hai cho target_type của chính case đó).
   */
  async getStatistics(): Promise<AiRecommendationStatistics> {
    const totals: Array<{
      total: string;
      evaluated: string;
      matched: string;
      avg_confidence: string | null;
      false_positives: string;
      false_negatives: string;
    }> = await this.repo.query(`
      SELECT
        count(*) AS total,
        count(*) FILTER (WHERE evaluated_at IS NOT NULL) AS evaluated,
        count(*) FILTER (WHERE matched IS TRUE) AS matched,
        avg(confidence) AS avg_confidence,
        count(*) FILTER (
          WHERE evaluated_at IS NOT NULL
            AND decision IN ('reject','hide')
            AND moderator_decision IN ('approve','restore','dismiss')
        ) AS false_positives,
        count(*) FILTER (
          WHERE evaluated_at IS NOT NULL
            AND decision IN ('approve','restore','dismiss')
            AND moderator_decision IN ('reject','hide')
        ) AS false_negatives
      FROM ai_recommendations
    `);
    const t = totals[0];
    const totalEvaluated = Number(t.evaluated);

    const byDecisionRows: Array<{ decision: ModerationDecision; count: string; evaluated_count: string; matched_count: string }> =
      await this.repo.query(`
        SELECT decision,
               count(*) AS count,
               count(*) FILTER (WHERE evaluated_at IS NOT NULL) AS evaluated_count,
               count(*) FILTER (WHERE matched IS TRUE) AS matched_count
        FROM ai_recommendations
        GROUP BY decision
        ORDER BY decision
      `);

    const byTargetTypeRows: Array<{
      target_type: ModerationTargetType;
      count: string;
      evaluated_count: string;
      matched_count: string;
    }> = await this.repo.query(`
      SELECT c.target_type AS target_type,
             count(*) AS count,
             count(*) FILTER (WHERE r.evaluated_at IS NOT NULL) AS evaluated_count,
             count(*) FILTER (WHERE r.matched IS TRUE) AS matched_count
      FROM ai_recommendations r
      JOIN moderation_cases c ON c.id = r.case_id
      GROUP BY c.target_type
      ORDER BY c.target_type
    `);

    return {
      totalRecommendations: Number(t.total),
      totalEvaluated,
      agreementRate: totalEvaluated > 0 ? Number(t.matched) / totalEvaluated : null,
      averageConfidence: t.avg_confidence !== null ? Number(t.avg_confidence) : null,
      falsePositives: Number(t.false_positives),
      falseNegatives: Number(t.false_negatives),
      byDecision: byDecisionRows.map((r) => ({
        decision: r.decision,
        count: Number(r.count),
        evaluatedCount: Number(r.evaluated_count),
        matchedCount: Number(r.matched_count),
      })),
      byTargetType: byTargetTypeRows.map((r) => ({
        targetType: r.target_type,
        count: Number(r.count),
        evaluatedCount: Number(r.evaluated_count),
        matchedCount: Number(r.matched_count),
      })),
    };
  }
}
