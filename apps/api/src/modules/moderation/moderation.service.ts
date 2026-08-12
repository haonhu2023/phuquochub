import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { clampLimit, clampPage, paginate } from '../../common/pagination';
import { ModerationCasesRepository } from './repositories/moderation-cases.repository';
import { ReportsRepository } from './repositories/reports.repository';
import { MediaRepository } from '../media/repositories/media.repository';
import { PlacesRepository } from '../places/repositories/places.repository';
import { AuthorizationService } from '../authz/authorization.service';
import { AuditService } from '../../core/audit/audit.service';
import {
  CaseResolvedEvent,
  ContentApprovedEvent,
  ContentHiddenEvent,
  MODERATION_EVENT_PUBLISHER,
  ModerationEventPublisher,
} from './events/moderation-events';
import { AiRecommendationsService } from './ai-recommendations.service';
import { DecideModerationCaseDto, ListModerationCasesQueryDto } from './dto/moderation.dto';
import { ModerationCaseStatus, ModerationDecision, ModerationTargetType, ReportStatus } from './moderation.enums';
import { MediaStatus } from '../media/media.enums';
import { ReviewStatus } from '../reviews/review.enums';
import { assertValidMediaTransition, MediaTransitionAction } from './media-moderation.transition';
import { assertValidReviewTransition, ReviewTransitionAction } from './review-moderation.transition';
import { toModerationCaseDetail, toModerationCaseSummary } from './moderation.mapper';

// Quyền quyết định phụ thuộc target_type CỦA CHÍNH CASE — một giá trị runtime, không biết được ở
// thời điểm khai báo route. Vì vậy KHÔNG dùng @RequirePermissions tĩnh trên controller cho decide()
// — permission được chọn ở ĐÂY, sau khi đã khoá+đọc case (thấy targetType), và không bao giờ được
// dùng lẫn (Media.Moderate không được xác thực một quyết định review, và ngược lại).
const PERMISSION_BY_TARGET_TYPE: Partial<Record<ModerationTargetType, string>> = {
  [ModerationTargetType.MEDIA]: 'Media.Moderate',
  [ModerationTargetType.REVIEW]: 'Review.Moderate',
};

interface MediaDecisionOutcome {
  targetType: ModerationTargetType.MEDIA;
  actorId: string;
  caseId: string;
  targetId: string;
  decision: ModerationDecision;
  previousStatus: MediaStatus;
  newStatus: MediaStatus;
  contentChanged: boolean;
}

interface ReviewDecisionOutcome {
  targetType: ModerationTargetType.REVIEW;
  actorId: string;
  caseId: string;
  targetId: string;
  placeId: string;
  decision: ModerationDecision;
  previousStatus: ReviewStatus;
  newStatus: ReviewStatus;
  contentChanged: boolean;
}

