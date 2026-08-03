import { ConflictException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ModerationReportsService } from './moderation-reports.service';
import { ModerationCasesRepository } from './repositories/moderation-cases.repository';
import { ReportsRepository } from './repositories/reports.repository';
import { AuditService } from '../../core/audit/audit.service';
import type { ModerationEventPublisher } from './events/moderation-events';
import { ModerationCase } from './entities/moderation-case.entity';
import {
  ModerationCaseSeverity,
  ModerationCaseSource,
  ModerationCaseStatus,
  ModerationTargetType,
  ReportReason,
} from './moderation.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

function makeCase(overrides: Partial<ModerationCase> = {}): ModerationCase {
  const c = new ModerationCase();
  c.id = 'c1';
  c.targetType = ModerationTargetType.REVIEW;
  c.targetId = 'r1';
  c.status = ModerationCaseStatus.OPEN;
  c.source = ModerationCaseSource.REPORT;
  c.severity = ModerationCaseSeverity.NORMAL;
  c.priority = 10;
  c.reportCount = 0;
  c.assignedTo = null;
  c.claimedAt = null;
  c.decision = null;
  c.reason = null;
  c.resolvedBy = null;
  c.resolvedAt = null;
  c.aiScore = null;
  c.aiLabels = null;
  c.createdAt = new Date('2026-08-03T00:00:00Z');
  c.updatedAt = new Date('2026-08-03T00:00:00Z');
  return Object.assign(c, overrides);
}

