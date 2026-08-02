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
import { DataSource } from 'typeorm';
import { clampLimit, clampPage, paginate } from '../../common/pagination';
import { ModerationCasesRepository } from './repositories/moderation-cases.repository';
import { ReportsRepository } from './repositories/reports.repository';
import { MediaRepository } from '../media/repositories/media.repository';
import { AuditService } from '../../core/audit/audit.service';
import {
  CaseResolvedEvent,
  ContentApprovedEvent,
  ContentHiddenEvent,
  MODERATION_EVENT_PUBLISHER,
  ModerationEventPublisher,
} from './events/moderation-events';
import { DecideModerationCaseDto, ListModerationCasesQueryDto } from './dto/moderation.dto';
import { ModerationCaseStatus, ModerationDecision, ModerationTargetType, ReportStatus } from './moderation.enums';
import { MediaStatus } from '../media/media.enums';
import { assertValidMediaTransition, MediaTransitionAction } from './media-moderation.transition';
import { toModerationCaseDetail, toModerationCaseSummary } from './moderation.mapper';

interface DecisionOutcome {
  actorId: string;
  caseId: string;
  mediaId: string;
  decision: ModerationDecision;
  previousStatus: MediaStatus;
  newStatus: MediaStatus;
  contentChanged: boolean;
}

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private readonly casesRepo: ModerationCasesRepository,
    private readonly reportsRepo: ReportsRepository,
    private readonly mediaRepo: MediaRepository,
    private readonly audit: AuditService,
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
   * POST /moderation/cases/{id}/decide (M3, ADR-018 T2). CHỈ hỗ trợ target_type=media — kiểm
   * duyệt review là M4, ngoài phạm vi milestone này (§Do not implement, chỉ đạo M3). Toàn bộ
   * transition đi qua `assertValidMediaTransition` (FSM thuần, M1) — service KHÔNG tự cài lại
   * logic chuyển trạng thái ở đây.
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
      // M3 — chỉ media. Review-type case tồn tại được (vd từ M5 report sau này) nhưng quyết định
      // trên nó chưa được triển khai; từ chối tường minh thay vì áp sai FSM.
      if (found.targetType !== ModerationTargetType.MEDIA) {
        throw new UnprocessableEntityException(
          'Chỉ hỗ trợ kiểm duyệt media ở milestone hiện tại (M3) — kiểm duyệt review thuộc M4.',
        );
      }

      // Bước 3: nạp target; assert tồn tại (422 nếu đã xoá — target_id không FK cứng, ADR-018 D9).
      const media = await this.mediaRepo.findByIdForUpdate(manager, found.targetId);
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
        await this.casesRepo.resolve(manager, found.id, {
          status: ModerationCaseStatus.DISMISSED,
          decision: ModerationDecision.DISMISS,
          reason: dto.reason ?? null,
          resolvedBy: actorId,
          resolvedAt,
        });
        await this.reportsRepo.resolveByCaseId(manager, found.id, ReportStatus.DISMISSED);
        return {
          actorId,
          caseId: found.id,
          mediaId: media.id,
          decision: dto.decision,
          previousStatus: media.status,
          newStatus: media.status,
          contentChanged: false,
        } satisfies DecisionOutcome;
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
      await this.casesRepo.resolve(manager, found.id, {
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
      await this.reportsRepo.resolveByCaseId(manager, found.id, reportOutcome);

      return {
        actorId,
        caseId: found.id,
        mediaId: media.id,
        decision: dto.decision,
        previousStatus,
        newStatus,
        contentChanged: true,
      } satisfies DecisionOutcome;
    });

    // Đến đây transaction đã COMMIT. INV-9: audit/event CHỈ sau commit.
    await this.emitPostCommit(outcome);
  }

  /**
   * Audit + domain event SAU KHI commit (INV-9). Lỗi ở đây KHÔNG hoàn tác quyết định đã ghi
   * thành công — chỉ log (ADR-018 §11, cùng hành vi `ReviewsService.emitPostCommit`).
   */
  private async emitPostCommit(outcome: DecisionOutcome): Promise<void> {
    try {
      await this.audit.record({
        event: 'moderation.decided',
        entityType: 'media',
        entityId: outcome.mediaId,
        actorId: outcome.actorId,
        before: { status: outcome.previousStatus },
        after: { status: outcome.newStatus, decision: outcome.decision },
        context: { caseId: outcome.caseId },
      });
    } catch (err) {
      this.logger.error(`Ghi audit moderation.decided cho case ${outcome.caseId} thất bại: ${(err as Error).message}`);
    }

    try {
      if (outcome.contentChanged) {
        if (outcome.newStatus === MediaStatus.PUBLISHED) {
          await this.events.publish(
            new ContentApprovedEvent(ModerationTargetType.MEDIA, outcome.mediaId, outcome.caseId),
          );
        } else if (outcome.newStatus === MediaStatus.HIDDEN) {
          await this.events.publish(
            new ContentHiddenEvent(ModerationTargetType.MEDIA, outcome.mediaId, outcome.caseId),
          );
        }
        // reject / restore-về-pending: không có event hiển thị riêng — content không "approved"
        // hay "hidden" theo đúng ngữ nghĩa hai event đó (xem moderation-events.ts). CaseResolved
        // bên dưới vẫn LUÔN phát bất kể nhánh nào.
      }
      await this.events.publish(new CaseResolvedEvent(outcome.caseId, outcome.decision));
    } catch (err) {
      this.logger.error(`Phát event cho case ${outcome.caseId} thất bại: ${(err as Error).message}`);
    }
  }
}
