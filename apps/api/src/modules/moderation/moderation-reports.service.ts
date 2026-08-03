import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ModerationCasesRepository } from './repositories/moderation-cases.repository';
import { ReportsRepository } from './repositories/reports.repository';
import { AuditService } from '../../core/audit/audit.service';
import {
  CaseOpenedEvent,
  MODERATION_EVENT_PUBLISHER,
  ModerationEventPublisher,
  ReportCreatedEvent,
} from './events/moderation-events';
import { ModerationCaseSeverity, ModerationCaseSource, ModerationTargetType, ReportReason } from './moderation.enums';
import { computePriority, computeSeverity } from './moderation-severity';

export interface CreateReportInput {
  targetType: ModerationTargetType;
  targetId: string;
  reporterId: string;
  reason: ReportReason;
  description: string | null;
}

interface ReportOutcome {
  reportId: string;
  caseId: string;
  targetType: ModerationTargetType;
  targetId: string;
  reporterId: string;
  isNewCase: boolean;
  caseSource: ModerationCaseSource;
}

/**
 * T3 (ADR-018/moderation-design.md §7/§9.2, Moderation Foundation M5). Lives in
 * `ModerationCoreModule` (not `ModerationModule`) specifically so `MediaModule`/`ReviewsModule` can
 * call it without a circular module dependency — see `moderation-core.module.ts`'s comment.
 *
 * Caller (`ReviewsService.report()`/`MediaService.report()`) is responsible for T3 step 1 — "target
 * exists and is in a reportable state" (published) — using its OWN repository, BEFORE calling this
 * method; this service starts at step 2 (case reuse/creation) and never touches `media`/`reviews`.
 */
@Injectable()
export class ModerationReportsService {
  private readonly logger = new Logger(ModerationReportsService.name);

  constructor(
    private readonly casesRepo: ModerationCasesRepository,
    private readonly reportsRepo: ReportsRepository,
    private readonly audit: AuditService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @Inject(MODERATION_EVENT_PUBLISHER)
    private readonly events: ModerationEventPublisher,
  ) {}

  async report(input: CreateReportInput): Promise<void> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      // Bước 2: thử tạo case MỚI trước (source=report, severity=normal — điểm khởi đầu, recompute
      // ở bước 4 dưới đây). `ON CONFLICT DO NOTHING` (INV-3's uq_moderation_cases_open_target) nếu
      // target đã có case open/claimed.
      const initialSeverity = ModerationCaseSeverity.NORMAL;
      let caseRow = await this.casesRepo.createOpenCase(manager, {
        targetType: input.targetType,
        targetId: input.targetId,
        source: ModerationCaseSource.REPORT,
        severity: initialSeverity,
        priority: computePriority(initialSeverity, 0),
      });
      let isNewCase = true;

      if (!caseRow) {
        // Case đã tồn tại — khoá nó TRONG transaction này trước khi đọc report_count/severity hiện
        // tại. Đây là chốt chặn concurrency DUY NHẤT của T3 cho việc tăng report_count: hai report
        // đồng thời trên CÙNG target (kể cả hai lần gọi trùng từ CHÍNH một reporter) phải xếp hàng
        // qua khoá này thay vì đọc-rồi-ghi không khoá (lost update).
        isNewCase = false;
        caseRow = await this.casesRepo.findOpenCaseForTargetForUpdate(manager, input.targetType, input.targetId);
        if (!caseRow) {
          // Race cực hiếm: case vừa bị resolve/dismiss GIỮA lúc createOpenCase() báo conflict và
          // câu SELECT ở trên chạy (case không còn open/claimed nữa). Không giả định "không thể
          // xảy ra" — tạo case MỚI thay vì để report trôi vô chủ. INSERT lần này chắc chắn thắng vì
          // case cũ (đã resolved/dismissed) không còn khớp partial unique index open/claimed nữa.
          caseRow = await this.casesRepo.createOpenCase(manager, {
            targetType: input.targetType,
            targetId: input.targetId,
            source: ModerationCaseSource.REPORT,
            severity: initialSeverity,
            priority: computePriority(initialSeverity, 0),
          });
          isNewCase = true;
        }
      }
      // caseRow chắc chắn non-null tại đây: INSERT lần 1 thắng, hoặc SELECT FOR UPDATE tìm thấy
      // case đang mở, hoặc INSERT lần 2 thắng.
      const case_ = caseRow!;