describe('ModerationReportsService (T3, M5)', () => {
  let casesRepo: LooseMock<ModerationCasesRepository>;
  let reportsRepo: LooseMock<ReportsRepository>;
  let audit: LooseMock<AuditService>;
  let events: LooseMock<ModerationEventPublisher>;
  let dataSource: LooseMock<DataSource>;
  let manager: EntityManager;
  let service: ModerationReportsService;

  const INPUT = {
    targetType: ModerationTargetType.REVIEW,
    targetId: 'r1',
    reporterId: 'reporter-1',
    reason: ReportReason.SPAM,
    description: 'nội dung spam',
  };

  beforeEach(() => {
    manager = createMock<EntityManager>();
    casesRepo = createMock<ModerationCasesRepository>({
      createOpenCase: jest.fn(),
      findOpenCaseForTargetForUpdate: jest.fn(),
      updateReportAggregation: jest.fn(),
    });
    reportsRepo = createMock<ReportsRepository>({
      existsByReporterAndTarget: jest.fn().mockResolvedValue(false),
      create: jest.fn().mockResolvedValue({ id: 'rep1' }),
    });
    audit = createMock<AuditService>({ record: jest.fn() });
    events = createMock<ModerationEventPublisher>({ publish: jest.fn() });
    dataSource = createMock<DataSource>({
      transaction: jest.fn((cb: (m: EntityManager) => Promise<unknown>) => cb(manager)),
    });
    service = new ModerationReportsService(casesRepo, reportsRepo, audit, dataSource, events);
  });

  describe('case mới (report đầu tiên trên target)', () => {
    it('createOpenCase thắng -> tạo report, report_count=1, severity=normal (sàn source=report), priority=10', async () => {
      casesRepo.createOpenCase.mockResolvedValue(makeCase({ reportCount: 0, severity: ModerationCaseSeverity.NORMAL }));

      await service.report(INPUT);

      expect(casesRepo.createOpenCase).toHaveBeenCalledWith(manager, {
        targetType: ModerationTargetType.REVIEW,
        targetId: 'r1',
        source: ModerationCaseSource.REPORT,
        severity: ModerationCaseSeverity.NORMAL,
        priority: 10,
      });
      expect(casesRepo.findOpenCaseForTargetForUpdate).not.toHaveBeenCalled();
      expect(reportsRepo.create).toHaveBeenCalledWith(manager, {
        caseId: 'c1',
        targetType: ModerationTargetType.REVIEW,
        targetId: 'r1',
        reporterId: 'reporter-1',
        reason: ReportReason.SPAM,
        description: 'nội dung spam',
      });
      expect(casesRepo.updateReportAggregation).toHaveBeenCalledWith(manager, 'c1', {
        reportCount: 1,
        severity: ModerationCaseSeverity.NORMAL,
        priority: 10,
      });
    });

    it('phát CaseOpenedEvent + ReportCreatedEvent (case mới)', async () => {
      casesRepo.createOpenCase.mockResolvedValue(makeCase());

      await service.report(INPUT);

      expect(events.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'ReportCreated' }));
      expect(events.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'CaseOpened' }));
      expect(events.publish).toHaveBeenCalledTimes(2);
    });

    it('ghi audit report.created với actorId=reporterId, context kèm caseId/reportId/isNewCase=true', async () => {
      casesRepo.createOpenCase.mockResolvedValue(makeCase());

      await service.report(INPUT);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'report.created',
          entityType: ModerationTargetType.REVIEW,
          entityId: 'r1',
          actorId: 'reporter-1',
          context: { caseId: 'c1', reportId: 'rep1', isNewCase: true },
        }),
      );
    });
  });

  describe('tái sử dụng case đang mở (report thứ 2+ trên CÙNG target)', () => {
    it('createOpenCase gặp conflict (null) -> khoá + đọc case đã tồn tại, KHÔNG tạo case trùng', async () => {
      casesRepo.createOpenCase.mockResolvedValue(null);
      casesRepo.findOpenCaseForTargetForUpdate.mockResolvedValue(
        makeCase({ reportCount: 1, severity: ModerationCaseSeverity.NORMAL }),
      );

      await service.report(INPUT);

      expect(casesRepo.findOpenCaseForTargetForUpdate).toHaveBeenCalledWith(
        manager,
        ModerationTargetType.REVIEW,
        'r1',
      );
      // createOpenCase gọi ĐÚNG MỘT lần (không có lần thứ 2 vì case đã tìm thấy)
      expect(casesRepo.createOpenCase).toHaveBeenCalledTimes(1);
    });

    it('report_count tăng đúng (1 -> 2), severity/priority tính lại từ case ĐÃ TỒN TẠI, không phải giá trị khởi tạo', async () => {
      casesRepo.createOpenCase.mockResolvedValue(null);
      casesRepo.findOpenCaseForTargetForUpdate.mockResolvedValue(
        makeCase({ reportCount: 1, severity: ModerationCaseSeverity.NORMAL }),
      );

      await service.report(INPUT);

      expect(casesRepo.updateReportAggregation).toHaveBeenCalledWith(manager, 'c1', {
        reportCount: 2,
        severity: ModerationCaseSeverity.NORMAL,
        priority: 15, // base(normal)=10 + min(5*max(2-1,0),25)=5
      });
    });

    it('report thứ 3 (report_count 2->3) -> severity nâng lên high (ngưỡng O3, CHỈ đổi thứ tự hàng chờ)', async () => {
      casesRepo.createOpenCase.mockResolvedValue(null);
      casesRepo.findOpenCaseForTargetForUpdate.mockResolvedValue(
        makeCase({ reportCount: 2, severity: ModerationCaseSeverity.NORMAL }),
      );

      await service.report(INPUT);

      expect(casesRepo.updateReportAggregation).toHaveBeenCalledWith(manager, 'c1', {
        reportCount: 3,
        severity: ModerationCaseSeverity.HIGH,
        priority: 40, // base(high)=30 + min(5*max(3-1,0),25)=10
      });
    });

    it('case đã ở severity cao hơn sàn (vd critical từ AI, ngoài phạm vi M5 nhưng dữ liệu có thể tồn tại) -> KHÔNG bị hạ xuống', async () => {
      casesRepo.createOpenCase.mockResolvedValue(null);
      casesRepo.findOpenCaseForTargetForUpdate.mockResolvedValue(
        makeCase({ reportCount: 0, severity: ModerationCaseSeverity.CRITICAL, source: ModerationCaseSource.AI_FLAG }),
      );

      await service.report(INPUT);

      expect(casesRepo.updateReportAggregation).toHaveBeenCalledWith(
        manager,
        'c1',
        expect.objectContaining({ severity: ModerationCaseSeverity.CRITICAL }),
      );
    });

    it('KHÔNG phát CaseOpenedEvent khi tái sử dụng case (chỉ ReportCreatedEvent)', async () => {
      casesRepo.createOpenCase.mockResolvedValue(null);
      casesRepo.findOpenCaseForTargetForUpdate.mockResolvedValue(makeCase({ reportCount: 1 }));

      await service.report(INPUT);

      expect(events.publish).toHaveBeenCalledTimes(1);
      expect(events.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'ReportCreated' }));
    });

    it('audit context isNewCase=false khi tái sử dụng case', async () => {
      casesRepo.createOpenCase.mockResolvedValue(null);
      casesRepo.findOpenCaseForTargetForUpdate.mockResolvedValue(makeCase({ reportCount: 1 }));

      await service.report(INPUT);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ context: expect.objectContaining({ isNewCase: false }) }),
      );
    });
  });

  describe('race hiếm: case resolved GIỮA lúc conflict và SELECT FOR UPDATE', () => {
    it('createOpenCase null, findOpenCaseForTargetForUpdate null (case không còn open/claimed) -> thử createOpenCase LẦN 2, coi là case mới', async () => {
      casesRepo.createOpenCase.mockResolvedValueOnce(null).mockResolvedValueOnce(makeCase({ reportCount: 0 }));
      casesRepo.findOpenCaseForTargetForUpdate.mockResolvedValue(null);

      await service.report(INPUT);

      expect(casesRepo.createOpenCase).toHaveBeenCalledTimes(2);
      expect(events.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'CaseOpened' }));
    });
  });

  describe('chống report trùng (WF-12)', () => {
    it('đã báo cáo target này rồi -> 409, KHÔNG tạo report, KHÔNG cập nhật aggregation', async () => {
      casesRepo.createOpenCase.mockResolvedValue(makeCase());
      reportsRepo.existsByReporterAndTarget.mockResolvedValue(true);

      await expect(service.report(INPUT)).rejects.toThrow(ConflictException);

      expect(reportsRepo.create).not.toHaveBeenCalled();
      expect(casesRepo.updateReportAggregation).not.toHaveBeenCalled();
    });

    it('kiểm tra trùng CHẠY QUA manager (trong transaction, sau khi đã khoá case)', async () => {
      casesRepo.createOpenCase.mockResolvedValue(makeCase());

      await service.report(INPUT);

      expect(reportsRepo.existsByReporterAndTarget).toHaveBeenCalledWith(
        ModerationTargetType.REVIEW,
        'r1',
        'reporter-1',
        manager,
      );
    });
  });

  describe('INV-9: audit/event chỉ SAU commit', () => {
    it('KHÔNG audit/event nào được gọi TRƯỚC khi transaction hoàn tất', async () => {
      const callOrder: string[] = [];
      dataSource.transaction.mockImplementation(async (cb: (m: EntityManager) => Promise<unknown>) => {
        callOrder.push('transaction:start');
        const result = await cb(manager);
        callOrder.push('transaction:commit');
        return result;
      });
      audit.record.mockImplementation(async () => {
        callOrder.push('audit:record');
      });
      events.publish.mockImplementation(async () => {
        callOrder.push('event:publish');
      });
      casesRepo.createOpenCase.mockResolvedValue(makeCase());

      await service.report(INPUT);

      const commitIndex = callOrder.indexOf('transaction:commit');
      const firstAuditOrEvent = callOrder.findIndex((c) => c.startsWith('audit') || c.startsWith('event'));
      expect(commitIndex).toBeGreaterThanOrEqual(0);
      expect(firstAuditOrEvent).toBeGreaterThan(commitIndex);
    });

    it('audit ghi lỗi SAU commit -> KHÔNG hoàn tác, report() vẫn resolve bình thường', async () => {
      casesRepo.createOpenCase.mockResolvedValue(makeCase());
      audit.record.mockRejectedValue(new Error('audit DB down'));

      await expect(service.report(INPUT)).resolves.toBeUndefined();
      expect(reportsRepo.create).toHaveBeenCalled();
    });

    it('publish event lỗi SAU commit -> KHÔNG hoàn tác, report() vẫn resolve bình thường', async () => {
      casesRepo.createOpenCase.mockResolvedValue(makeCase());
      events.publish.mockRejectedValue(new Error('broker down'));

      await expect(service.report(INPUT)).resolves.toBeUndefined();
      expect(reportsRepo.create).toHaveBeenCalled();
    });
  });

  describe('media target', () => {
    it('targetType=media truyền xuyên suốt case/report/audit/event', async () => {
      const mediaInput = { ...INPUT, targetType: ModerationTargetType.MEDIA, targetId: 'm1' };
      casesRepo.createOpenCase.mockResolvedValue(
        makeCase({ targetType: ModerationTargetType.MEDIA, targetId: 'm1' }),
      );

      await service.report(mediaInput);

      expect(casesRepo.createOpenCase).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ targetType: ModerationTargetType.MEDIA, targetId: 'm1' }),
      );
      expect(reportsRepo.create).toHaveBeenCalledWith(
        manager,
        expect.objectContaining({ targetType: ModerationTargetType.MEDIA, targetId: 'm1' }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: ModerationTargetType.MEDIA, entityId: 'm1' }),
      );
    });
  });
});
