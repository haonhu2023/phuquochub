import { SeedBusinessTransferPermission1720003900000 } from '../1720003900000-SeedBusinessTransferPermission';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

function sqlOf(calls: Array<{ sql: string }>): string {
  return calls.map((c) => c.sql).join('\n').replace(/\s+/g, ' ');
}

describe('SeedBusinessTransferPermission migration (ADR-015 UC-B7, Owner Decision 2)', () => {
  it('up: seed đúng MỘT permission CÓ hậu tố .Managed (khác chuỗi không hậu tố rbac.md ghi)', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedBusinessTransferPermission1720003900000().up(qr);

    const all = sqlOf(calls);
    expect(all).toContain(`('Business.Transfer.Managed','Business','Transfer','Managed')`);
    expect(all).toContain('ON CONFLICT ("code") DO NOTHING');
    expect(all).not.toContain("'Business.Transfer','Business','Transfer',NULL");
  });

  it('up: grant CHỈ cho role business_owner, không role nào khác tường minh', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedBusinessTransferPermission1720003900000().up(qr);

    const grantCalls = calls.filter((c) => c.sql.includes('INSERT INTO "role_permissions"'));
    expect(grantCalls).toHaveLength(1);
    const sql = grantCalls[0].sql.replace(/\s+/g, ' ');
    expect(sql).toContain(`p.code = 'Business.Transfer.Managed'`);
    expect(sql).toContain(`r.code = 'business_owner'`);
    expect(sql).toContain('ON CONFLICT ("role_id","permission_id") DO NOTHING');
    expect(sql).not.toContain('business_manager');
    expect(sql).not.toContain('moderator');
  });

  it('down: xoá đúng permission mới', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedBusinessTransferPermission1720003900000().down(qr);

    const sql = sqlOf(calls);
    expect(sql).toContain(`DELETE FROM "permissions" WHERE "code" = 'Business.Transfer.Managed'`);
  });
});
