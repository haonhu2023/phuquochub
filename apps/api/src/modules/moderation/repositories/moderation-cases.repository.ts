import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { ModerationCase } from '../entities/moderation-case.entity';
import {
  ModerationCaseSeverity,
  ModerationCaseSource,
  ModerationCaseStatus,
  ModerationDecision,
  ModerationTargetType,
} from '../moderation.enums';
import type { ModerationTargetPreview } from '../moderation-target-preview';
import { MediaStatus, MediaType } from '../../media/media.enums';
import { ReviewStatus } from '../../reviews/review.enums';

export interface NewModerationCase {
  targetType: ModerationTargetType;
  targetId: string;
  source: ModerationCaseSource;
  severity: ModerationCaseSeverity;
  priority: number;
}

// T2 (Moderation Foundation M3) — kết luận ghi vào case khi resolve. `status` chỉ 2 giá trị hợp
// lệ ở bước này: RESOLVED (quyết định approve/reject/hide/restore) hoặc DISMISSED (report vô căn
// cứ, decision='dismiss', KHÔNG đổi trạng thái nội dung — moderation-design.md §5.1).
export interface ResolveModerationCase {
  status: ModerationCaseStatus.RESOLVED | ModerationCaseStatus.DISMISSED;
  decision: ModerationDecision;
  reason: string | null;
  resolvedBy: string;
  resolvedAt: Date;
}

// T2 (Moderation Foundation M4) — review target trong CÙNG transaction quyết định.
export interface ReviewForDecision {
  id: string;
  placeId: string;
  userId: string;
  status: ReviewStatus;
}

// M2 (GET /moderation/cases) — status LÀ MẢNG: bỏ trống filter -> service truyền [open,claimed]
// (mặc định "hàng chờ", thiết kế §4); truyền tường minh -> service truyền đúng 1 phần tử. Repository
// không tự quyết định mặc định đó (thuộc service, cùng nguyên tắc repository không suy luận nghiệp vụ).
export interface ListModerationCasesParams {
  statuses: ModerationCaseStatus[];
  targetType?: ModerationTargetType;
  source?: ModerationCaseSource;
  severity?: ModerationCaseSeverity;
  assignedTo?: string;
  limit: number;
  offset: number;
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
   * T2 (Moderation Foundation M3) — khoá đúng MỘT dòng case (`SELECT ... FOR UPDATE`) trước khi
   * quyết định. Đây là chốt chặn concurrency DUY NHẤT của T2 (moderation-design.md §7): khoá case
   * cha là đủ để chặn hai quyết định chạy song song trên CÙNG target, vì INV-3 đảm bảo tối đa một
   * case mở cho mỗi target — không cần khoá riêng trên `media`/`reviews`. Cùng cơ chế
   * `InventoryHoldsRepository.placeHold()` khoá `availability_slots` bằng `setLock('pessimistic_write')`.
   */
  findByIdForUpdate(manager: EntityManager, id: string): Promise<ModerationCase | null> {
    return manager
      .getRepository(ModerationCase)
      .createQueryBuilder('c')
      .setLock('pessimistic_write')
      .where('c.id = :id', { id })
      .getOne();
  }

  /**
   * T3 (Moderation Foundation M5) — khoá đúng MỘT case đang mở (open/claimed) của một target,
   * TRONG cùng transaction tạo report. Chốt chặn concurrency: khi `createOpenCase()` gặp
   * `ON CONFLICT DO NOTHING` (case đã tồn tại), lệnh INSERT đó không khoá được gì — hàm này khoá
   * dòng đã tồn tại đó (`SELECT ... FOR UPDATE`) trước khi service đọc `report_count`/`severity`
   * hiện tại để tính giá trị mới, đúng cùng nguyên tắc `findByIdForUpdate()` (T2). Không có hàm
   * này, hai report đồng thời trên CÙNG target sẽ đọc-rồi-ghi report_count/severity KHÔNG khoá —
   * lost update kinh điển (báo cáo thứ hai ghi đè giá trị của báo cáo thứ nhất thay vì cộng dồn).
   */
  findOpenCaseForTargetForUpdate(
    manager: EntityManager,
    targetType: ModerationTargetType,
    targetId: string,
  ): Promise<ModerationCase | null> {
    return manager
      .getRepository(ModerationCase)
      .createQueryBuilder('c')
      .setLock('pessimistic_write')
      .where('c.targetType = :targetType', { targetType })
      .andWhere('c.targetId = :targetId', { targetId })
      .andWhere('c.status IN (:...statuses)', { statuses: [ModerationCaseStatus.OPEN, ModerationCaseStatus.CLAIMED] })
      .getOne();
  }

