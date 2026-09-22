import { Controller, Get } from '@nestjs/common';
import { RequirePermissions } from '../authz/decorators/require-permissions.decorator';
import { BackupStatusService } from './backup-status.service';

// BK1 (2026-09-22) — read-only, gated by Ops.BackupStatus.View (content_owner only, see
// SeedBackupStatusPermission1720006500000). No @Public() here: unlike site-content's public GET,
// backup file names/timestamps/sizes are operational metadata, not something a guest should see.
@Controller('admin/ops')
export class BackupStatusController {
  constructor(private readonly service: BackupStatusService) {}

  @Get('backup-status')
  @RequirePermissions('Ops.BackupStatus.View')
  getBackupStatus() {
    return this.service.getStatus();
  }
}
