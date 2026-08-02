import { EntityManager, In, Repository } from 'typeorm';
import { ModerationCasesRepository } from './moderation-cases.repository';
import { ModerationCase } from '../entities/moderation-case.entity';
import {
  ModerationCaseSeverity,
  ModerationCaseSource,
  ModerationCaseStatus,
  ModerationTargetType,
} from '../moderation.enums';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

function sql(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

describe('ModerationCasesRepository', () => {
  let repo: LooseMock<Repository<ModerationCase>>;
  let sut: ModerationCasesRepository;

  beforeEach(() => {
    repo = createMock<Repository<ModerationCase>>({ findOne: jest.fn() });
    sut = new ModerationCasesRepository(repo);
  });

  describe('findById', () => {
    it('tra theo id', async () => {
      await sut.findById('c1');
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });
  });

  describe('findOpenCaseForTarget', () => {
    it('chỉ khớp status open/claimed (In), đúng target_type/target_id', async () => {
      await sut.findOpenCaseForTarget(ModerationTargetType.MEDIA, 'm1');
      expect(repo.findOne).toHaveBeenCalledWith({
        where: {
          targetType: ModerationTargetType.MEDIA,
          targetId: 'm1',
          status: In([ModerationCaseStatus.OPEN, ModerationCaseStatus.CLAIMED]),
        },
      });
    });
  });

  describe('createOpenCase', () => {
    it('INSERT có ON CONFLICT khớp đúng partial unique index (INV-3), trả về case khi chèn thành công', async () => {
      const manager = createMock<EntityManager>({
        query: jest.fn().mockResolvedValue([
          {
            id: 'c1',
            target_type: 'media',
            target_id: 'm1',
            status: 'open',
            source: 'new_content',
            severity: 'normal',
            priority: 10,
            report_count: 0,
            assigned_to: null,
            claimed_at: null,
            decision: null,
            reason: null,
            resolved_by: null,
            resolved_at: null,
            ai_score: null,
            ai_labels: null,
            created_at: new Date('2026-08-02T00:00:00Z'),
            updated_at: new Date('2026-08-02T00:00:00Z'),
          },
        ]),
      });

      const result = await sut.createOpenCase(manager, {
        targetType: ModerationTargetType.MEDIA,
        targetId: 'm1',
        source: ModerationCaseSource.NEW_CONTENT,
        severity: ModerationCaseSeverity.NORMAL,
        priority: 10,
      });

      const [query, params] = manager.query.mock.calls[0];
      const q = sql(query);
      expect(q).toContain('ON CONFLICT (target_type, target_id) WHERE status IN');
      expect(q).toContain("'open','claimed'");
      expect(q).toContain('DO NOTHING');
      expect(params).toEqual([ModerationTargetType.MEDIA, 'm1', ModerationCaseSource.NEW_CONTENT, ModerationCaseSeverity.NORMAL, 10]);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('c1');
      expect(result!.targetType).toBe(ModerationTargetType.MEDIA);
      expect(result!.status).toBe(ModerationCaseStatus.OPEN);
      expect(result!.severity).toBe(ModerationCaseSeverity.NORMAL);
      expect(result!.priority).toBe(10);
    });

    it('conflict (đã có case mở cho target) -> RETURNING không dòng nào -> trả về null, KHÔNG ném lỗi', async () => {
      const manager = createMock<EntityManager>({ query: jest.fn().mockResolvedValue([]) });

      const result = await sut.createOpenCase(manager, {
        targetType: ModerationTargetType.REVIEW,
        targetId: 'r1',
        source: ModerationCaseSource.REPORT,
        severity: ModerationCaseSeverity.NORMAL,
        priority: 10,
      });

      expect(result).toBeNull();
    });
  });
});
