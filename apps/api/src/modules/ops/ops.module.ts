import { OwnerDashboardController } from './owner-dashboard.controller';
import { OwnerDashboardService } from './owner-dashboard.service';
import { Module } from '@nestjs/common';
import { BackupStatusService } from './backup-status.service';
import { BackupStatusController } from './backup-status.controller';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';

// Backup reads filesystem metadata; dashboard/audit-log use the globally registered DataSource.
@Module({
  controllers: [BackupStatusController, OwnerDashboardController, AuditLogController],
  providers: [BackupStatusService, OwnerDashboardService, AuditLogService],
  exports: [BackupStatusService],
})
export class OpsModule {}
