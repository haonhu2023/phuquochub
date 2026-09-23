import { SeedBackupStatusPermission1720006500000 } from '../1720006500000-SeedBackupStatusPermission';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('SeedBackupStatusPermission migration (BK1, 2026-09-22)', () => {
  it('up: inserts Ops.BackupStatus.View and grants it to content_owner, both idempotently', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedBackupStatusPermission1720006500000().up(qr);

    expect(calls).toHaveLength(2);
    expect(calls[0].sql).toContain(`'Ops.BackupStatus.View','Ops','View','Any'`);
    expect(calls[0].sql).toContain('ON CONFLICT ("code") DO NOTHING');
    expect(calls[1].sql).toContain(`p.code = 'Ops.BackupStatus.View'`);
    expect(calls[1].sql).toContain(`r.code = 'content_owner'`);
    expect(calls[1].sql).toContain('ON CONFLICT ("role_id","permission_id") DO NOTHING');
  });

  it('down: deletes only the Ops.BackupStatus.View permission row', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedBackupStatusPermission1720006500000().down(qr);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain(`DELETE FROM "permissions" WHERE "code" = 'Ops.BackupStatus.View'`);
  });
});
