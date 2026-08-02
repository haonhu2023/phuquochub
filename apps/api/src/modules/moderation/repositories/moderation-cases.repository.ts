import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { ModerationCase } from '../entities/moderation-case.entity';
import {
  ModerationCaseSeverity,
  ModerationCaseSource,
  ModerationCaseStatus,
  ModerationTargetType,
} from '../moderation.enums';

export interface NewModerationCase {
  targetType: ModerationTargetType;
  targetId: string;
  source: ModerationCaseSource;
  severity: ModerationCaseSeverity;
  priority: number;
}

interface ModerationCaseRow {
  id: string;
  target_type: ModerationTargetType;
  target_id: string;
  status: ModerationCaseStatus;
  source: ModerationCaseSource;
  severity: ModerationCaseSeverity;
  priority: number;
  report_count: number;
  assigned_to: string | null;
  claimed_at: Date | null;
  decision: string | null;
  reason: string | null;
  resolved_by: string | null;
  resolved_at: Date | null;
  ai_score: string | null;
  ai_labels: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

// Repository `moderation_cases` (ADR-018/moderation-design.md, M1) — CHỈ các primitive lưu trữ
// nền tảng: đọc case theo target/id, và tạo case mới an toàn với INV-3 (tối đa một case
// open/claimed cho mỗi target). KHÔNG có logic tính severity/priority hay orchestration quyết
// định (thuộc service layer, M3–M5) — repository không tự suy luận nghiệp vụ, cùng nguyên tắc
// BookingsRepository.updateStatus() "repository không tự kiểm tra FSM".
@Injectable()
export class ModerationCasesRepository {
  constructor(
    @InjectRepository(ModerationCase)
    private readonly repo: Repository<ModerationCase>,
  ) {}

  findById(id: string): Promise<ModerationCase | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** Case đang mở (open/claimed) cho một target, nếu có — hậu thuẫn INV-3 ở tầng ứng dụng trước
   * khi ghi (chính partial unique index mới là chốt chặn thật, đây chỉ để đọc/hiển thị). */
  findOpenCaseForTarget(targetType: ModerationTargetType, targetId: string): Promise<ModerationCase | null> {
    return this.repo.findOne({
      where: { targetType, targetId, status: In([ModerationCaseStatus.OPEN, ModerationCaseStatus.CLAIMED]) },
    });
  }

  /**
   * Tạo một case `open` mới, AN TOÀN theo INV-3: `ON CONFLICT` khớp chính xác
   * `uq_moderation_cases_open_target` (target_type, target_id) WHERE status IN
   * ('open','claimed') — nếu target đã có case mở, INSERT không chèn gì và hàm trả về `null`
   * (caller tự `findOpenCaseForTarget` nếu cần case đã tồn tại đó, KHÔNG coi `null` là lỗi).
   * Idempotent theo cấu trúc — nền tảng cho backfill (T4/M3) và tạo case khi có report (T3/M5).
   *
   * Nhận `manager` trực tiếp (không dùng `this.repo`) để caller kiểm soát transaction, cùng quy
   * ước `MediaRepository.createUploaded()`.
   */
  async createOpenCase(manager: EntityManager, data: NewModerationCase): Promise<ModerationCase | null> {
    const rows: ModerationCaseRow[] = await manager.query(
      `INSERT INTO moderation_cases (target_type, target_id, status, source, severity, priority)
       VALUES ($1, $2, 'open', $3, $4, $5)
       ON CONFLICT (target_type, target_id) WHERE status IN ('open','claimed') DO NOTHING
       RETURNING id, target_type, target_id, status, source, severity, priority, report_count,
                 assigned_to, claimed_at, decision, reason, resolved_by, resolved_at, ai_score,
                 ai_labels, created_at, updated_at`,
      [data.targetType, data.targetId, data.source, data.severity, data.priority],
    );
    return rows.length > 0 ? this.mapRow(rows[0]) : null;
  }

  private mapRow(row: ModerationCaseRow): ModerationCase {
    const c = new ModerationCase();
    c.id = row.id;
    c.targetType = row.target_type;
    c.targetId = row.target_id;
    c.status = row.status;
    c.source = row.source;
    c.severity = row.severity;
    c.priority = row.priority;
    c.reportCount = row.report_count;
    c.assignedTo = row.assigned_to;
    c.claimedAt = row.claimed_at;
    c.decision = row.decision as ModerationCase['decision'];
    c.reason = row.reason;
    c.resolvedBy = row.resolved_by;
    c.resolvedAt = row.resolved_at;
    c.aiScore = row.ai_score;
    c.aiLabels = row.ai_labels;
    c.createdAt = row.created_at;
    c.updatedAt = row.updated_at;
    return c;
  }
}
