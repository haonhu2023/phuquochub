import { EntityManager, Repository } from 'typeorm';
import { ReportsRepository } from './reports.repository';
import { Report } from '../entities/report.entity';
import { ModerationTargetType, ReportReason } from '../moderation.enums';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

describe('ReportsRepository', () => {
  let repo: LooseMock<Repository<Report>>;
  let sut: ReportsRepository;

  beforeEach(() => {
    repo = createMock<Repository<Report>>({ exists: jest.fn() });
    sut = new ReportsRepository(repo);
  });

  describe('existsByReporterAndTarget', () => {
    it('tra đúng target_type/target_id/reporter_id (hậu thuẫn uq_reports_one_per_reporter)', async () => {
      repo.exists.mockResolvedValue(true);

      await expect(
        sut.existsByReporterAndTarget(ModerationTargetType.REVIEW, 'r1', 'u1'),
      ).resolves.toBe(true);
      expect(repo.exists).toHaveBeenCalledWith({
        where: { targetType: ModerationTargetType.REVIEW, targetId: 'r1', reporterId: 'u1' },
      });
    });
  });

  describe('create', () => {
    it('tạo report gắn với case_id đã cho, qua manager (caller kiểm soát transaction)', async () => {
      const saved = { id: 'rep1' } as Report;
      const inner = createMock<Repository<Report>>({
        create: jest.fn().mockReturnValue({ id: 'rep1' }),
        save: jest.fn().mockResolvedValue(saved),
      });
      const manager = createMock<EntityManager>({ getRepository: jest.fn().mockReturnValue(inner) });

      const result = await sut.create(manager, {
        caseId: 'c1',
        targetType: ModerationTargetType.MEDIA,
        targetId: 'm1',
        reporterId: 'u1',
        reason: ReportReason.SPAM,
        description: 'không liên quan',
      });

      expect(manager.getRepository).toHaveBeenCalledWith(Report);
      expect(inner.create).toHaveBeenCalledWith({
        caseId: 'c1',
        targetType: ModerationTargetType.MEDIA,
        targetId: 'm1',
        reporterId: 'u1',
        reason: ReportReason.SPAM,
        description: 'không liên quan',
      });
      expect(inner.save).toHaveBeenCalledWith({ id: 'rep1' });
      expect(result).toBe(saved);
    });
  });
});