      // Bước 3 (WF-12 "chống report trùng"): kiểm tra TRONG transaction, SAU khi đã khoá case —
      // nhờ khoá đó, một lần gọi trùng từ CHÍNH reporter này (double-click) luôn BỊ CHẶN cho tới
      // khi lần gọi đầu đã commit report của nó, nên lần kiểm tra này không bao giờ đọc dữ liệu
      // stale. `uq_reports_one_per_reporter` vẫn là chốt chặn cấu trúc thật ở tầng DB; đây chỉ là
      // kiểm tra ứng dụng để trả 409 rõ ràng thay vì để lộ lỗi ràng buộc thô.
      const alreadyReported = await this.reportsRepo.existsByReporterAndTarget(
        input.targetType,
        input.targetId,
        input.reporterId,
        manager,
      );
      if (alreadyReported) {
        throw new ConflictException('Bạn đã báo cáo nội dung này rồi');
      }

      const report = await this.reportsRepo.create(manager, {
        caseId: case_.id,
        targetType: input.targetType,
        targetId: input.targetId,
        reporterId: input.reporterId,
        reason: input.reason,
        description: input.description,
      });

      // Bước 4: report_count + severity + priority — TÍNH SAU khi report vừa ghi, nên report_count
      // mới đã bao gồm report này (đúng thứ tự T3: INSERT report rồi mới recompute).
      const newReportCount = case_.reportCount + 1;
      const newSeverity = computeSeverity(case_.severity, case_.source, newReportCount);
      const newPriority = computePriority(newSeverity, newReportCount);
      await this.casesRepo.updateReportAggregation(manager, case_.id, {
        reportCount: newReportCount,
        severity: newSeverity,
        priority: newPriority,
      });

      return {
        reportId: report.id,
        caseId: case_.id,
        targetType: input.targetType,
        targetId: input.targetId,
        reporterId: input.reporterId,
        isNewCase,
        caseSource: case_.source,
      } satisfies ReportOutcome;
    });

    // Đến đây transaction đã COMMIT. INV-9: audit/event CHỈ sau commit, KHÔNG BAO GIỜ trong
    // transaction — lỗi ở đây KHÔNG hoàn tác report đã tạo thành công, chỉ log (cùng hành vi
    // ReviewsService/ModerationService.emitPostCommit).
    await this.emitPostCommit(outcome);
  }

  private async emitPostCommit(outcome: ReportOutcome): Promise<void> {
    try {
      await this.audit.record({
        event: 'report.created',
        entityType: outcome.targetType,
        entityId: outcome.targetId,
        actorId: outcome.reporterId,
        context: { caseId: outcome.caseId, reportId: outcome.reportId, isNewCase: outcome.isNewCase },
      });
    } catch (err) {
      this.logger.error(`Ghi audit report.created cho case ${outcome.caseId} thất bại: ${(err as Error).message}`);
    }

    try {
      await this.events.publish(
        new ReportCreatedEvent(outcome.reportId, outcome.targetType, outcome.targetId, outcome.caseId),
      );
      // CHỈ phát khi case THẬT SỰ mới được tạo (không phải report thứ 2/3/... gắn vào case cũ).
      if (outcome.isNewCase) {
        await this.events.publish(
          new CaseOpenedEvent(outcome.caseId, outcome.targetType, outcome.targetId, outcome.caseSource),
        );
      }
    } catch (err) {
      this.logger.error(`Phát event cho case ${outcome.caseId} thất bại: ${(err as Error).message}`);
    }
  }
}
