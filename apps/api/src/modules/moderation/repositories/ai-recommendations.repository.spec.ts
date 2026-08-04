import { Repository } from 'typeorm';
import { AiRecommendationsRepository } from './ai-recommendations.repository';
import { AiRecommendation } from '../entities/ai-recommendation.entity';
import { ModerationDecision, ModerationTargetType } from '../moderation.enums';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

describe('AiRecommendationsRepository', () => {
  let repo: LooseMock<Repository<AiRecommendation>>;
  let sut: AiRecommendationsRepository;

  beforeEach(() => {
    repo = createMock<Repository<AiRecommendation>>({
      findOne: jest.fn(),
      create: jest.fn((x) => x as AiRecommendation),
      save: jest.fn(),
      update: jest.fn(),
      query: jest.fn(),
    });
    sut = new AiRecommendationsRepository(repo);
  });

  describe('findById', () => {
    it('tra theo id', async () => {
      await sut.findById('rec1');
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'rec1' } });
    });
  });

  describe('findLatestByCase', () => {
    it('lọc theo caseId, sắp xếp createdAt DESC (mới nhất trước)', async () => {
      await sut.findLatestByCase('c1');
      expect(repo.findOne).toHaveBeenCalledWith({ where: { caseId: 'c1' }, order: { createdAt: 'DESC' } });
    });
  });

  describe('create', () => {
    it('làm tròn confidence về chuỗi 3 chữ số thập phân, save() đúng dữ liệu', async () => {
      repo.save.mockResolvedValue({ id: 'rec1' });

      await sut.create({
        caseId: 'c1',
        provider: 'logging',
        model: 'shadow-fake-v1',
        decision: ModerationDecision.APPROVE,
        confidence: 0.5,
        labels: [],
        reasoning: 'r',
        promptVersion: 'v1',
        latencyMs: 5,
        metadata: null,
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ caseId: 'c1', confidence: '0.500', decision: ModerationDecision.APPROVE }),
      );
      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe('recordModeratorOutcome', () => {
    it('CHỈ update evaluated_at/moderator_decision/matched trên đúng id', async () => {
      const evaluatedAt = new Date('2026-08-04T00:00:00Z');
      await sut.recordModeratorOutcome('rec1', {
        moderatorDecision: ModerationDecision.HIDE,
        matched: false,
        evaluatedAt,
      });

      expect(repo.update).toHaveBeenCalledWith(
        { id: 'rec1' },
        { moderatorDecision: ModerationDecision.HIDE, matched: false, evaluatedAt },
      );
    });
  });

  describe('getStatistics', () => {
    it('tổng hợp agreementRate/averageConfidence/falsePositives/falseNegatives + breakdown theo decision/target_type', async () => {
      repo.query.mockImplementation((sql: string) => {
        if (sql.includes('GROUP BY decision')) {
          return Promise.resolve([
            { decision: 'approve', count: '5', evaluated_count: '4', matched_count: '3' },
            { decision: 'hide', count: '5', evaluated_count: '4', matched_count: '3' },
          ]);
        }
        if (sql.includes('GROUP BY c.target_type')) {
          return Promise.resolve([
            { target_type: 'media', count: '7', evaluated_count: '6', matched_count: '4' },
            { target_type: 'review', count: '3', evaluated_count: '2', matched_count: '2' },
          ]);
        }
        // Truy vấn tổng — duy nhất KHÔNG có GROUP BY trong 3 câu getStatistics() phát ra.
        return Promise.resolve([
          {
            total: '10',
            evaluated: '8',
            matched: '6',
            avg_confidence: '0.735',
            false_positives: '1',
            false_negatives: '1',
          },
        ]);
      });

      const stats = await sut.getStatistics();

      expect(stats.totalRecommendations).toBe(10);
      expect(stats.totalEvaluated).toBe(8);
      expect(stats.agreementRate).toBeCloseTo(6 / 8);
      expect(stats.averageConfidence).toBeCloseTo(0.735);
      expect(stats.falsePositives).toBe(1);
      expect(stats.falseNegatives).toBe(1);
      expect(stats.byDecision).toEqual([
        { decision: 'approve', count: 5, evaluatedCount: 4, matchedCount: 3 },
        { decision: 'hide', count: 5, evaluatedCount: 4, matchedCount: 3 },
      ]);
      expect(stats.byTargetType).toEqual([
        { targetType: ModerationTargetType.MEDIA, count: 7, evaluatedCount: 6, matchedCount: 4 },
        { targetType: ModerationTargetType.REVIEW, count: 3, evaluatedCount: 2, matchedCount: 2 },
      ]);
    });

    it('agreementRate/averageConfidence = null khi CHƯA có recommendation nào evaluated/tồn tại', async () => {
      repo.query.mockImplementation((sql: string) => {
        if (sql.includes('GROUP BY')) {
          return Promise.resolve([]);
        }
        return Promise.resolve([
          { total: '0', evaluated: '0', matched: '0', avg_confidence: null, false_positives: '0', false_negatives: '0' },
        ]);
      });

      const stats = await sut.getStatistics();

      expect(stats.agreementRate).toBeNull();
      expect(stats.averageConfidence).toBeNull();
      expect(stats.byDecision).toEqual([]);
      expect(stats.byTargetType).toEqual([]);
    });
  });
});
