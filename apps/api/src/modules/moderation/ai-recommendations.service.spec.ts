import { AiRecommendationsService } from './ai-recommendations.service';
import { AiRecommendationsRepository } from './repositories/ai-recommendations.repository';
import { AiModerationProvider } from './ai/ai-moderation-provider';
import { ModerationEventPublisher, AiRecommendationCreatedEvent, AiRecommendationEvaluatedEvent } from './events/moderation-events';
import { ModerationCase } from './entities/moderation-case.entity';
import { AiRecommendation } from './entities/ai-recommendation.entity';
import {
  ModerationCaseSeverity,
  ModerationCaseSource,
  ModerationCaseStatus,
  ModerationDecision,
  ModerationTargetType,
} from './moderation.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

function makeCase(overrides: Partial<ModerationCase> = {}): ModerationCase {
  const c = new ModerationCase();
  c.id = 'c1';
  c.targetType = ModerationTargetType.MEDIA;
  c.targetId = 'm1';
  c.status = ModerationCaseStatus.OPEN;
  c.source = ModerationCaseSource.NEW_CONTENT;
  c.severity = ModerationCaseSeverity.LOW;
  c.priority = 0;
  c.reportCount = 0;
  c.assignedTo = null;
  c.claimedAt = null;
  c.decision = null;
  c.reason = null;
  c.resolvedBy = null;
  c.resolvedAt = null;
  c.aiScore = null;
  c.aiLabels = null;
  c.createdAt = new Date('2026-08-04T00:00:00Z');
  c.updatedAt = new Date('2026-08-04T00:00:00Z');
  return Object.assign(c, overrides);
}

function makeRecommendation(overrides: Partial<AiRecommendation> = {}): AiRecommendation {
  const r = new AiRecommendation();
  r.id = 'rec1';
  r.caseId = 'c1';
  r.provider = 'logging';
  r.model = 'shadow-fake-v1';
  r.decision = ModerationDecision.APPROVE;
  r.confidence = '0.750';
  r.labels = [];
  r.reasoning = 'fake';
  r.promptVersion = 'v1';
  r.createdAt = new Date('2026-08-04T00:00:00Z');
  r.evaluatedAt = null;
  r.moderatorDecision = null;
  r.matched = null;
  r.latencyMs = 5;
  r.metadata = null;
  return Object.assign(r, overrides);
}