  /**
   * T3 (M5) — bước 4: `report_count`/`severity`/`priority` ĐÃ ĐƯỢC TÍNH bởi service
   * (`computeSeverity()`/`computePriority()`, moderation-severity.ts — module thuần, không tự suy
   * luận ở đây, cùng nguyên tắc `resolve()`). UPDATE không `RETURNING` — an toàn dù driver luôn
   * trả tuple cho UPDATE (không dùng kết quả).
   */
  async updateReportAggregation(
    manager: EntityManager,
    id: string,
    data: { reportCount: number; severity: ModerationCaseSeverity; priority: number },
  ): Promise<void> {
    await manager
      .getRepository(ModerationCase)
      .update({ id }, { reportCount: data.reportCount, severity: data.severity, priority: data.priority });
  }

  /**
   * T2 (Moderation Foundation M4) — khoá + đọc review target trong CÙNG transaction quyết định.
   * Raw SQL trực tiếp trên `reviews` (KHÔNG tiêm `ReviewsRepository`): `ReviewsModule` đã import
   * `ModerationModule` (cho `MODERATION_EVENT_PUBLISHER`, ADR-018 D12) — tiêm ngược lại sẽ tạo
   * circular module dependency. Cùng tiền lệ `findTargetPreview()` đọc thẳng bảng `reviews`/`media`
   * từ repository này để tránh đúng vấn đề đó.
   *
   * `SELECT ... FOR UPDATE` — lệnh SELECT, driver Postgres của TypeORM trả `rows` trực tiếp (KHÔNG
   * phải tuple `[rows, rowCount]` — tuple chỉ xảy ra với UPDATE/DELETE, xem
   * `MediaRepository.attachAndPublish()`/`softDeleteOrphanCandidate()`), nên không cần destructure.
   */
  async findReviewForUpdate(manager: EntityManager, id: string): Promise<ReviewForDecision | null> {
    const rows: Array<{ id: string; place_id: string; user_id: string; status: ReviewStatus }> =
      await manager.query(`SELECT id, place_id, user_id, status FROM reviews WHERE id = $1 FOR UPDATE`, [id]);
    const r = rows[0];
    return r ? { id: r.id, placeId: r.place_id, userId: r.user_id, status: r.status } : null;
  }

  /**
   * T2 (M4) — ghi status ĐÃ ĐƯỢC XÁC NHẬN hợp lệ bởi FSM (`assertValidReviewTransition`).
   * Repository KHÔNG tự kiểm tra transition, cùng nguyên tắc `MediaRepository.updateStatus()`.
   * UPDATE không có `RETURNING` — không rơi vào bug hình dạng tuple (đã sửa ở
   * `attachAndPublish()`/`softDeleteOrphanCandidate()`), và kết quả không được dùng nên vô hại dù
   * driver có luôn trả tuple cho lệnh UPDATE (xem PostgresQueryRunner.query()).
   */
  async updateReviewStatus(manager: EntityManager, id: string, status: ReviewStatus): Promise<void> {
    await manager.query(`UPDATE reviews SET status = $1 WHERE id = $2`, [status, id]);
  }

