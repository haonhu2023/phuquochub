import { Injectable } from '@nestjs/common';
import { AuditRepository } from './audit.repository';
import { AuditResult } from './audit.enums';

const REDACTED = '[REDACTED]';
// Redact PII/secret trước khi ghi before/after/context (ADR-016 Consequences: rủi ro lộ PII).
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'accessToken',
  'refreshToken',
  'access_token',
  'refresh_token',
  'token',
  'secret',
  'authorization',
]);

export interface AuditEvent {
  /** mã `module.action` (khớp dòng "Audit Log:" của workflow) — vd `role.assigned`, `place.status_changed`. */
  event: string;
  /** loại tài nguyên (đa hình, lowercase) — vd `user`, `place`. */
  entityType: string;
  entityId?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
  isServiceAccount?: boolean;
  permission?: string | null;
  scope?: string | null;
  result?: AuditResult;
  ip?: string | null;
  userAgent?: string | null;
  before?: unknown;
  after?: unknown;
  context?: Record<string, unknown> | null;
  correlationId?: string | null;
}

// AuditService (ADR-016): ghi bản ghi kiểm toán BẤT BIẾN cho hành động đặc quyền/đổi trạng thái.
// Ghi tập trung một chỗ (không rải rác) — các service gọi `record()` sau khi thao tác thành công.
@Injectable()
export class AuditService {
  constructor(private readonly repo: AuditRepository) {}

  async record(e: AuditEvent): Promise<void> {
    await this.repo.insert({
      event: e.event,
      actorId: e.actorId ?? null,
      actorRole: e.actorRole ?? null,
      isServiceAccount: e.isServiceAccount ?? false,
      permission: e.permission ?? null,
      scope: e.scope ?? null,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      result: e.result ?? AuditResult.SUCCESS,
      ip: e.ip ?? null,
      userAgent: e.userAgent ?? null,
      before: this.redact(e.before),
      after: this.redact(e.after),
      context: this.redact(e.context),
      correlationId: e.correlationId ?? null,
    });
  }

  /** Che khóa nhạy cảm (đệ quy) trong snapshot trước khi ghi. */
  redact(value: unknown): unknown {
    if (!value || typeof value !== 'object') {
      return value ?? null;
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.redact(v));
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k) ? REDACTED : v && typeof v === 'object' ? this.redact(v) : v;
    }
    return out;
  }
}
