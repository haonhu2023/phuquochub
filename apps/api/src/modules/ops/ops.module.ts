import { OwnerDashboardController } from './owner-dashboard.controller';
import { OwnerDashboardService } from './owner-dashboard.service';
import { Module } from '@nestjs/common';
import { BackupStatusService } from './backup-status.service';
import { BackupStatusController } from './backup-status.controller';

// Backup reads filesystem metadata; dashboard uses the globally registered DataSource.
@Module({
  controllers: [BackupStatusController, OwnerDashboardController],
  providers: [BackupStatusService, OwnerDashboardService],
  exports: [BackupStatusService],
})
export class OpsModule {}
