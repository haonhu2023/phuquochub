import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Report } from '../entities/report.entity';
import { ModerationTargetType, ReportReason } from '../moderation.enums';

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

  /** WF-12 "chống report trùng" — hậu thuẫn `uq_reports_one_per_reporter` ở tầng ứng dụng trước
   * khi ghi (chính unique index mới là chốt chặn thật). */
  existsByReporterAndTarget(
    targetType: ModerationTargetType,
    targetId: string,
    reporterId: string,
  ): Promise<boolean> {
    return this.repo.exists({ where: { targetType, targetId, reporterId } });
  }

  /** GET /moderation/cases/{id} (M2) — mọi report gắn với một case, cũ nhất trước (khớp thứ tự
   * "ai báo cáo trước" mà một moderator cần đọc khi xem lại lịch sử case). */
  findByCaseId(caseId: string): Promise<Report[]> {
    return this.repo.find({ where: { caseId }, order: { createdAt: 'ASC' } });
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
