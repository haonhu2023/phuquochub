import type { PaginationMeta } from '@phuquochub/shared-types';
import { apiGetAuth, apiGetPaginatedAuth } from '@/lib/http';
import type { AuditLogFilter, AuditLogRow, BackupStatusSummary } from '../types';

export function getBackupStatus(accessToken: string): Promise<BackupStatusSummary> {
  return apiGetAuth<BackupStatusSummary>('/admin/ops/backup-status', accessToken);
}

function auditLogQuery(filter: AuditLogFilter): string {
  const qs = new URLSearchParams();
  if (filter.entity_type) qs.set('entity_type', filter.entity_type);
  if (filter.entity_id) qs.set('entity_id', filter.entity_id);
  if (filter.actor_id) qs.set('actor_id', filter.actor_id);
  if (filter.event) qs.set('event', filter.event);
  if (filter.result) qs.set('result', filter.result);
  if (filter.from) qs.set('from', filter.from);
  if (filter.to) qs.set('to', filter.to);
  if (filter.page) qs.set('page', String(filter.page));
  if (filter.limit) qs.set('limit', String(filter.limit));
  const s = qs.toString();
  return s ? `?${s}` : '';
}

// 2026-10-22 (gap vá: trước đây audit log chỉ xem được 20 dòng gần nhất, không lọc/tìm/phân trang).
export function listAuditLog(
  filter: AuditLogFilter,
  accessToken: string,
): Promise<{ data: AuditLogRow[]; meta: PaginationMeta }> {
  return apiGetPaginatedAuth<AuditLogRow>(`/admin/ops/audit-log${auditLogQuery(filter)}`, accessToken, {
    cache: 'no-store',
  });
}
