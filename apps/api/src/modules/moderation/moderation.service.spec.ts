import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ModerationService } from './moderation.service';
import { ModerationCasesRepository } from './repositories/moderation-cases.repository';
import { ReportsRepository } from './repositories/reports.repository';
import { MediaRepository } from '../media/repositories/media.repository';
import { AuditService } from '../../core/audit/audit.service';
import type { ModerationEventPublisher } from './events/moderation-events';
import { ModerationCase } from './entities/moderation-case.entity';
import { Media } from '../media/entities/media.entity';
import {
  ModerationCaseSeverity,
  ModerationCaseSource,
  ModerationCaseStatus,
  ModerationDecision,
  ModerationTargetType,
  ReportStatus,
} from './moderation.enums';
import { MediaProvider, MediaStatus, MediaType } from '../media/media.enums';
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
  c.createdAt = new Date('2026-08-02T00:00:00Z');
  c.updatedAt = new Date('2026-08-02T00:00:00Z');
  return Object.assign(c, overrides);
}

function makeMedia(overrides: Partial<Media> = {}): Media {
  const m = new Media();
  m.id = 'm1';
  m.type = MediaType.IMAGE;
  m.provider = MediaProvider.UPLOAD;
  m.status = MediaStatus.PENDING;
  m.uploadedBy = 'uploader-1';
  m.url = null;
  m.thumbnailUrl = null;
  m.externalId = null;
  m.width = null;
  m.height = null;
  m.duration = null;
  m.caption = null;
  m.altText = null;
  m.sortOrder = null;
  m.aiModerationScore = null;
  m.aiLabels = null;
  m.objectKey = 'media/x.jpg';
  m.bucket = 'phuquochub-test';
  m.contentType = 'image/jpeg';
  m.sizeBytes = 1000;
  m.checksumSha256 = 'x'.repeat(64);
  m.placeId = null;
  m.reviewId = null;
  m.postId = null;
  m.businessId = null;
  m.eventId = null;
  m.createdAt = new Date('2026-08-02T00:00:00Z');
  m.updatedAt = new Date('2026-08-02T00:00:00Z');
  m.deletedAt = null;
  return Object.assign(m, overrides);
}

