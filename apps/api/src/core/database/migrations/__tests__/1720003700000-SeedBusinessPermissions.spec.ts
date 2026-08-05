import { SeedBusinessPermissions1720003700000 } from '../1720003700000-SeedBusinessPermissions';
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

describe('SeedBusinessPermissions migration (ADR-015 Owner Decision 2)', () => {
  it('up: seed đúng MỘT permission Business.Verify, ON CONFLICT DO NOTHING', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedBusinessPermissions1720003700000().up(qr);

    const all = sqlOf(calls);
    expect(all).toContain(`('Business.Verify','Business','Verify',NULL)`);
    expect(all).toContain('ON CONFLICT ("code") DO NOTHING');
    // KHÔNG seed lại Business.Claim (đã tồn tại từ SeedRbac) và KHÔNG đụng Verification.Verify.
    expect(all).not.toContain('Business.Claim');
    expect(all).not.toContain('Verification.Verify');
  });

  it('up: grant Business.Verify CHO ĐÚNG role moderator, không role nào khác tường minh', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedBusinessPermissions1720003700000().up(qr);

    const grantCall = calls.find((c) => c.sql.includes('role_permissions'))!;
    const sql = grantCall.sql.replace(/\s+/g, ' ');
    expect(sql).toContain(`p.code = 'Business.Verify'`);
    expect(sql).toContain(`r.code = 'moderator'`);
    expect(sql).toContain('ON CONFLICT ("role_id","permission_id") DO NOTHING');
    // Đúng MỘT lệnh grant — administrator/super_administrator kế thừa qua DAG, không seed tường minh.
    const grantCalls = calls.filter((c) => c.sql.includes('INSERT INTO "role_permissions"'));
    expect(grantCalls).toHaveLength(1);
  });

  it('down: xoá đúng permission Business.Verify', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedBusinessPermissions1720003700000().down(qr);

    const sql = sqlOf(calls);
    expect(sql).toContain(`DELETE FROM "permissions" WHERE "code" = 'Business.Verify'`);
  });
});
