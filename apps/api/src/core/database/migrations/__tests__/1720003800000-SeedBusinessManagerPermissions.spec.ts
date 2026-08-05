import { SeedBusinessManagerPermissions1720003800000 } from '../1720003800000-SeedBusinessManagerPermissions';
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

describe('SeedBusinessManagerPermissions migration (Business Manager Assignment/Revocation, Owner Decision 1)', () => {
  it('up: seed đúng HAI permission CÓ hậu tố .Managed (khác Business.Claim/Business.Verify)', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedBusinessManagerPermissions1720003800000().up(qr);

    const all = sqlOf(calls);
    expect(all).toContain(`('Business.Manager.Assign.Managed','Business','Manager.Assign','Managed')`);
    expect(all).toContain(`('Business.Manager.Revoke.Managed','Business','Manager.Revoke','Managed')`);
    expect(all).toContain('ON CONFLICT ("code") DO NOTHING');
    expect(all).not.toContain('Business.Manager.Assign.Managed.Managed');
    // KHÔNG seed lại/đụng Business.Claim, Business.Verify, hay bất kỳ permission scope-less nào.
    expect(all).not.toContain('Business.Claim');
    expect(all).not.toContain('Business.Verify');
  });

  it('up: grant CHỈ cho role business_owner, không role nào khác tường minh', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedBusinessManagerPermissions1720003800000().up(qr);

    const grantCalls = calls.filter((c) => c.sql.includes('INSERT INTO "role_permissions"'));
    expect(grantCalls).toHaveLength(1);
    const sql = grantCalls[0].sql.replace(/\s+/g, ' ');
    expect(sql).toContain(`r.code = 'business_owner'`);
    expect(sql).toContain(`p.code IN ('Business.Manager.Assign.Managed','Business.Manager.Revoke.Managed')`);
    expect(sql).toContain('ON CONFLICT ("role_id","permission_id") DO NOTHING');
    expect(sql).not.toContain('business_manager');
    expect(sql).not.toContain('moderator');
  });

  it('down: xoá đúng hai permission mới', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedBusinessManagerPermissions1720003800000().down(qr);

    const sql = sqlOf(calls);
    expect(sql).toContain(
      `DELETE FROM "permissions" WHERE "code" IN ('Business.Manager.Assign.Managed','Business.Manager.Revoke.Managed')`,
    );
  });
});