describe('ModerationService', () => {
  let casesRepo: LooseMock<ModerationCasesRepository>;
  let reportsRepo: LooseMock<ReportsRepository>;
  let mediaRepo: LooseMock<MediaRepository>;
  let audit: LooseMock<AuditService>;
  let events: LooseMock<ModerationEventPublisher>;
  let dataSource: LooseMock<DataSource>;
  let manager: EntityManager;
  let service: ModerationService;

  beforeEach(() => {
    manager = createMock<EntityManager>();
    casesRepo = createMock<ModerationCasesRepository>({
      list: jest.fn(),
      findById: jest.fn(),
      findTargetPreview: jest.fn(),
      createOpenCase: jest.fn(),
      findByIdForUpdate: jest.fn(),
      resolve: jest.fn(),
    });
    reportsRepo = createMock<ReportsRepository>({ findByCaseId: jest.fn(), resolveByCaseId: jest.fn() });
    mediaRepo = createMock<MediaRepository>({ findByIdForUpdate: jest.fn(), updateStatus: jest.fn() });
    audit = createMock<AuditService>({ record: jest.fn() });
    events = createMock<ModerationEventPublisher>({ publish: jest.fn() });
    dataSource = createMock<DataSource>({
      transaction: jest.fn((cb: (m: EntityManager) => Promise<unknown>) => cb(manager)),
    });
    service = new ModerationService(casesRepo, reportsRepo, mediaRepo, audit, dataSource, events);
  });

  describe('list', () => {
    it('không truyền status -> mặc định lọc [open, claimed] (hàng chờ)', async () => {
      casesRepo.list.mockResolvedValue({ items: [], total: 0 });
      await service.list({});
      expect(casesRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({ statuses: [ModerationCaseStatus.OPEN, ModerationCaseStatus.CLAIMED] }),
      );
    });

    it('truyền status tường minh -> lọc đúng MỘT giá trị đó (kể cả resolved, xem lịch sử)', async () => {
      casesRepo.list.mockResolvedValue({ items: [], total: 0 });
      await service.list({ status: ModerationCaseStatus.RESOLVED });
      expect(casesRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({ statuses: [ModerationCaseStatus.RESOLVED] }),
      );
    });

    it('page/limit không truyền -> dùng mặc định clampPage/clampLimit (page=1, limit=20)', async () => {
      casesRepo.list.mockResolvedValue({ items: [], total: 0 });
      await service.list({});
      expect(casesRepo.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 20, offset: 0 }));
    });

    it('page=3, limit=10 -> offset = (3-1)*10 = 20', async () => {
      casesRepo.list.mockResolvedValue({ items: [], total: 0 });
      await service.list({ page: 3, limit: 10 });
      expect(casesRepo.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 10, offset: 20 }));
    });

    it('truyền đủ target_type/source/severity/assigned_to -> chuyển thẳng xuống repository', async () => {
      casesRepo.list.mockResolvedValue({ items: [], total: 0 });
      await service.list({
        target_type: ModerationTargetType.REVIEW,
        source: ModerationCaseSource.REPORT,
        severity: ModerationCaseSeverity.HIGH,
        assigned_to: 'mod-1',
      });
      expect(casesRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({
          targetType: ModerationTargetType.REVIEW,
          source: ModerationCaseSource.REPORT,
          severity: ModerationCaseSeverity.HIGH,
          assignedTo: 'mod-1',
        }),
      );
    });

    it('map kết quả qua mapper và trả về envelope phân trang chuẩn (success/data/meta)', async () => {
      casesRepo.list.mockResolvedValue({ items: [makeCase()], total: 1 });
      const result = await service.list({});
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('c1');
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.pageSize).toBe(20);
    });

    it('KHÔNG gọi bất kỳ method ghi nào (đọc thuần)', async () => {
      casesRepo.list.mockResolvedValue({ items: [], total: 0 });
      await service.list({});
      expect(casesRepo.createOpenCase).not.toHaveBeenCalled();
    });
  });

  describe('getById', () => {
    it('case không tồn tại -> NotFoundException, KHÔNG gọi reportsRepo/findTargetPreview', async () => {
      casesRepo.findById.mockResolvedValue(null);
      await expect(service.getById('missing')).rejects.toThrow(NotFoundException);
      expect(reportsRepo.findByCaseId).not.toHaveBeenCalled();
      expect(casesRepo.findTargetPreview).not.toHaveBeenCalled();
    });

    it('case tồn tại -> gộp case + reports + target preview', async () => {
      const found = makeCase();
      casesRepo.findById.mockResolvedValue(found);
      reportsRepo.findByCaseId.mockResolvedValue([]);
      casesRepo.findTargetPreview.mockResolvedValue({
        found: false,
        targetType: ModerationTargetType.MEDIA,
        targetId: 'm1',
      });

      const result = await service.getById('c1');

      expect(reportsRepo.findByCaseId).toHaveBeenCalledWith('c1');
      expect(casesRepo.findTargetPreview).toHaveBeenCalledWith(ModerationTargetType.MEDIA, 'm1');
      expect(result.id).toBe('c1');
      expect(result.reports).toEqual([]);
      expect(result.target_preview).toEqual({ found: false, target_type: 'media', target_id: 'm1' });
    });

    it('KHÔNG tự bọc {success,data} — để TransformInterceptor bọc (cùng quy ước mọi service khác)', async () => {
      const found = makeCase();
      casesRepo.findById.mockResolvedValue(found);
      reportsRepo.findByCaseId.mockResolvedValue([]);
      casesRepo.findTargetPreview.mockResolvedValue({
        found: false,
        targetType: ModerationTargetType.MEDIA,
        targetId: 'm1',
      });

      const result = await service.getById('c1');
      expect(result).not.toHaveProperty('success');
      expect(result).not.toHaveProperty('data');
    });
  });

  describe('decide (M3, T2)', () => {
    const ACTOR = 'moderator-1'; // khác media.uploadedBy ('uploader-1') — không tự kiểm duyệt

    it('case không tồn tại -> 404, KHÔNG gọi mediaRepo/resolve nào', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(null);
      await expect(service.decide('missing', { decision: ModerationDecision.APPROVE }, ACTOR)).rejects.toThrow(
        NotFoundException,
      );
      expect(mediaRepo.findByIdForUpdate).not.toHaveBeenCalled();
      expect(casesRepo.resolve).not.toHaveBeenCalled();
    });

    it('case đã resolved -> 409, KHÔNG đổi gì thêm', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(makeCase({ status: ModerationCaseStatus.RESOLVED }));
      await expect(service.decide('c1', { decision: ModerationDecision.APPROVE }, ACTOR)).rejects.toThrow(
        ConflictException,
      );
      expect(mediaRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('case đã dismissed -> 409', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(makeCase({ status: ModerationCaseStatus.DISMISSED }));
      await expect(service.decide('c1', { decision: ModerationDecision.APPROVE }, ACTOR)).rejects.toThrow(
        ConflictException,
      );
    });

    it('case claimed vẫn xử lý được (không chỉ open)', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(makeCase({ status: ModerationCaseStatus.CLAIMED }));
      mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PENDING }));
      await service.decide('c1', { decision: ModerationDecision.APPROVE }, ACTOR);
      expect(mediaRepo.updateStatus).toHaveBeenCalledWith(manager, 'm1', MediaStatus.PUBLISHED);
    });

    it('target_type=review -> 422 (kiểm duyệt review là M4, chưa triển khai)', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(makeCase({ targetType: ModerationTargetType.REVIEW }));
      await expect(service.decide('c1', { decision: ModerationDecision.APPROVE }, ACTOR)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(mediaRepo.findByIdForUpdate).not.toHaveBeenCalled();
    });

    it('media không còn tồn tại -> 422, KHÔNG throw 404', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
      mediaRepo.findByIdForUpdate.mockResolvedValue(null);
      await expect(service.decide('c1', { decision: ModerationDecision.APPROVE }, ACTOR)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('INV-12: moderator là chính người upload -> 403, KHÔNG cho dismiss cũng như không cho quyết định nội dung', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
      mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ uploadedBy: 'self-uploader' }));
      await expect(
        service.decide('c1', { decision: ModerationDecision.APPROVE }, 'self-uploader'),
      ).rejects.toThrow(ForbiddenException);
      await expect(service.decide('c1', { decision: ModerationDecision.DISMISS }, 'self-uploader')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('pending + approve -> published, case resolved, reports dismissed', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
      mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PENDING }));

      await service.decide('c1', { decision: ModerationDecision.APPROVE }, ACTOR);

      expect(mediaRepo.updateStatus).toHaveBeenCalledWith(manager, 'm1', MediaStatus.PUBLISHED);
      expect(casesRepo.resolve).toHaveBeenCalledWith(
        manager,
        'c1',
        expect.objectContaining({ status: ModerationCaseStatus.RESOLVED, decision: ModerationDecision.APPROVE, resolvedBy: ACTOR }),
      );
      expect(reportsRepo.resolveByCaseId).toHaveBeenCalledWith(manager, 'c1', ReportStatus.DISMISSED);
    });

    it('pending + reject KHÔNG kèm reason -> 422, KHÔNG đổi status', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
      mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PENDING }));

      await expect(service.decide('c1', { decision: ModerationDecision.REJECT }, ACTOR)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(mediaRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('pending + reject kèm reason -> rejected, reports upheld', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
      mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PENDING }));

      await service.decide('c1', { decision: ModerationDecision.REJECT, reason: 'nội dung không liên quan' }, ACTOR);

      expect(mediaRepo.updateStatus).toHaveBeenCalledWith(manager, 'm1', MediaStatus.REJECTED);
      expect(reportsRepo.resolveByCaseId).toHaveBeenCalledWith(manager, 'c1', ReportStatus.UPHELD);
    });

    it('published + hide KHÔNG kèm reason -> 422', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
      mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PUBLISHED }));

      await expect(service.decide('c1', { decision: ModerationDecision.HIDE }, ACTOR)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('published + hide kèm reason -> hidden', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
      mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PUBLISHED }));

      await service.decide('c1', { decision: ModerationDecision.HIDE, reason: 'vi phạm chính sách' }, ACTOR);

      expect(mediaRepo.updateStatus).toHaveBeenCalledWith(manager, 'm1', MediaStatus.HIDDEN);
    });

    it('hidden + restore KHÔNG kèm target_status -> 422 (INV-10, không đoán)', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
      mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.HIDDEN }));

      await expect(service.decide('c1', { decision: ModerationDecision.RESTORE }, ACTOR)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(mediaRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('hidden + restore kèm target_status=published -> published', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
      mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.HIDDEN }));

      await service.decide(
        'c1',
        { decision: ModerationDecision.RESTORE, target_status: MediaStatus.PUBLISHED },
        ACTOR,
      );

      expect(mediaRepo.updateStatus).toHaveBeenCalledWith(manager, 'm1', MediaStatus.PUBLISHED);
    });

    it('rejected + restore KHÔNG kèm target_status -> 422 (INV-10)', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
      mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.REJECTED }));

      await expect(service.decide('c1', { decision: ModerationDecision.RESTORE }, ACTOR)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('rejected + restore kèm target_status=pending -> pending', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
      mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.REJECTED }));

      await service.decide('c1', { decision: ModerationDecision.RESTORE, target_status: MediaStatus.PENDING }, ACTOR);

      expect(mediaRepo.updateStatus).toHaveBeenCalledWith(manager, 'm1', MediaStatus.PENDING);
    });

    it('transition không hợp lệ (vd published + reject) -> 422, uỷ quyền hoàn toàn cho FSM (không cài lại logic)', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
      mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PUBLISHED }));

      await expect(
        service.decide('c1', { decision: ModerationDecision.REJECT, reason: 'lý do' }, ACTOR),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(mediaRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('decision=dismiss -> case dismissed, KHÔNG đổi media.status, reports dismissed', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
      mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PENDING }));

      await service.decide('c1', { decision: ModerationDecision.DISMISS, reason: 'report vô căn cứ' }, ACTOR);

      expect(mediaRepo.updateStatus).not.toHaveBeenCalled();
      expect(casesRepo.resolve).toHaveBeenCalledWith(
        manager,
        'c1',
        expect.objectContaining({ status: ModerationCaseStatus.DISMISSED, decision: ModerationDecision.DISMISS }),
      );
      expect(reportsRepo.resolveByCaseId).toHaveBeenCalledWith(manager, 'c1', ReportStatus.DISMISSED);
    });

    it('KHÔNG audit/event nào được gọi TRƯỚC khi transaction hoàn tất (INV-9) — thứ tự lời gọi xác nhận qua timeline', async () => {
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
      casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
      mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PENDING }));

      await service.decide('c1', { decision: ModerationDecision.APPROVE }, ACTOR);

      const commitIndex = callOrder.indexOf('transaction:commit');
      const firstAuditOrEvent = callOrder.findIndex((c) => c.startsWith('audit') || c.startsWith('event'));
      expect(commitIndex).toBeGreaterThanOrEqual(0);
      expect(firstAuditOrEvent).toBeGreaterThan(commitIndex);
    });

    it('audit ghi lỗi SAU commit -> KHÔNG hoàn tác, decide() vẫn resolve bình thường', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
      mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PENDING }));
      audit.record.mockRejectedValue(new Error('audit DB down'));

      await expect(service.decide('c1', { decision: ModerationDecision.APPROVE }, ACTOR)).resolves.toBeUndefined();
      expect(mediaRepo.updateStatus).toHaveBeenCalledWith(manager, 'm1', MediaStatus.PUBLISHED);
    });

    it('publish event lỗi SAU commit -> KHÔNG hoàn tác, decide() vẫn resolve bình thường', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
      mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PENDING }));
      events.publish.mockRejectedValue(new Error('broker down'));

      await expect(service.decide('c1', { decision: ModerationDecision.APPROVE }, ACTOR)).resolves.toBeUndefined();
      expect(mediaRepo.updateStatus).toHaveBeenCalledWith(manager, 'm1', MediaStatus.PUBLISHED);
    });

    it('approve -> phát ContentApproved + CaseResolved', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
      mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PENDING }));

      await service.decide('c1', { decision: ModerationDecision.APPROVE }, ACTOR);

      expect(events.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'ContentApproved' }));
      expect(events.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'CaseResolved' }));
    });

    it('hide -> phát ContentHidden + CaseResolved', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
      mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PUBLISHED }));

      await service.decide('c1', { decision: ModerationDecision.HIDE, reason: 'vi phạm' }, ACTOR);

      expect(events.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'ContentHidden' }));
      expect(events.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'CaseResolved' }));
    });

    it('reject -> CHỈ phát CaseResolved (không có event hiển thị cho reject)', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
      mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PENDING }));

      await service.decide('c1', { decision: ModerationDecision.REJECT, reason: 'lý do' }, ACTOR);

      expect(events.publish).toHaveBeenCalledTimes(1);
      expect(events.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'CaseResolved' }));
    });
  });
});
