import { SeedModerationPermissions1720003300000 } from '../1720003300000-SeedModerationPermissions';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('SeedModerationPermissions migration', () => {
  it('up: thêm đúng 6 quyền (ADR-018 §D10), scope Any (NULL) trên tất cả', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedModerationPermissions1720003300000().up(qr);

    const insertPerms = calls[0].sql;
    expect(insertPerms).toContain("'Report.Create','Report','Create',NULL");
    expect(insertPerms).toContain("'Moderation.Queue.View','Moderation','Queue.View',NULL");
    expect(insertPerms).toContain("'Media.Moderate','Media','Moderate',NULL");
    expect(insertPerms).toContain("'Review.Moderate','Review','Moderate',NULL");
    expect(insertPerms).toContain("'Report.Resolve','Report','Resolve',NULL");
    expect(insertPerms).toContain("'AI.ModerateMedia','AI','ModerateMedia',NULL");
    expect(insertPerms).toContain('ON CONFLICT ("code") DO NOTHING');
  });

  it('up: member chỉ nhận Report.Create', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedModerationPermissions1720003300000().up(qr);

    const grantCalls = calls.filter((c) => c.sql.includes('INSERT INTO "role_permissions"'));
    const memberGrant = grantCalls.find((c) => (c.params as unknown[])[0] === 'member')!;
    expect(memberGrant.params).toEqual(['member', ['Report.Create']]);
  });

  it('up: moderator nhận đủ 4 quyền vận hành hàng chờ (Queue.View/Media.Moderate/Review.Moderate/Report.Resolve)', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedModerationPermissions1720003300000().up(qr);

    const grantCalls = calls.filter((c) => c.sql.includes('INSERT INTO "role_permissions"'));
    const modGrant = grantCalls.find((c) => (c.params as unknown[])[0] === 'moderator')!;
    expect(modGrant.params).toEqual([
      'moderator',
      ['Moderation.Queue.View', 'Media.Moderate', 'Review.Moderate', 'Report.Resolve'],
    ]);
  });

  it('up: ai_agent CHỈ nhận AI.ModerateMedia — KHÔNG BAO GIỜ Media.Moderate (ADR-018 D5/D10, "AI không tự duyệt")', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedModerationPermissions1720003300000().up(qr);

    const grantCalls = calls.filter((c) => c.sql.includes('INSERT INTO "role_permissions"'));
    const aiGrant = grantCalls.find((c) => (c.params as unknown[])[0] === 'ai_agent')!;
    expect(aiGrant.params).toEqual(['ai_agent', ['AI.ModerateMedia']]);
    expect(aiGrant.params).not.toContain('Media.Moderate');
  });

  it('up: KHÔNG seed tường minh cho administrator/super_administrator (kế thừa qua DAG)', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedModerationPermissions1720003300000().up(qr);

    const grantCalls = calls.filter((c) => c.sql.includes('INSERT INTO "role_permissions"'));
    const roles = grantCalls.map((c) => (c.params as unknown[])[0]);
    expect(roles).not.toContain('administrator');
    expect(roles).not.toContain('super_administrator');
    expect(roles).toEqual(['member', 'moderator', 'ai_agent']);
  });

  it('down: xoá đúng 6 permission', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedModerationPermissions1720003300000().down(qr);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('Report.Create');
    expect(calls[0].sql).toContain('Moderation.Queue.View');
    expect(calls[0].sql).toContain('Media.Moderate');
    expect(calls[0].sql).toContain('Review.Moderate');
    expect(calls[0].sql).toContain('Report.Resolve');
    expect(calls[0].sql).toContain('AI.ModerateMedia');
  });
});
