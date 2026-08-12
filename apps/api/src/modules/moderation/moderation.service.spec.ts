import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ModerationService } from './moderation.service';
import { ModerationCasesRepository, ReviewForDecision } from './repositories/moderation-cases.repository';
import { ReportsRepository } from './repositories/reports.repository';
import { MediaRepository } from '../media/repositories/media.repository';
import { PlacesRepository } from '../places/repositories/places.repository';
import { AuthorizationService } from '../authz/authorization.service';
import { AuditService } from '../../core/audit/audit.service';
import { AiRecommendationsService } from './ai-recommendations.service';
import type { ModerationEventPublisher } from './events/moderation-events';
import { ModerationCase } from './entities/moderation-case.entity';
import { Media } from '../media/entities/media.entity';
import {
  MediaModerationReasonCode,
  ModerationCaseSeverity,
  ModerationCaseSource,
  ModerationCaseStatus,
  ModerationDecision,
  ModerationTargetType,
  ReportStatus,
} from './moderation.enums';
import { MediaProvider, MediaStatus, MediaType } from '../media/media.enums';
import { ReviewStatus } from '../reviews/review.enums';
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
  c.reasonCode = null;
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

function makeReview(overrides: Partial<ReviewForDecision> = {}): ReviewForDecision {
  return {
    id: 'r1',
    placeId: 'place-1',
    userId: 'author-1',
    status: ReviewStatus.PUBLISHED,
    ...overrides,
  };
}

