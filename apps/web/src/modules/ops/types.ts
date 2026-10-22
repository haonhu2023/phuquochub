// BK1 (2026-09-22) — mirrors apps/api/src/modules/ops/backup-status.service.ts's exported shapes
// exactly (kept as a hand-written mirror, not a shared package, matching every other cross-app DTO
// shape in this codebase — see e.g. modules/site-content/types.ts).
export interface BackupSnapshotSummary {
  name: string;
  timestampUtc: string;
  ageHours: number;
  sizeBytes: number;
  hasChecksumSidecar: boolean;
}

export interface BackupTreeStatus {
  configured: boolean;
  count: number;
  latest: BackupSnapshotSummary | null;
  oldest: BackupSnapshotSummary | null;
}

export interface OffsiteSyncStatus {
  configured: boolean;
  data: { timestampUtc: string; success: boolean; exitCode: number; ageHours: number } | null;
}

export interface BackupStatusSummary {
  database: BackupTreeStatus;
  media: BackupTreeStatus;
  offsite: OffsiteSyncStatus;
  checkedAtUtc: string;
}

// Trang tra cứu riêng (2026-10-22) — mirrors apps/api/src/modules/ops/audit-log.service.ts's
// AuditLogRow exactly (cùng quy ước hand-written mirror ở trên). KHÔNG có ip/user_agent/before/
// after/context thô — cùng ranh giới đã chốt từ owner-dashboard's OWNER_AUDIT_SQL.
export interface AuditLogRow {
  id: string;
  created_at: string;
  event: string;
  actor_id: string | null;
  actor_role: string | null;
  entity_type: string;
  entity_id: string | null;
  result: 'success' | 'failure' | 'allow' | 'deny';
  correlation_id: string | null;
  before_status: string | null;
  after_status: string | null;
}

export interface AuditLogFilter {
  entity_type?: string;
  entity_id?: string;
  actor_id?: string;
  event?: string;
  result?: AuditLogRow['result'];
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}
