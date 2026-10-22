import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditResult } from '../../core/audit/audit.enums';

export interface AuditLogFilter {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  /** So khớp MỘT PHẦN (ILIKE), không phải tuyệt đối — xem dto's ghi chú. */
  event?: string;
  result?: AuditResult;
  /** ISO 8601 — biên dưới/trên của `created_at`, cả hai bao gồm (inclusive). */
  from?: string;
  to?: string;
}

export interface AuditLogRow {
  id: string;
  created_at: string;
  event: string;
  actor_id: string | null;
  actor_role: string | null;
  entity_type: string;
  entity_id: string | null;
  result: AuditResult;
  correlation_id: string | null;
  before_status: string | null;
  after_status: string | null;
}

// Cùng projection NGHIÊM NGẶT đã chốt ở owner-dashboard.service.ts's OWNER_AUDIT_SQL — nguyên văn
// comment gốc: "Strict projection: no IP, user agent, arbitrary before/after/context or
// credentials. Only scalar status/version transitions are exposed". Trang tra cứu riêng này (gap
// phát hiện 22/10/2026: dashboard chỉ xem được 20 dòng gần nhất, không lọc/tìm/phân trang) CHỈ
// thêm lọc + phân trang trên CÙNG tập cột đã duyệt trước đó — KHÔNG mở rộng phạm vi lộ dữ liệu.
// `correlation_id` thêm mới (an toàn — chỉ là UUID theo dõi request, không phải PII) để tra chéo
// với Sentry (xem AllExceptionsFilter's Sentry.captureException(..., { tags: { correlationId } })).
const SELECT_COLUMNS = `id, created_at, event, actor_id, actor_role, entity_type, entity_id, result,
  correlation_id,
  CASE WHEN jsonb_typeof("before"->'status') = 'string' THEN "before"->>'status' END AS before_status,
  CASE WHEN jsonb_typeof("after"->'status') = 'string' THEN "after"->>'status' END AS after_status`;

@Injectable()
export class AuditLogService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async list(filter: AuditLogFilter, page: number, limit: number): Promise<{ items: AuditLogRow[]; total: number }> {
    const { where, params } = this.buildWhere(filter);
    const offset = (page - 1) * limit;

    const [items, countRows] = await Promise.all([
      this.ds.query(
        `SELECT ${SELECT_COLUMNS} FROM audit_logs ${where}
         ORDER BY created_at DESC, id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
      this.ds.query(`SELECT count(*)::int AS total FROM audit_logs ${where}`, params),
    ]);

    return { items, total: countRows[0]?.total ?? 0 };
  }

  // Xây WHERE động, tham số hóa — KHÔNG nối chuỗi giá trị người dùng vào SQL. Thứ tự index đã có
  // sẵn từ migration gốc (InitAuditLogs1720001500000): (entity_type,entity_id,created_at),
  // (actor_id,created_at), (event,created_at) — lọc theo các cột này tận dụng được index có sẵn,
  // không cần migration/index mới.
  private buildWhere(filter: AuditLogFilter): { where: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.entityType) {
      params.push(filter.entityType);
      conditions.push(`entity_type = $${params.length}`);
    }
    if (filter.entityId) {
      params.push(filter.entityId);
      conditions.push(`entity_id = $${params.length}`);
    }
    if (filter.actorId) {
      params.push(filter.actorId);
      conditions.push(`actor_id = $${params.length}`);
    }
    if (filter.event) {
      params.push(`%${filter.event}%`);
      conditions.push(`event ILIKE $${params.length}`);
    }
    if (filter.result) {
      params.push(filter.result);
      conditions.push(`result = $${params.length}::audit_result`);
    }
    if (filter.from) {
      params.push(filter.from);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (filter.to) {
      params.push(filter.to);
      conditions.push(`created_at <= $${params.length}`);
    }

    return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
  }
}
