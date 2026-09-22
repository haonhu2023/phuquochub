import { apiGetAuth } from '@/lib/http';
import type { BackupStatusSummary } from '../types';

export function getBackupStatus(accessToken: string): Promise<BackupStatusSummary> {
  return apiGetAuth<BackupStatusSummary>('/admin/ops/backup-status', accessToken);
}
