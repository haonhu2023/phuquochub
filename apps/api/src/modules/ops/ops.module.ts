import { Module } from '@nestjs/common';
import { BackupStatusService } from './backup-status.service';
import { BackupStatusController } from './backup-status.controller';

// BK1 (2026-09-22). No TypeOrmModule.forFeature() — BackupStatusService reads only the
// filesystem (via ConfigService's backupStatus.dbDir/mediaDir), never the database.
@Module({
  controllers: [BackupStatusController],
  providers: [BackupStatusService],
  exports: [BackupStatusService],
})
export class OpsModule {}
