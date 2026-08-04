import { Injectable, Logger } from '@nestjs/common';
import {
  AiModerationProvider,
  AiModerationRecommendationInput,
  AiModerationRecommendationResult,
} from './ai-moderation-provider';
import { ModerationDecision } from '../moderation.enums';

const PROVIDER_NAME = 'logging';
const MODEL_NAME = 'shadow-fake-v1';
const PROMPT_VERSION = 'shadow-fake-v1';

// Bốn giá trị hợp lý cho một gợi ý ĐẦU TIÊN trên một case còn mở (không có `restore` — restore chỉ
// có nghĩa để ĐẢO NGƯỢC một quyết định trước đó, không phải phán đoán ban đầu).
const CANDIDATE_DECISIONS = [
  ModerationDecision.APPROVE,
  ModerationDecision.REJECT,
  ModerationDecision.HIDE,
  ModerationDecision.DISMISS,
] as const;

// Hash chuỗi thuần, ổn định (không phụ thuộc runtime/platform) — KHÔNG dùng cho mục đích bảo mật,
// chỉ để suy ra một "gợi ý" xác định từ targetId, tránh Math.random() làm test không tái lập được.
function stableHash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

// Moderation M7 — AI Shadow Mode. Implementation MẶC ĐỊNH DUY NHẤT của `AiModerationProvider`
// (ADR-018-style D12: chỉ trừu tượng hoá, không adapter thật). Trả về một gợi ý GIẢ, XÁC ĐỊNH
// (deterministic) suy từ `targetId` — KHÔNG gọi OpenAI, Anthropic, hay bất kỳ HTTP endpoint ngoài
// nào. Chỉ ghi log có cấu trúc, cùng khuôn `LoggingModerationEventPublisher`/
// `LoggingBookingEventPublisher`.
@Injectable()
export class LoggingAiModerationProvider implements AiModerationProvider {
  private readonly logger = new Logger(LoggingAiModerationProvider.name);

  async recommend(input: AiModerationRecommendationInput): Promise<AiModerationRecommendationResult> {
    const start = Date.now();
    const hash = stableHash(`${input.targetType}:${input.targetId}`);
    const decision = CANDIDATE_DECISIONS[hash % CANDIDATE_DECISIONS.length];
    const confidence = Math.round((0.5 + (hash % 50) / 100) * 1000) / 1000; // 0.500..0.990

    const result: AiModerationRecommendationResult = {
      provider: PROVIDER_NAME,
      model: MODEL_NAME,
      decision,
      confidence,
      labels: decision === ModerationDecision.APPROVE ? [] : ['shadow_fake_flag'],
      reasoning:
        'Shadow-mode deterministic fake recommendation — no real AI model configured (M7, ADR-018 §13 phase 1).',
      promptVersion: PROMPT_VERSION,
      latencyMs: Date.now() - start,
      metadata: { targetType: input.targetType, targetId: input.targetId, deterministicHash: hash },
    };

    this.logger.log(
      `recommend case=${input.caseId} target=${input.targetType}:${input.targetId} -> ` +
        `decision=${result.decision} confidence=${result.confidence}`,
    );
    return result;
  }
}
