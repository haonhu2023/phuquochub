import { AiRecommendation } from './entities/ai-recommendation.entity';

// M7 (AI Shadow Mode). Khớp data-dictionary snake_case, cùng quy ước moderation.mapper.ts. KHÔNG
// trường nào ám chỉ hành động đã xảy ra trên nội dung — response chỉ là một gợi ý đã lưu.
export interface AiRecommendationResponse {
  id: string;
  case_id: string;
  provider: string;
  model: string;
  decision: string;
  confidence: number;
  labels: unknown | null;
  reasoning: string | null;
  prompt_version: string | null;
  created_at: string;
  evaluated_at: string | null;
  moderator_decision: string | null;
  matched: boolean | null;
  latency_ms: number | null;
  metadata: Record<string, unknown> | null;
}

export function toAiRecommendationResponse(r: AiRecommendation): AiRecommendationResponse {
  return {
    id: r.id,
    case_id: r.caseId,
    provider: r.provider,
    model: r.model,
    decision: r.decision,
    confidence: Number(r.confidence),
    labels: r.labels,
    reasoning: r.reasoning,
    prompt_version: r.promptVersion,
    created_at: r.createdAt.toISOString(),
    evaluated_at: r.evaluatedAt ? r.evaluatedAt.toISOString() : null,
    moderator_decision: r.moderatorDecision,
    matched: r.matched,
    latency_ms: r.latencyMs,
    metadata: r.metadata,
  };
}