describe('ModerationService', () => {
  let casesRepo: LooseMock<ModerationCasesRepository>;
  let reportsRepo: LooseMock<ReportsRepository>;
  let mediaRepo: LooseMock<MediaRepository>;
  let placesRepo: LooseMock<PlacesRepository>;
  let authz: LooseMock<AuthorizationService>;
  let audit: LooseMock<AuditService>;
  let aiRecommendations: LooseMock<AiRecommendationsService>;
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
      findReviewForUpdate: jest.fn(),
      updateReviewStatus: jest.fn(),
      resolve: jest.fn(),
    });
    reportsRepo = createMock<ReportsRepository>({ findByCaseId: jest.fn(), resolveByCaseId: jest.fn() });
    mediaRepo = createMock<MediaRepository>({
      findByIdForUpdate: jest.fn(),
      updateStatus: jest.fn(),
      clearCoverImageByMedia: jest.fn(),
    });
    placesRepo = createMock<PlacesRepository>({ recalculateRating: jest.fn() });
    // Mặc định CHO PHÉP mọi permission — các test về phân quyền (M4) tự override `can` khi cần
    // kiểm tra đúng nhánh 403, giữ mọi test decide() hiện có (M3) không phải sửa gì thêm.
    authz = createMock<AuthorizationService>({ can: jest.fn().mockResolvedValue(true) });
    audit = createMock<AuditService>({ record: jest.fn() });
    // M7 — no-op mặc định: mọi test decide() hiện có (M3/M4) không quan tâm AI shadow mode; các
    // test dành riêng cho hành vi này override `evaluateModeratorDecision` khi cần.
    aiRecommendations = createMock<AiRecommendationsService>({
      evaluateModeratorDecision: jest.fn().mockResolvedValue(undefined),
    });
    events = createMock<ModerationEventPublisher>({ publish: jest.fn() });
    dataSource = createMock<DataSource>({
      transaction: jest.fn((cb: (m: EntityManager) => Promise<unknown>) => cb(manager)),
    });
    service = new ModerationService(
      casesRepo,
      reportsRepo,
      mediaRepo,
      placesRepo,
      authz,
      audit,
      aiRecommendations,
      dataSource,
      events,
    );
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

    it('target_type=place -> 422 (chưa đăng ký FSM, MR-4 — không có quyền nào tương ứng để kiểm tra)', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(makeCase({ targetType: ModerationTargetType.PLACE }));
      await expect(service.decide('c1', { decision: ModerationDecision.APPROVE }, ACTOR)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(mediaRepo.findByIdForUpdate).not.toHaveBeenCalled();
      expect(casesRepo.findReviewForUpdate).not.toHaveBeenCalled();
      expect(authz.can).not.toHaveBeenCalled();
    });

    describe('phân quyền theo target_type (M4 — Media.Moderate/Review.Moderate không dùng lẫn)', () => {
      it('target_type=media -> kiểm tra ĐÚNG Media.Moderate (không phải Review.Moderate)', async () => {
        casesRepo.findByIdForUpdate.mockResolvedValue(makeCase({ targetType: ModerationTargetType.MEDIA }));
        mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PENDING }));

        await service.decide('c1', { decision: ModerationDecision.APPROVE }, ACTOR);

        expect(authz.can).toHaveBeenCalledWith(ACTOR, 'Media.Moderate');
        expect(authz.can).not.toHaveBeenCalledWith(ACTOR, 'Review.Moderate');
      });

      it('target_type=review -> kiểm tra ĐÚNG Review.Moderate (không phải Media.Moderate)', async () => {
        casesRepo.findByIdForUpdate.mockResolvedValue(
          makeCase({ targetType: ModerationTargetType.REVIEW, targetId: 'r1' }),
        );
        casesRepo.findReviewForUpdate.mockResolvedValue(makeReview({ status: ReviewStatus.PUBLISHED }));

        await service.decide('c1', { decision: ModerationDecision.HIDE, reason: 'vi phạm' }, ACTOR);

        expect(authz.can).toHaveBeenCalledWith(ACTOR, 'Review.Moderate');
        expect(authz.can).not.toHaveBeenCalledWith(ACTOR, 'Media.Moderate');
      });

      it('có Media.Moderate nhưng case là review -> 403, KHÔNG cho Media.Moderate xác thực quyết định review', async () => {
        casesRepo.findByIdForUpdate.mockResolvedValue(
          makeCase({ targetType: ModerationTargetType.REVIEW, targetId: 'r1' }),
        );
        authz.can.mockImplementation(async (_userId: string, perm: string) => perm === 'Media.Moderate');

        await expect(
          service.decide('c1', { decision: ModerationDecision.HIDE, reason: 'vi phạm' }, ACTOR),
        ).rejects.toThrow(ForbiddenException);
        expect(casesRepo.findReviewForUpdate).not.toHaveBeenCalled();
      });

      it('có Review.Moderate nhưng case là media -> 403, KHÔNG cho Review.Moderate xác thực quyết định media', async () => {
        casesRepo.findByIdForUpdate.mockResolvedValue(makeCase({ targetType: ModerationTargetType.MEDIA }));
        authz.can.mockImplementation(async (_userId: string, perm: string) => perm === 'Review.Moderate');

        await expect(service.decide('c1', { decision: ModerationDecision.APPROVE }, ACTOR)).rejects.toThrow(
          ForbiddenException,
        );
        expect(mediaRepo.findByIdForUpdate).not.toHaveBeenCalled();
      });

      it('không có quyền nào cả -> 403, KHÔNG chạm tới target/case resolve', async () => {
        casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
        authz.can.mockResolvedValue(false);

        await expect(service.decide('c1', { decision: ModerationDecision.APPROVE }, ACTOR)).rejects.toThrow(
          ForbiddenException,
        );
        expect(mediaRepo.findByIdForUpdate).not.toHaveBeenCalled();
        expect(casesRepo.resolve).not.toHaveBeenCalled();
      });
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

      await service.decide('c1', {
          decision: ModerationDecision.REJECT,
          reason: 'nội dung không liên quan',
          reason_code: MediaModerationReasonCode.UNRELATED_TO_PLACE,
        }, ACTOR);

      expect(mediaRepo.updateStatus).toHaveBeenCalledWith(manager, 'm1', MediaStatus.REJECTED);
      expect(reportsRepo.resolveByCaseId).toHaveBeenCalledWith(manager, 'c1', ReportStatus.UPHELD);
    });

    // Controlled Media Rejection Reason (2026-08-12) — hợp đồng quyết định. `reason_code` là thứ
    // DUY NHẤT của một quyết định sẽ tới tay chủ cơ sở, nên nó phải: bắt buộc đúng chỗ, bị cấm ở
    // mọi chỗ khác, và KHÔNG BAO GIỜ thay thế/lẫn với `reason` (ghi chú nội bộ).
    describe('reason_code có kiểm soát (Controlled Media Rejection Reason)', () => {
      it('reject kèm reason nhưng THIẾU reason_code -> 422, KHÔNG đổi status', async () => {
        casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
        mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PENDING }));

        await expect(
          service.decide('c1', { decision: ModerationDecision.REJECT, reason: 'ghi chú nội bộ' }, ACTOR),
        ).rejects.toThrow(/reason_code/);
        expect(mediaRepo.updateStatus).not.toHaveBeenCalled();
        expect(casesRepo.resolve).not.toHaveBeenCalled();
      });

      it('reject hợp lệ -> ghi CẢ HAI trường vào case: reason_code có kiểm soát VÀ reason free text, tách bạch', async () => {
        casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
        mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PENDING }));

        await service.decide(
          'c1',
          {
            decision: ModerationDecision.REJECT,
            reason: 'trùng case #4821 — theo dõi tài khoản này',
            reason_code: MediaModerationReasonCode.LOW_QUALITY,
          },
          ACTOR,
        );

        expect(casesRepo.resolve).toHaveBeenCalledWith(
          manager,
          'c1',
          expect.objectContaining({
            decision: ModerationDecision.REJECT,
            reason: 'trùng case #4821 — theo dõi tài khoản này',
            reasonCode: MediaModerationReasonCode.LOW_QUALITY,
          }),
        );
      });

      it.each([
        [ModerationDecision.APPROVE, MediaStatus.PENDING],
        [ModerationDecision.HIDE, MediaStatus.PUBLISHED],
        [ModerationDecision.RESTORE, MediaStatus.REJECTED],
        [ModerationDecision.DISMISS, MediaStatus.PENDING],
      ])('reason_code gửi kèm decision=%s -> 422 (chỉ reject mới nhận mã)', async (decision, status) => {
        casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
        mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status }));

        await expect(
          service.decide(
            'c1',
            {
              decision,
              reason: 'lý do nội bộ',
              target_status: MediaStatus.PUBLISHED,
              reason_code: MediaModerationReasonCode.OTHER,
            },
            ACTOR,
          ),
        ).rejects.toThrow(/reason_code/);
        expect(casesRepo.resolve).not.toHaveBeenCalled();
      });

      it('approve KHÔNG đòi reason_code (không có gì để giải thích cho chủ cơ sở) và ghi reasonCode=null', async () => {
        casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
        mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PENDING }));

        await service.decide('c1', { decision: ModerationDecision.APPROVE }, ACTOR);

        expect(mediaRepo.updateStatus).toHaveBeenCalledWith(manager, 'm1', MediaStatus.PUBLISHED);
        expect(casesRepo.resolve).toHaveBeenCalledWith(manager, 'c1', expect.objectContaining({ reasonCode: null }));
      });

      it('hide KHÔNG đòi reason_code (ngoài phạm vi taxonomy) và ghi reasonCode=null', async () => {
        casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
        mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PUBLISHED }));

        await service.decide('c1', { decision: ModerationDecision.HIDE, reason: 'vi phạm' }, ACTOR);

        expect(mediaRepo.updateStatus).toHaveBeenCalledWith(manager, 'm1', MediaStatus.HIDDEN);
        expect(casesRepo.resolve).toHaveBeenCalledWith(manager, 'c1', expect.objectContaining({ reasonCode: null }));
      });

      // Khôi phục KHÔNG được mang theo mã lý do — case khôi phục ghi `null`, nên không có mã nào
      // "sống sót" trên quyết định mới để đường đọc của chủ cơ sở nhặt lại.
      it('restore ghi reasonCode=null trên case của chính nó', async () => {
        casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
        mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.REJECTED }));

        await service.decide(
          'c1',
          { decision: ModerationDecision.RESTORE, target_status: MediaStatus.PUBLISHED },
          ACTOR,
        );

        expect(casesRepo.resolve).toHaveBeenCalledWith(manager, 'c1', expect.objectContaining({ reasonCode: null }));
      });

      it('dismiss ghi reasonCode=null (hành động cấp case, không phán xét nội dung)', async () => {
        casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
        mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PENDING }));

        await service.decide('c1', { decision: ModerationDecision.DISMISS, reason: 'report vô căn cứ' }, ACTOR);

        expect(casesRepo.resolve).toHaveBeenCalledWith(manager, 'c1', expect.objectContaining({ reasonCode: null }));
      });
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

    // Owner Cover & Photo Ordering (2026-08-12) — ảnh rời khỏi `published` thì không còn tư cách
    // làm ảnh bìa. Dọn con trỏ trong CÙNG transaction với quyết định, không phải sau commit.
    describe('ảnh bìa khi media rời khỏi published', () => {
      it('hide -> dọn places.cover_image_id trong cùng transaction', async () => {
        casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
        mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PUBLISHED }));

        await service.decide('c1', { decision: ModerationDecision.HIDE, reason: 'vi phạm' }, ACTOR);

        expect(mediaRepo.clearCoverImageByMedia).toHaveBeenCalledWith('m1', manager);
      });

      it('reject -> dọn places.cover_image_id', async () => {
        casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
        mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PENDING }));

        await service.decide('c1', {
            decision: ModerationDecision.REJECT,
            reason: 'không liên quan',
            reason_code: MediaModerationReasonCode.UNRELATED_TO_PLACE,
          }, ACTOR);

        expect(mediaRepo.clearCoverImageByMedia).toHaveBeenCalledWith('m1', manager);
      });

      it('approve -> KHÔNG đụng tới ảnh bìa (ảnh vừa đủ điều kiện, không phải mất)', async () => {
        casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
        mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PENDING }));

        await service.decide('c1', { decision: ModerationDecision.APPROVE }, ACTOR);

        expect(mediaRepo.clearCoverImageByMedia).not.toHaveBeenCalled();
      });

      // dismiss KHÔNG đổi trạng thái nội dung ⇒ tư cách ảnh bìa cũng không đổi.
      it('dismiss -> KHÔNG đụng tới ảnh bìa', async () => {
        casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
        mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PUBLISHED }));

        await service.decide('c1', { decision: ModerationDecision.DISMISS }, ACTOR);

        expect(mediaRepo.clearCoverImageByMedia).not.toHaveBeenCalled();
      });
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
        service.decide('c1', { decision: ModerationDecision.REJECT, reason: 'lý do', reason_code: MediaModerationReasonCode.OTHER }, ACTOR),
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

      await service.decide('c1', { decision: ModerationDecision.REJECT, reason: 'lý do', reason_code: MediaModerationReasonCode.OTHER }, ACTOR);

      expect(events.publish).toHaveBeenCalledTimes(1);
      expect(events.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'CaseResolved' }));
    });

    describe('M7 — hook đánh giá gợi ý AI (evaluateModeratorDecision) SAU commit', () => {
      it('gọi evaluateModeratorDecision(caseId, decision) ĐÚNG với case/quyết định vừa commit', async () => {
        casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
        mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PENDING }));

        await service.decide('c1', { decision: ModerationDecision.APPROVE }, ACTOR);

        expect(aiRecommendations.evaluateModeratorDecision).toHaveBeenCalledWith('c1', ModerationDecision.APPROVE);
      });

      it('CHỈ gọi SAU khi transaction commit (cùng thứ tự audit/event — INV-9)', async () => {
        const callOrder: string[] = [];
        dataSource.transaction.mockImplementation(async (cb: (m: EntityManager) => Promise<unknown>) => {
          callOrder.push('transaction:start');
          const result = await cb(manager);
          callOrder.push('transaction:commit');
          return result;
        });
        aiRecommendations.evaluateModeratorDecision.mockImplementation(async () => {
          callOrder.push('ai:evaluate');
        });
        casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
        mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PENDING }));

        await service.decide('c1', { decision: ModerationDecision.APPROVE }, ACTOR);

        expect(callOrder.indexOf('ai:evaluate')).toBeGreaterThan(callOrder.indexOf('transaction:commit'));
      });

      it('evaluateModeratorDecision ném lỗi -> KHÔNG hoàn tác quyết định, decide() vẫn resolve bình thường', async () => {
        casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
        mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PENDING }));
        aiRecommendations.evaluateModeratorDecision.mockRejectedValue(new Error('ai db down'));

        await expect(service.decide('c1', { decision: ModerationDecision.APPROVE }, ACTOR)).resolves.toBeUndefined();
        expect(mediaRepo.updateStatus).toHaveBeenCalledWith(manager, 'm1', MediaStatus.PUBLISHED);
        expect(casesRepo.resolve).toHaveBeenCalled();
      });

      it('dismiss cũng gọi evaluateModeratorDecision (mọi quyết định — kể cả dismiss — đều so sánh được)', async () => {
        casesRepo.findByIdForUpdate.mockResolvedValue(makeCase());
        mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PENDING }));

        await service.decide('c1', { decision: ModerationDecision.DISMISS }, ACTOR);

        expect(aiRecommendations.evaluateModeratorDecision).toHaveBeenCalledWith('c1', ModerationDecision.DISMISS);
      });
    });
  });

  describe('decide (M4, T2 — target_type=review)', () => {
    const ACTOR = 'moderator-1'; // khác review.userId ('author-1') — không tự kiểm duyệt
    const reviewCase = (overrides: Partial<ModerationCase> = {}) =>
      makeCase({ targetType: ModerationTargetType.REVIEW, targetId: 'r1', ...overrides });

    it('review không còn tồn tại -> 422, KHÔNG throw 404', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(reviewCase());
      casesRepo.findReviewForUpdate.mockResolvedValue(null);

      await expect(service.decide('c1', { decision: ModerationDecision.HIDE, reason: 'x' }, ACTOR)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(casesRepo.updateReviewStatus).not.toHaveBeenCalled();
    });

    it('INV-12: moderator là chính tác giả review -> 403, cả quyết định nội dung lẫn dismiss', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(reviewCase());
      casesRepo.findReviewForUpdate.mockResolvedValue(makeReview({ userId: 'author-self' }));

      await expect(
        service.decide('c1', { decision: ModerationDecision.HIDE, reason: 'x' }, 'author-self'),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.decide('c1', { decision: ModerationDecision.DISMISS }, 'author-self'),
      ).rejects.toThrow(ForbiddenException);
      expect(casesRepo.updateReviewStatus).not.toHaveBeenCalled();
    });

    it('published + hide KHÔNG kèm reason -> 422, KHÔNG đổi status, KHÔNG tính lại rating', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(reviewCase());
      casesRepo.findReviewForUpdate.mockResolvedValue(makeReview({ status: ReviewStatus.PUBLISHED }));

      await expect(service.decide('c1', { decision: ModerationDecision.HIDE }, ACTOR)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(casesRepo.updateReviewStatus).not.toHaveBeenCalled();
      expect(placesRepo.recalculateRating).not.toHaveBeenCalled();
    });

    it('published + hide kèm reason -> hidden, resolve case, reports upheld, TÍNH LẠI rating (INV-4)', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(reviewCase());
      casesRepo.findReviewForUpdate.mockResolvedValue(makeReview({ status: ReviewStatus.PUBLISHED, placeId: 'place-9' }));

      await service.decide('c1', { decision: ModerationDecision.HIDE, reason: 'vi phạm chính sách' }, ACTOR);

      expect(casesRepo.updateReviewStatus).toHaveBeenCalledWith(manager, 'r1', ReviewStatus.HIDDEN);
      expect(placesRepo.recalculateRating).toHaveBeenCalledWith('place-9', manager);
      expect(casesRepo.resolve).toHaveBeenCalledWith(
        manager,
        'c1',
        expect.objectContaining({ status: ModerationCaseStatus.RESOLVED, decision: ModerationDecision.HIDE }),
      );
      expect(reportsRepo.resolveByCaseId).toHaveBeenCalledWith(manager, 'c1', ReportStatus.UPHELD);
    });

    it('recalculateRating được gọi SAU updateReviewStatus, TRONG cùng transaction manager (INV-4)', async () => {
      const order: string[] = [];
      casesRepo.findByIdForUpdate.mockResolvedValue(reviewCase());
      casesRepo.findReviewForUpdate.mockResolvedValue(makeReview({ status: ReviewStatus.PUBLISHED }));
      casesRepo.updateReviewStatus.mockImplementation(async () => {
        order.push('updateReviewStatus');
      });
      placesRepo.recalculateRating.mockImplementation(async () => {
        order.push('recalculateRating');
      });

      await service.decide('c1', { decision: ModerationDecision.HIDE, reason: 'x' }, ACTOR);

      expect(order).toEqual(['updateReviewStatus', 'recalculateRating']);
    });

    it('hidden + restore KHÔNG kèm target_status -> published (chỉ MỘT đích hợp lệ, không cần đoán)', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(reviewCase());
      casesRepo.findReviewForUpdate.mockResolvedValue(makeReview({ status: ReviewStatus.HIDDEN }));

      await service.decide('c1', { decision: ModerationDecision.RESTORE }, ACTOR);

      expect(casesRepo.updateReviewStatus).toHaveBeenCalledWith(manager, 'r1', ReviewStatus.PUBLISHED);
      expect(placesRepo.recalculateRating).toHaveBeenCalledWith('place-1', manager);
    });

    it('hidden + restore kèm target_status=published -> published (tường minh, vẫn hợp lệ)', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(reviewCase());
      casesRepo.findReviewForUpdate.mockResolvedValue(makeReview({ status: ReviewStatus.HIDDEN }));

      await service.decide(
        'c1',
        { decision: ModerationDecision.RESTORE, target_status: MediaStatus.PUBLISHED },
        ACTOR,
      );

      expect(casesRepo.updateReviewStatus).toHaveBeenCalledWith(manager, 'r1', ReviewStatus.PUBLISHED);
    });

    it('hidden + restore kèm target_status=pending -> 422 (review chỉ có MỘT đích restore hợp lệ, mâu thuẫn O1)', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(reviewCase());
      casesRepo.findReviewForUpdate.mockResolvedValue(makeReview({ status: ReviewStatus.HIDDEN }));

      await expect(
        service.decide('c1', { decision: ModerationDecision.RESTORE, target_status: MediaStatus.PENDING }, ACTOR),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(casesRepo.updateReviewStatus).not.toHaveBeenCalled();
    });

    it('pending + approve -> published (đường lịch sử/chèn tay — API hiện tại không tạo review pending), TÍNH LẠI rating', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(reviewCase());
      casesRepo.findReviewForUpdate.mockResolvedValue(makeReview({ status: ReviewStatus.PENDING }));

      await service.decide('c1', { decision: ModerationDecision.APPROVE }, ACTOR);

      expect(casesRepo.updateReviewStatus).toHaveBeenCalledWith(manager, 'r1', ReviewStatus.PUBLISHED);
      expect(placesRepo.recalculateRating).toHaveBeenCalledWith('place-1', manager);
      expect(reportsRepo.resolveByCaseId).toHaveBeenCalledWith(manager, 'c1', ReportStatus.DISMISSED);
    });

    it('transition không hợp lệ (vd published + approve) -> 422, uỷ quyền hoàn toàn cho FSM review', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(reviewCase());
      casesRepo.findReviewForUpdate.mockResolvedValue(makeReview({ status: ReviewStatus.PUBLISHED }));

      await expect(service.decide('c1', { decision: ModerationDecision.APPROVE }, ACTOR)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(casesRepo.updateReviewStatus).not.toHaveBeenCalled();
      expect(placesRepo.recalculateRating).not.toHaveBeenCalled();
    });

    it('decision=reject trên review -> 422 tường minh (review không có trạng thái rejected, ADR-018 D5)', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(reviewCase());
      casesRepo.findReviewForUpdate.mockResolvedValue(makeReview({ status: ReviewStatus.PUBLISHED }));

      await expect(
        service.decide('c1', { decision: ModerationDecision.REJECT, reason: 'x' }, ACTOR),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(casesRepo.updateReviewStatus).not.toHaveBeenCalled();
    });

    // Controlled Media Rejection Reason (2026-08-12) — taxonomy mô tả thuộc tính của một BỨC ẢNH.
    // Không mã nào nói được điều gì đúng về một bài đánh giá, nên case review từ chối thẳng thay
    // vì âm thầm bỏ qua và để một mã vô nghĩa nằm sẵn trong CSDL.
    it('reason_code trên case review -> 422, KHÔNG ghi gì (taxonomy chỉ dành cho media)', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(reviewCase());
      casesRepo.findReviewForUpdate.mockResolvedValue(makeReview({ status: ReviewStatus.PUBLISHED }));

      await expect(
        service.decide(
          'c1',
          { decision: ModerationDecision.HIDE, reason: 'vi phạm', reason_code: MediaModerationReasonCode.OTHER },
          ACTOR,
        ),
      ).rejects.toThrow(/reason_code/);
      expect(casesRepo.updateReviewStatus).not.toHaveBeenCalled();
      expect(casesRepo.resolve).not.toHaveBeenCalled();
    });

    it('hide review hợp lệ -> case ghi reasonCode=null (review không bao giờ mang mã)', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(reviewCase());
      casesRepo.findReviewForUpdate.mockResolvedValue(makeReview({ status: ReviewStatus.PUBLISHED }));

      await service.decide('c1', { decision: ModerationDecision.HIDE, reason: 'vi phạm' }, ACTOR);

      expect(casesRepo.resolve).toHaveBeenCalledWith(manager, 'c1', expect.objectContaining({ reasonCode: null }));
    });

    it('decision=dismiss -> case dismissed, KHÔNG đổi review.status, KHÔNG tính lại rating, reports dismissed', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(reviewCase());
      casesRepo.findReviewForUpdate.mockResolvedValue(makeReview({ status: ReviewStatus.PUBLISHED }));

      await service.decide('c1', { decision: ModerationDecision.DISMISS, reason: 'report vô căn cứ' }, ACTOR);

      expect(casesRepo.updateReviewStatus).not.toHaveBeenCalled();
      expect(placesRepo.recalculateRating).not.toHaveBeenCalled();
      expect(casesRepo.resolve).toHaveBeenCalledWith(
        manager,
        'c1',
        expect.objectContaining({ status: ModerationCaseStatus.DISMISSED, decision: ModerationDecision.DISMISS }),
      );
      expect(reportsRepo.resolveByCaseId).toHaveBeenCalledWith(manager, 'c1', ReportStatus.DISMISSED);
    });

    it('KHÔNG audit/event nào được gọi TRƯỚC khi transaction hoàn tất (INV-9)', async () => {
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
      casesRepo.findByIdForUpdate.mockResolvedValue(reviewCase());
      casesRepo.findReviewForUpdate.mockResolvedValue(makeReview({ status: ReviewStatus.PUBLISHED }));

      await service.decide('c1', { decision: ModerationDecision.HIDE, reason: 'x' }, ACTOR);

      const commitIndex = callOrder.indexOf('transaction:commit');
      const firstAuditOrEvent = callOrder.findIndex((c) => c.startsWith('audit') || c.startsWith('event'));
      expect(commitIndex).toBeGreaterThanOrEqual(0);
      expect(firstAuditOrEvent).toBeGreaterThan(commitIndex);
    });

    it('audit ghi lỗi SAU commit -> KHÔNG hoàn tác, decide() vẫn resolve bình thường', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(reviewCase());
      casesRepo.findReviewForUpdate.mockResolvedValue(makeReview({ status: ReviewStatus.PUBLISHED }));
      audit.record.mockRejectedValue(new Error('audit DB down'));

      await expect(
        service.decide('c1', { decision: ModerationDecision.HIDE, reason: 'x' }, ACTOR),
      ).resolves.toBeUndefined();
      expect(casesRepo.updateReviewStatus).toHaveBeenCalledWith(manager, 'r1', ReviewStatus.HIDDEN);
    });

    it('publish event lỗi SAU commit -> KHÔNG hoàn tác, decide() vẫn resolve bình thường', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(reviewCase());
      casesRepo.findReviewForUpdate.mockResolvedValue(makeReview({ status: ReviewStatus.PUBLISHED }));
      events.publish.mockRejectedValue(new Error('broker down'));

      await expect(
        service.decide('c1', { decision: ModerationDecision.HIDE, reason: 'x' }, ACTOR),
      ).resolves.toBeUndefined();
      expect(casesRepo.updateReviewStatus).toHaveBeenCalledWith(manager, 'r1', ReviewStatus.HIDDEN);
    });

    it('hide -> phát ContentHidden(targetType=review) + CaseResolved', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(reviewCase());
      casesRepo.findReviewForUpdate.mockResolvedValue(makeReview({ status: ReviewStatus.PUBLISHED }));

      await service.decide('c1', { decision: ModerationDecision.HIDE, reason: 'x' }, ACTOR);

      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ContentHidden', targetType: ModerationTargetType.REVIEW, targetId: 'r1' }),
      );
      expect(events.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'CaseResolved' }));
    });

    it('approve -> phát ContentApproved(targetType=review) + CaseResolved', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(reviewCase());
      casesRepo.findReviewForUpdate.mockResolvedValue(makeReview({ status: ReviewStatus.PENDING }));

      await service.decide('c1', { decision: ModerationDecision.APPROVE }, ACTOR);

      expect(events.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ContentApproved', targetType: ModerationTargetType.REVIEW, targetId: 'r1' }),
      );
      expect(events.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'CaseResolved' }));
    });

    it('restore (hidden->published) -> phát ContentApproved + CaseResolved (cùng nhánh newStatus===published)', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(reviewCase());
      casesRepo.findReviewForUpdate.mockResolvedValue(makeReview({ status: ReviewStatus.HIDDEN }));

      await service.decide('c1', { decision: ModerationDecision.RESTORE }, ACTOR);

      expect(events.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'ContentApproved' }));
      expect(events.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'CaseResolved' }));
    });

    it('audit ghi entityType="review" và context kèm placeId (khác media — không có placeId)', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(reviewCase());
      casesRepo.findReviewForUpdate.mockResolvedValue(makeReview({ status: ReviewStatus.PUBLISHED, placeId: 'place-7' }));

      await service.decide('c1', { decision: ModerationDecision.HIDE, reason: 'x' }, ACTOR);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'moderation.decided',
          entityType: 'review',
          entityId: 'r1',
          context: { caseId: 'c1', placeId: 'place-7' },
        }),
      );
    });

    it('media unchanged: quyết định media vẫn hoạt động bình thường sau khi thêm nhánh review (không hồi quy M3)', async () => {
      casesRepo.findByIdForUpdate.mockResolvedValue(makeCase({ targetType: ModerationTargetType.MEDIA }));
      mediaRepo.findByIdForUpdate.mockResolvedValue(makeMedia({ status: MediaStatus.PENDING }));

      await service.decide('c1', { decision: ModerationDecision.APPROVE }, ACTOR);

      expect(mediaRepo.updateStatus).toHaveBeenCalledWith(manager, 'm1', MediaStatus.PUBLISHED);
      expect(casesRepo.findReviewForUpdate).not.toHaveBeenCalled();
      expect(placesRepo.recalculateRating).not.toHaveBeenCalled();
    });
  });
});