type DecisionOutcome = MediaDecisionOutcome | ReviewDecisionOutcome;

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private readonly casesRepo: ModerationCasesRepository,
    private readonly reportsRepo: ReportsRepository,
    private readonly mediaRepo: MediaRepository,
    private readonly placesRepo: PlacesRepository,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditService,
    private readonly aiRecommendations: AiRecommendationsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(MODERATION_EVENT_PUBLISHER)
    private readonly events: ModerationEventPublisher,
  ) {}

  // M2 — CHỈ ĐỌC. Không status nào bị đổi; không audit event nào được ghi (đọc thuần không thuộc
  // chính sách audit ADR-016 — chỉ hành động đặc quyền/đổi trạng thái mới ghi audit).
  async list(query: ListModerationCasesQueryDto) {
    const page = clampPage(query.page);
    const limit = clampLimit(query.limit);
    const statuses = query.status ? [query.status] : [ModerationCaseStatus.OPEN, ModerationCaseStatus.CLAIMED];

    const { items, total } = await this.casesRepo.list({
      statuses,
      targetType: query.target_type,
      source: query.source,
      severity: query.severity,
      assignedTo: query.assigned_to,
      limit,
      offset: (page - 1) * limit,
    });

    return paginate(items.map(toModerationCaseSummary), page, limit, total);
  }

  async getById(id: string) {
    const found = await this.casesRepo.findById(id);
    if (!found) {
      throw new NotFoundException('Không tìm thấy case kiểm duyệt');
    }

    const [reports, preview] = await Promise.all([
      this.reportsRepo.findByCaseId(found.id),
      this.casesRepo.findTargetPreview(found.targetType, found.targetId),
    ]);

    return toModerationCaseDetail(found, reports, preview);
  }

  /**
   * POST /moderation/cases/{id}/decide (M3: media; M4: review — ADR-018 T2). `place` case tồn tại
   * được (enum đã dự trù) nhưng KHÔNG có FSM đăng ký (MR-4, ngoài phạm vi M1–M7) — từ chối tường
   * minh (422). Toàn bộ transition đi qua FSM thuần tương ứng (`assertValidMediaTransition` /
   * `assertValidReviewTransition`) — service KHÔNG tự cài lại logic chuyển trạng thái.
   */
  async decide(caseId: string, dto: DecideModerationCaseDto, actorId: string): Promise<void> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      // Bước 1 (T2): khoá case — chốt chặn concurrency duy nhất, xem
      // ModerationCasesRepository.findByIdForUpdate.
      const found = await this.casesRepo.findByIdForUpdate(manager, caseId);
      if (!found) {
        throw new NotFoundException('Không tìm thấy case kiểm duyệt');
      }
      // Bước 2: case phải còn xử lý được.
      if (found.status !== ModerationCaseStatus.OPEN && found.status !== ModerationCaseStatus.CLAIMED) {
        throw new ConflictException('Case đã được xử lý bởi moderator khác');
      }

      // `place` chưa đăng ký FSM (MR-4) — không có gì để quyết định, và không có tên quyền nào
      // tương ứng để kiểm tra. Từ chối trước khi chạm tới bước phân quyền.
      const requiredPermission = PERMISSION_BY_TARGET_TYPE[found.targetType];
      if (!requiredPermission) {
        throw new UnprocessableEntityException(
          `Kiểm duyệt target_type="${found.targetType}" chưa được hỗ trợ (chưa đăng ký FSM).`,
        );
      }

      // Bước 2.5 — CHỌN quyền theo target_type CỦA CHÍNH CASE này (Media.Moderate cho media,
      // Review.Moderate cho review) — không bao giờ dùng lẫn. Đây là lý do decide() không có
      // @RequirePermissions tĩnh: quyền cần kiểm tra chỉ biết được SAU khi đã đọc `found` ở trên.
      if (!(await this.authz.can(actorId, requiredPermission))) {
        throw new ForbiddenException(`Thiếu quyền: ${requiredPermission}`);
      }

      if (found.targetType === ModerationTargetType.MEDIA) {
        return this.decideMedia(manager, found.id, found.targetId, dto, actorId);
      }
      return this.decideReview(manager, found.id, found.targetId, dto, actorId);
    });

    // Đến đây transaction đã COMMIT. INV-9: audit/event CHỈ sau commit.
    await this.emitPostCommit(outcome);
  }

  private async decideMedia(
    manager: EntityManager,
    caseId: string,
    mediaId: string,
    dto: DecideModerationCaseDto,
    actorId: string,
  ): Promise<MediaDecisionOutcome> {
    // Bước 3: nạp target; assert tồn tại (422 nếu đã xoá — target_id không FK cứng, ADR-018 D9).
    const media = await this.mediaRepo.findByIdForUpdate(manager, mediaId);
    if (!media) {
      throw new UnprocessableEntityException('Media của case này không còn tồn tại.');
    }

    // Bước 4 (INV-12): không tự kiểm duyệt nội dung của chính mình. Áp dụng cho MỌI decision kể
    // cả dismiss (dismiss vẫn là một phán quyết về nội dung của chính bạn).
    if (media.uploadedBy !== null && media.uploadedBy === actorId) {
      throw new ForbiddenException('Không thể tự kiểm duyệt nội dung của chính mình.');
    }

    const resolvedAt = new Date();

    // decision=dismiss: hành động Ở CẤP CASE, KHÔNG đổi trạng thái nội dung (moderation-design.md
    // §5.1) — report vô căn cứ hoặc case mở nhầm.
    if (dto.decision === ModerationDecision.DISMISS) {
      await this.casesRepo.resolve(manager, caseId, {
        status: ModerationCaseStatus.DISMISSED,
        decision: ModerationDecision.DISMISS,
        reason: dto.reason ?? null,
        resolvedBy: actorId,
        resolvedAt,
      });
      await this.reportsRepo.resolveByCaseId(manager, caseId, ReportStatus.DISMISSED);
      return {
        targetType: ModerationTargetType.MEDIA,
        actorId,
        caseId,
        targetId: media.id,
        decision: dto.decision,
        previousStatus: media.status,
        newStatus: media.status,
        contentChanged: false,
      };
    }

    // INV-11: reject/hide bắt buộc có reason khác rỗng.
    if (
      (dto.decision === ModerationDecision.REJECT || dto.decision === ModerationDecision.HIDE) &&
      !dto.reason?.trim()
    ) {
      throw new UnprocessableEntityException(`Quyết định "${dto.decision}" bắt buộc có lý do.`);
    }

    // dismiss đã loại ở nhánh trên — 4 giá trị còn lại của ModerationDecision khớp 1:1 giá trị
    // chuỗi của MediaTransitionAction ('approve'|'reject'|'hide'|'restore').
    const action = dto.decision as unknown as MediaTransitionAction;
    const previousStatus = media.status;
    const newStatus = assertValidMediaTransition(previousStatus, action, dto.target_status);

    await this.mediaRepo.updateStatus(manager, media.id, newStatus);
    // Ảnh RỜI khỏi `published` (ẩn/từ chối) thì không còn tư cách làm ảnh bìa — dọn con trỏ
    // `places.cover_image_id` trong CÙNG transaction với quyết định (Owner Cover & Photo Ordering,
    // 2026-08-12). Kênh công khai vốn đã an toàn dù không dọn (`COVER_IMAGE_COLS` lọc
    // `status = 'published'` một cách độc lập); dọn ở đây để một ảnh bị ẩn rồi khôi phục KHÔNG âm
    // thầm trở lại làm bìa — chủ cơ sở phải chọn lại tường minh. Idempotent: không có bìa nào trỏ
    // tới ảnh này thì UPDATE khớp 0 dòng, không phải lỗi.
    if (newStatus !== MediaStatus.PUBLISHED) {
      await this.mediaRepo.clearCoverImageByMedia(media.id, manager);
    }
    await this.casesRepo.resolve(manager, caseId, {
      status: ModerationCaseStatus.RESOLVED,
      decision: dto.decision,
      reason: dto.reason ?? null,
      resolvedBy: actorId,
      resolvedAt,
    });
    // reject/hide gỡ nội dung -> report(s) đúng (upheld); approve/restore giữ/khôi phục nội
    // dung -> report(s) vô căn cứ (dismissed). Hệ quả cơ học của resolve, không phải tính năng
    // "report resolution" riêng (M5) — xem ReportsRepository.resolveByCaseId.
    const reportOutcome =
      dto.decision === ModerationDecision.REJECT || dto.decision === ModerationDecision.HIDE
        ? ReportStatus.UPHELD
        : ReportStatus.DISMISSED;
    await this.reportsRepo.resolveByCaseId(manager, caseId, reportOutcome);

    return {
      targetType: ModerationTargetType.MEDIA,
      actorId,
      caseId,
      targetId: media.id,
      decision: dto.decision,
      previousStatus,
      newStatus,
      contentChanged: true,
    };
  }

  private async decideReview(
    manager: EntityManager,
    caseId: string,
    reviewId: string,
    dto: DecideModerationCaseDto,
    actorId: string,
  ): Promise<ReviewDecisionOutcome> {
    // Bước 3: nạp target; assert tồn tại (422 nếu đã xoá — target_id không FK cứng, ADR-018 D9).
    // `reviews` không có deleted_at (bất biến sau khi tạo ở MVP hiện tại) — "không còn tồn tại"
    // hiện chỉ có thể là dòng đã bị xoá vật lý, chưa xảy ra qua API nào, nhưng vẫn xử lý phòng thủ
    // giống media thay vì giả định không bao giờ null.
    const review = await this.casesRepo.findReviewForUpdate(manager, reviewId);
    if (!review) {
      throw new UnprocessableEntityException('Review của case này không còn tồn tại.');
    }

    // INV-12: không tự kiểm duyệt nội dung của chính mình — áp dụng cho MỌI decision kể cả dismiss,
    // cùng nguyên tắc nhánh media.
    if (review.userId === actorId) {
      throw new ForbiddenException('Không thể tự kiểm duyệt nội dung của chính mình.');
    }

    const resolvedAt = new Date();

    // decision=dismiss: hành động Ở CẤP CASE, KHÔNG đổi trạng thái nội dung — review.status
    // KHÔNG đổi nên KHÔNG cần recalculateRating (tập published không đổi).
    if (dto.decision === ModerationDecision.DISMISS) {
      await this.casesRepo.resolve(manager, caseId, {
        status: ModerationCaseStatus.DISMISSED,
        decision: ModerationDecision.DISMISS,
        reason: dto.reason ?? null,
        resolvedBy: actorId,
        resolvedAt,
      });
      await this.reportsRepo.resolveByCaseId(manager, caseId, ReportStatus.DISMISSED);
      return {
        targetType: ModerationTargetType.REVIEW,
        actorId,
        caseId,
        targetId: review.id,
        placeId: review.placeId,
        decision: dto.decision,
        previousStatus: review.status,
        newStatus: review.status,
        contentChanged: false,
      };
    }

    // Review không có trạng thái "rejected" (ADR-018 D5 — KHÔNG thêm giá trị vào review_status).
    // `reject` chỉ có nghĩa với media; ném 422 tường minh ở đây thay vì để giá trị lọt vào FSM review
    // (vốn chỉ định nghĩa 'hide'|'restore'|'approve' và sẽ trả về undefined một cách âm thầm nếu bị
    // ép kiểu — xem review-moderation.transition.ts).
    if (dto.decision === ModerationDecision.REJECT) {
      throw new UnprocessableEntityException('"reject" không áp dụng cho review — chỉ hỗ trợ hide/restore/approve.');
    }

    // INV-11: hide bắt buộc có reason khác rỗng (review không có reject, nên chỉ hide cần kiểm).
    if (dto.decision === ModerationDecision.HIDE && !dto.reason?.trim()) {
      throw new UnprocessableEntityException(`Quyết định "${dto.decision}" bắt buộc có lý do.`);
    }

    // dismiss/reject đã loại ở trên — 3 giá trị còn lại ('hide'|'restore'|'approve') khớp 1:1
    // ReviewTransitionAction.
    const action = dto.decision as unknown as ReviewTransitionAction;
    const previousStatus = review.status;
    const targetStatus = dto.target_status as unknown as ReviewStatus | undefined;
    const newStatus = assertValidReviewTransition(previousStatus, action, targetStatus);

    await this.casesRepo.updateReviewStatus(manager, review.id, newStatus);
    // INV-4 — MỌI thay đổi reviews.status làm đổi tập published PHẢI recalculateRating() trong
    // CÙNG transaction. Cả 3 transition hợp lệ (hide/restore/approve) đều băng qua ranh giới
    // published (không có transition review nào KHÔNG đổi tư cách published) nên luôn recalc ở
    // nhánh "nội dung thực sự đổi" này — không có nhánh content-changed nào được phép bỏ qua nó.
    await this.placesRepo.recalculateRating(review.placeId, manager);

    await this.casesRepo.resolve(manager, caseId, {
      status: ModerationCaseStatus.RESOLVED,
      decision: dto.decision,
      reason: dto.reason ?? null,
      resolvedBy: actorId,
      resolvedAt,
    });
    // hide gỡ nội dung -> report(s) đúng (upheld); approve/restore giữ/khôi phục nội dung ->
    // report(s) vô căn cứ (dismissed) — cùng logic nhánh media.
    const reportOutcome = dto.decision === ModerationDecision.HIDE ? ReportStatus.UPHELD : ReportStatus.DISMISSED;
    await this.reportsRepo.resolveByCaseId(manager, caseId, reportOutcome);

    return {
      targetType: ModerationTargetType.REVIEW,
      actorId,
      caseId,
      targetId: review.id,
      placeId: review.placeId,
      decision: dto.decision,
      previousStatus,
      newStatus,
      contentChanged: true,
    };
  }

  /**
   * Audit + domain event SAU KHI commit (INV-9). Lỗi ở đây KHÔNG hoàn tác quyết định đã ghi
   * thành công — chỉ log (ADR-018 §11, cùng hành vi `ReviewsService.emitPostCommit`).
   */
  private async emitPostCommit(outcome: DecisionOutcome): Promise<void> {
    try {
      await this.audit.record({
        event: 'moderation.decided',
        entityType: outcome.targetType,
        entityId: outcome.targetId,
        actorId: outcome.actorId,
        before: { status: outcome.previousStatus },
        after: { status: outcome.newStatus, decision: outcome.decision },
        context:
          outcome.targetType === ModerationTargetType.REVIEW
            ? { caseId: outcome.caseId, placeId: outcome.placeId }
            : { caseId: outcome.caseId },
      });
    } catch (err) {
      this.logger.error(`Ghi audit moderation.decided cho case ${outcome.caseId} thất bại: ${(err as Error).message}`);
    }

    try {
      if (outcome.contentChanged) {
        if (outcome.newStatus === MediaStatus.PUBLISHED || outcome.newStatus === ReviewStatus.PUBLISHED) {
          await this.events.publish(
            new ContentApprovedEvent(outcome.targetType, outcome.targetId, outcome.caseId),
          );
        } else if (outcome.newStatus === MediaStatus.HIDDEN || outcome.newStatus === ReviewStatus.HIDDEN) {
          await this.events.publish(
            new ContentHiddenEvent(outcome.targetType, outcome.targetId, outcome.caseId),
          );
        }
        // reject (media only) / restore-về-pending (media only): không có event hiển thị riêng —
        // content không "approved" hay "hidden" theo đúng ngữ nghĩa hai event đó (xem
        // moderation-events.ts). CaseResolved bên dưới vẫn LUÔN phát bất kể nhánh nào.
      }
      await this.events.publish(new CaseResolvedEvent(outcome.caseId, outcome.decision));
    } catch (err) {
      this.logger.error(`Phát event cho case ${outcome.caseId} thất bại: ${(err as Error).message}`);
    }

    // M7 (AI Shadow Mode) — so sánh gợi ý AI (nếu có) với quyết định THẬT vừa commit. Try/catch
    // RIÊNG, độc lập với audit/event ở trên: một lỗi ở đây (ví dụ DB tạm thời không tới bảng
    // ai_recommendations được) không được phép làm audit/event của quyết định thật bị bỏ dở, và
    // ngược lại — ba side-effect sau-commit này hoàn toàn độc lập với nhau.
    try {
      await this.aiRecommendations.evaluateModeratorDecision(outcome.caseId, outcome.decision);
    } catch (err) {
      this.logger.error(
        `Đánh giá gợi ý AI cho case ${outcome.caseId} thất bại: ${(err as Error).message}`,
      );
    }
  }
}
