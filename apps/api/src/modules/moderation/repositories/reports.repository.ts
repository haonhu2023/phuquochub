import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Report } from '../entities/report.entity';
import { ModerationTargetType, ReportReason, ReportStatus } from '../moderation.enums';

export interface NewReport {
  caseId: string;
  targetType: ModerationTargetType;
  targetId: string;
  reporterId: string;
  reason: ReportReason;
  description: string | null;
}

// Repository `reports` (ADR-018/moderation-design.md, M1) — primitive lưu trữ nền tảng. Việc gộp
// report vào case đang mở, cập nhật report_count/severity/priority thuộc service layer (M5) —
// repository ở đây chỉ đọc/ghi đúng một dòng `reports`.
@Injectable()
export class ReportsRepository {
  constructor(
    @InjectRepository(Report)
    private readonly repo: Repository<Report>,
  ) {}

  /**
   * WF-12 "chống report trùng" — hậu thuẫn `uq_reports_one_per_reporter` ở tầng ứng dụng trước
   * khi ghi (chính unique index mới là chốt chặn thật). `manager` TUỲ CHỌN — T3 (M5) BẮT BUỘC
   * truyền vào để kiểm tra này chạy SAU khi đã khoá case của target (INV-3's
   * `findOpenCaseForTargetForUpdate()`), nên hai lần gọi trùng từ CHÍNH một reporter (double-click)
   * bị serialize qua khoá case đó thay vì đua nhau đọc "chưa có report" cùng lúc — bỏ trống dùng
   * `this.repo` như trước (không phá vỡ lời gọi cũ nào ngoài transaction), cùng quy ước
   * `PlacesRepository.recalculateRating()`.
   */
  existsByReporterAndTarget(
    targetType: ModerationTargetType,
    targetId: string,
    reporterId: string,
    manager?: EntityManager,
  ): Promise<boolean> {
    const repo = manager ? manager.getRepository(Report) : this.repo;
    return repo.exists({ where: { targetType, targetId, reporterId } });
  }

  /** GET /moderation/cases/{id} (M2) — mọi report gắn với một case, cũ nhất trước (khớp thứ tự
   * "ai báo cáo trước" mà một moderator cần đọc khi xem lại lịch sử case). */
  findByCaseId(caseId: string): Promise<Report[]> {
    return this.repo.find({ where: { caseId }, order: { createdAt: 'ASC' } });
  }

  /**
   * T2 (Moderation Foundation M3) — khi một case đóng, mọi report gắn với nó được đặt kết luận
   * (upheld: nội dung bị gỡ đúng theo report; dismissed: report vô căn cứ hoặc case bị dismiss).
   * Đây là hệ quả CƠ HỌC của việc resolve case đúng, KHÔNG PHẢI tính năng "report resolution" của
   * M5 (không có endpoint report-riêng, không hành vi hướng người báo cáo, không dismiss/reopen
   * report độc lập nào được thêm ở đây). Trong M3, mọi case đều tạo từ backfill (source=
   * new_content, 0 report) nên hàm này là no-op cho mọi kịch bản thật hiện có — vẫn triển khai
   * đúng vì T2 tự nó yêu cầu (bước 9), để không lỗi khi M5 bắt đầu tạo report thật.
   */
  async resolveByCaseId(manager: EntityManager, caseId: string, status: ReportStatus): Promise<void> {
    await manager.getRepository(Report).update({ caseId }, { status });
  }

  /** Tạo một report gắn với case đã tồn tại. Nhận `manager` trực tiếp để caller kiểm soát
   * transaction (T3, M5) — cùng quy ước `MediaRepository.createUploaded()`. */
  create(manager: EntityManager, data: NewReport): Promise<Report> {
    const repo = manager.getRepository(Report);
    const report = repo.create({
      caseId: data.caseId,
      targetType: data.targetType,
      targetId: data.targetId,
      reporterId: data.reporterId,
      reason: data.reason,
      description: data.description,
    });
    return repo.save(report);
  }
}