  /** T2 — ghi kết luận ĐÃ ĐƯỢC XÁC NHẬN hợp lệ bởi service (case ∈ {open,claimed}, FSM hợp lệ,
   * không tự kiểm duyệt — INV-12). Repository KHÔNG tự kiểm tra các điều kiện đó, cùng nguyên tắc
   * `BookingsRepository.updateStatus()`. */
  async resolve(manager: EntityManager, id: string, data: ResolveModerationCase): Promise<void> {
    await manager.getRepository(ModerationCase).update(
      { id },
      {
        status: data.status,
        decision: data.decision,
        reason: data.reason,
        resolvedBy: data.resolvedBy,
        resolvedAt: data.resolvedAt,
      },
    );
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

  /**
   * GET /moderation/cases (M2). QueryBuilder — cùng khuôn `BookingsRepository.list()`: MỘT qb
   * dùng chung cho `getCount()` rồi `getMany()` (giữ filter list/count đồng nhất tuyệt đối, không
   * thể lệch nhau qua thời gian vì cùng một chuỗi `andWhere`). Sắp xếp CỐ ĐỊNH theo thiết kế §4
   * (priority DESC, report_count DESC, created_at ASC) + tie-break `id ASC` cho xác định hoàn
   * toàn — không có tham số sort tuỳ chỉnh (không đặc tả trong ADR-018/moderation-design.md §9).
   */
  async list(params: ListModerationCasesParams): Promise<{ items: ModerationCase[]; total: number }> {
    const qb = this.repo.createQueryBuilder('c').where('c.status IN (:...statuses)', { statuses: params.statuses });

    if (params.targetType) {
      qb.andWhere('c.targetType = :targetType', { targetType: params.targetType });
    }
    if (params.source) {
      qb.andWhere('c.source = :source', { source: params.source });
    }
    if (params.severity) {
      qb.andWhere('c.severity = :severity', { severity: params.severity });
    }
    if (params.assignedTo) {
      qb.andWhere('c.assignedTo = :assignedTo', { assignedTo: params.assignedTo });
    }

    const total = await qb.getCount();
    const items = await qb
      .orderBy('c.priority', 'DESC')
      .addOrderBy('c.reportCount', 'DESC')
      .addOrderBy('c.createdAt', 'ASC')
      .addOrderBy('c.id', 'ASC') // tie-break ổn định — cùng nguyên tắc GAP-12 (PlacesRepository.list)
      .skip(params.offset)
      .take(params.limit)
      .getMany();

    return { items, total };
  }

  /**
   * Ảnh chụp target cho GET /moderation/cases/{id} (M2). Raw SQL tối thiểu, KHÔNG kéo cột nội bộ
   * storage (object_key/bucket/checksum/content_type/size_bytes) — chỉ những trường một moderator
   * thực sự cần để ra quyết định. `place` luôn `found:false` (chưa đăng ký FSM, MR-4). Target đã
   * bị xoá mềm hoặc không tồn tại -> `found:false`, KHÔNG throw (case vẫn hợp lệ dù target đã mất
   * — đúng lý do target_id không có FK cứng, ADR-018 D9).
   *
   * Dùng `this.repo.query()` (cross-table raw SQL từ repository ModerationCase) — cùng tiền lệ
   * `MediaRepository.placeExists()` truy vấn thẳng bảng `places` để tránh circular module
   * dependency (ModerationModule không import MediaModule/ReviewsModule chỉ để đọc preview).
   */
  async findTargetPreview(
    targetType: ModerationTargetType,
    targetId: string,
  ): Promise<ModerationTargetPreview> {
    if (targetType === ModerationTargetType.MEDIA) {
      const rows: Array<{
        type: string;
        status: string;
        uploaded_by: string | null;
        created_at: Date;
      }> = await this.repo.query(
        `SELECT type, status, uploaded_by, created_at FROM media WHERE id = $1 AND deleted_at IS NULL`,
        [targetId],
      );
      if (rows.length === 0) return { found: false, targetType, targetId };
      const r = rows[0];
      return {
        found: true,
        targetType: ModerationTargetType.MEDIA,
        targetId,
        mediaType: r.type as MediaType,
        status: r.status as MediaStatus,
        uploadedBy: r.uploaded_by,
        createdAt: r.created_at,
      };
    }

    if (targetType === ModerationTargetType.REVIEW) {
      const rows: Array<{
        status: string;
        rating: number;
        content: string | null;
        place_id: string;
        user_id: string;
        created_at: Date;
      }> = await this.repo.query(
        `SELECT status, rating, content, place_id, user_id, created_at FROM reviews WHERE id = $1`,
        [targetId],
      );
      if (rows.length === 0) return { found: false, targetType, targetId };
      const r = rows[0];
      return {
        found: true,
        targetType: ModerationTargetType.REVIEW,
        targetId,
        status: r.status as ReviewStatus,
        rating: r.rating,
        content: r.content,
        placeId: r.place_id,
        userId: r.user_id,
        createdAt: r.created_at,
      };
    }

    // target_type = 'place' — chưa đăng ký FSM, ngoài phạm vi M1–M7 (ADR-018 §Ngoài phạm vi).
    return { found: false, targetType, targetId };
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
