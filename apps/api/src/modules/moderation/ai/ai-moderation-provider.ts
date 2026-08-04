import { ModerationDecision, ModerationTargetType } from '../moderation.enums';

// Moderation M7 — AI Shadow Mode. Port duy nhất mà `AiRecommendationsService` phụ thuộc — cùng
// hình dạng provider-agnostic của `StorageService`/`MODERATION_EVENT_PUBLISHER`: một triển khai
// thật (OpenAI/Anthropic/Rekognition/model tự host) thay thế được qua DI token dưới đây mà KHÔNG
// đụng logic service. Chưa có triển khai thật nào trong milestone này (chỉ "shadow" — xem
// LoggingAiModerationProvider, implementation MẶC ĐỊNH duy nhất).
export interface AiModerationRecommendationInput {
  caseId: string;
  targetType: ModerationTargetType;
  targetId: string;
}

export interface AiModerationRecommendationResult {
  provider: string;
  model: string;
  decision: ModerationDecision;
  /** 0..1 */
  confidence: number;
  labels: string[] | null;
  reasoning: string | null;
  promptVersion: string | null;
  /** Tuỳ chọn — nếu provider không tự đo, service tự tính bằng wall-clock quanh lời gọi. */
  latencyMs?: number;
  metadata?: Record<string, unknown> | null;
}

export interface AiModerationProvider {
  recommend(input: AiModerationRecommendationInput): Promise<AiModerationRecommendationResult>;
}

export const AI_MODERATION_PROVIDER = Symbol('AI_MODERATION_PROVIDER');
