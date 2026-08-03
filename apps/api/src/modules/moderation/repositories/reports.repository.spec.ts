import { EntityManager, Repository } from 'typeorm';
import { ReportsRepository } from './reports.repository';
import { Report } from '../entities/report.entity';
import { ModerationTargetType, ReportReason, ReportStatus } from '../moderation.enums';
import { createMock, LooseMock } from '../../../../test/helpers/create-mock';

describe('ReportsRepository', () => {
  let repo: LooseMock<Repository<Report>>;
  let sut: ReportsRepository;

  beforeEach(() => {
    repo = createMock<Repository<Report>>({ exists: jest.fn(), find: jest.fn() });
    sut = new ReportsRepository(repo);
  });

  describe('findByCaseId', () => {
    it('tra theo case_id, cũ nhất trước', async () => {
      await sut.findByCaseId('c1');
      expect(repo.find).toHaveBeenCalledWith({ where: { caseId: 'c1' }, order: { createdAt: 'ASC' } });
    });
  });

  describe('existsByReporterAndTarget', () => {
    it('tra đúng target_type/target_id/reporter_id (hậu thuẫn uq_reports_one_per_reporter), không truyền manager -> dùng this.repo', async () => {
      repo.exists.mockResolvedValue(true);

      await expect(
        sut.existsByReporterAndTarget(ModerationTargetType.REVIEW, 'r1', 'u1'),
      ).resolves.toBe(true);
      expect(repo.exists).toHaveBeenCalledWith({
        where: { targetType: ModerationTargetType.REVIEW, targetId: 'r1', reporterId: 'u1' },
      });
    });

    it('truyền manager (T3, M5) -> chạy TRONG transaction đó, không dùng this.repo', async () => {
      const inner = createMock<Repository<Report>>({ exists: jest.fn().mockResolvedValue(false) });
      const manager = createMock<EntityManager>({ getRepository: jest.fn().mockReturnValue(inner) });

      const result = await sut.existsByReporterAndTarget(ModerationTargetType.MEDIA, 'm1', 'u1', manager);

      expect(manager.getRepository).toHaveBeenCalledWith(Report);
      expect(inner.exists).toHaveBeenCalledWith({
        where: { targetType: ModerationTargetType.MEDIA, targetId: 'm1', reporterId: 'u1' },
      });
      expect(repo.exists).not.toHaveBeenCalled();
      expect(result).toBe(false);
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

  describe('resolveByCaseId (T2, M3)', () => {
    it('ghi status cho MỌI report của một case, qua manager (hệ quả cơ học của resolve case, không phải endpoint report riêng)', async () => {
      const inner = createMock<Repository<Report>>({ update: jest.fn() });
      const manager = createMock<EntityManager>({ getRepository: jest.fn().mockReturnValue(inner) });

      await sut.resolveByCaseId(manager, 'c1', ReportStatus.UPHELD);

      expect(manager.getRepository).toHaveBeenCalledWith(Report);
      expect(inner.update).toHaveBeenCalledWith({ caseId: 'c1' }, { status: ReportStatus.UPHELD });
    });
  });
});