describe('AiRecommendationsService (M7 — AI Shadow Mode)', () => {
  let repo: LooseMock<AiRecommendationsRepository>;
  let provider: LooseMock<AiModerationProvider>;
  let events: LooseMock<ModerationEventPublisher>;
  let service: AiRecommendationsService;

  beforeEach(() => {
    repo = createMock<AiRecommendationsRepository>({
      create: jest.fn(),
      findLatestByCase: jest.fn(),
      recordModeratorOutcome: jest.fn(),
      getStatistics: jest.fn(),
    });
    provider = createMock<AiModerationProvider>({ recommend: jest.fn() });
    events = createMock<ModerationEventPublisher>({ publish: jest.fn() });
    service = new AiRecommendationsService(repo, provider, events);
  });

  describe('generateRecommendation', () => {
    it('gọi provider ĐÚNG với caseId/targetType/targetId của case, persist qua repo.create(), trả về recommendation', async () => {
      const moderationCase = makeCase();
      provider.recommend.mockResolvedValue({
        provider: 'logging',
        model: 'shadow-fake-v1',
        decision: ModerationDecision.HIDE,
        confidence: 0.8,
        labels: ['x'],
        reasoning: 'r',
        promptVersion: 'v1',
        latencyMs: 3,
        metadata: { a: 1 },
      });
      const saved = makeRecommendation({ decision: ModerationDecision.HIDE });
      repo.create.mockResolvedValue(saved);

      const result = await service.generateRecommendation(moderationCase);

      expect(provider.recommend).toHaveBeenCalledWith({ caseId: 'c1', targetType: ModerationTargetType.MEDIA, targetId: 'm1' });
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          caseId: 'c1',
          provider: 'logging',
          model: 'shadow-fake-v1',
          decision: ModerationDecision.HIDE,
          confidence: 0.8,
          latencyMs: 3,
        }),
      );
      expect(result).toBe(saved);
    });

    it('phát ai.recommendation.created SAU khi persist', async () => {
      const moderationCase = makeCase();
      provider.recommend.mockResolvedValue({
        provider: 'logging',
        model: 'shadow-fake-v1',
        decision: ModerationDecision.APPROVE,
        confidence: 0.6,
        labels: [],
        reasoning: null,
        promptVersion: null,
        metadata: null,
      });
      const saved = makeRecommendation({ id: 'rec9' });
      repo.create.mockResolvedValue(saved);

      await service.generateRecommendation(moderationCase);

      expect(events.publish).toHaveBeenCalledWith(expect.any(AiRecommendationCreatedEvent));
      const published = events.publish.mock.calls[0][0] as AiRecommendationCreatedEvent;
      expect(published.recommendationId).toBe('rec9');
      expect(published.caseId).toBe('c1');
    });

    it('lỗi phát event KHÔNG throw — recommendation đã persist vẫn được trả về', async () => {
      const moderationCase = makeCase();
      provider.recommend.mockResolvedValue({
        provider: 'logging',
        model: 'shadow-fake-v1',
        decision: ModerationDecision.APPROVE,
        confidence: 0.6,
        labels: [],
        reasoning: null,
        promptVersion: null,
        metadata: null,
      });
      const saved = makeRecommendation();
      repo.create.mockResolvedValue(saved);
      events.publish.mockRejectedValue(new Error('broker down'));

      await expect(service.generateRecommendation(moderationCase)).resolves.toBe(saved);
    });

    it('KHÔNG gọi bất kỳ method nào chạm case/media/review — chỉ provider + repo của chính nó', async () => {
      const moderationCase = makeCase();
      provider.recommend.mockResolvedValue({
        provider: 'logging',
        model: 'shadow-fake-v1',
        decision: ModerationDecision.APPROVE,
        confidence: 0.6,
        labels: [],
        reasoning: null,
        promptVersion: null,
        metadata: null,
      });
      repo.create.mockResolvedValue(makeRecommendation());

      await service.generateRecommendation(moderationCase);

      // moderationCase object CHÍNH NÓ không bị mutate.
      expect(moderationCase.status).toBe(ModerationCaseStatus.OPEN);
      expect(moderationCase.decision).toBeNull();
    });
  });

  describe('evaluateModeratorDecision', () => {
    it('KHÔNG có recommendation nào cho case -> no-op, KHÔNG gọi recordModeratorOutcome/publish', async () => {
      repo.findLatestByCase.mockResolvedValue(null);

      await service.evaluateModeratorDecision('c1', ModerationDecision.APPROVE);

      expect(repo.recordModeratorOutcome).not.toHaveBeenCalled();
      expect(events.publish).not.toHaveBeenCalled();
    });

    it('recommendation ĐÃ evaluated trước đó -> no-op (không ghi đè lần evaluate đầu tiên)', async () => {
      repo.findLatestByCase.mockResolvedValue(makeRecommendation({ evaluatedAt: new Date('2026-08-01T00:00:00Z') }));

      await service.evaluateModeratorDecision('c1', ModerationDecision.APPROVE);

      expect(repo.recordModeratorOutcome).not.toHaveBeenCalled();
    });

    it('AI decision === moderator decision -> matched=true', async () => {
      repo.findLatestByCase.mockResolvedValue(makeRecommendation({ id: 'rec2', decision: ModerationDecision.HIDE }));

      await service.evaluateModeratorDecision('c1', ModerationDecision.HIDE);

      expect(repo.recordModeratorOutcome).toHaveBeenCalledWith(
        'rec2',
        expect.objectContaining({ moderatorDecision: ModerationDecision.HIDE, matched: true }),
      );
    });

    it('AI decision !== moderator decision -> matched=false', async () => {
      repo.findLatestByCase.mockResolvedValue(makeRecommendation({ id: 'rec3', decision: ModerationDecision.APPROVE }));

      await service.evaluateModeratorDecision('c1', ModerationDecision.REJECT);

      expect(repo.recordModeratorOutcome).toHaveBeenCalledWith(
        'rec3',
        expect.objectContaining({ moderatorDecision: ModerationDecision.REJECT, matched: false }),
      );
    });

    it('phát ai.recommendation.evaluated với đúng matched', async () => {
      repo.findLatestByCase.mockResolvedValue(makeRecommendation({ id: 'rec4', decision: ModerationDecision.APPROVE }));

      await service.evaluateModeratorDecision('c1', ModerationDecision.APPROVE);

      expect(events.publish).toHaveBeenCalledWith(expect.any(AiRecommendationEvaluatedEvent));
      const published = events.publish.mock.calls[0][0] as AiRecommendationEvaluatedEvent;
      expect(published.recommendationId).toBe('rec4');
      expect(published.matched).toBe(true);
    });

    it('lỗi recordModeratorOutcome PROPAGATE (caller — ModerationService — chịu trách nhiệm try/catch, không nuốt lỗi âm thầm ở đây)', async () => {
      repo.findLatestByCase.mockResolvedValue(makeRecommendation());
      repo.recordModeratorOutcome.mockRejectedValue(new Error('db down'));

      await expect(service.evaluateModeratorDecision('c1', ModerationDecision.APPROVE)).rejects.toThrow('db down');
    });
  });

  describe('getStatistics / findLatestByCase — uỷ quyền thuần cho repository', () => {
    it('getStatistics() gọi repo.getStatistics()', async () => {
      const stats = { totalRecommendations: 1 } as never;
      repo.getStatistics.mockResolvedValue(stats);
      await expect(service.getStatistics()).resolves.toBe(stats);
    });

    it('findLatestByCase() gọi repo.findLatestByCase()', async () => {
      const rec = makeRecommendation();
      repo.findLatestByCase.mockResolvedValue(rec);
      await expect(service.findLatestByCase('c1')).resolves.toBe(rec);
    });
  });
});
