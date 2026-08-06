import { SeedVerificationPermissions1720004100000 } from '../1720004100000-SeedVerificationPermissions';
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

describe('SeedVerificationPermissions migration (ADR-008, Owner Decision 2026-08-06 mục 3)', () => {
  it('up: seed đúng MỘT permission Verification.Vote, KHÔNG hậu tố scope', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedVerificationPermissions1720004100000().up(qr);

    const all = sqlOf(calls);
    expect(all).toContain(`('Verification.Vote','Verification','Vote',NULL)`);
    expect(all).toContain('ON CONFLICT ("code") DO NOTHING');
    expect(all).not.toContain("'Verification.Vote.Managed'");
  });

  it('up: KHÔNG seed lại Verification.Verify/Reject (đã seed từ SeedRbac, giữ nguyên moderator-only)', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedVerificationPermissions1720004100000().up(qr);

    const all = sqlOf(calls);
    expect(all).not.toContain('Verification.Verify');
    expect(all).not.toContain('Verification.Reject');
  });

  it('up: grant CHỈ cho role local_guide, không role nào khác tường minh (DAG tự lo phần còn lại)', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedVerificationPermissions1720004100000().up(qr);

    const grantCalls = calls.filter((c) => c.sql.includes('INSERT INTO "role_permissions"'));
    expect(grantCalls).toHaveLength(1);
    const sql = grantCalls[0].sql.replace(/\s+/g, ' ');
    expect(sql).toContain(`p.code = 'Verification.Vote'`);
    expect(sql).toContain(`r.code = 'local_guide'`);
    expect(sql).toContain('ON CONFLICT ("role_id","permission_id") DO NOTHING');
    expect(sql).not.toContain('moderator');
    expect(sql).not.toContain('business_owner');
    expect(sql).not.toContain('contributor');
  });

  it('down: xoá đúng permission mới', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedVerificationPermissions1720004100000().down(qr);

    const sql = sqlOf(calls);
    expect(sql).toContain(`DELETE FROM "permissions" WHERE "code" = 'Verification.Vote'`);
  });
});
