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

export interface BackupStatusSummary {
  database: BackupTreeStatus;
  media: BackupTreeStatus;
  checkedAtUtc: string;
}
