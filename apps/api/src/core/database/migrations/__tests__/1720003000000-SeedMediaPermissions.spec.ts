import { SeedMediaPermissions1720003000000 } from '../1720003000000-SeedMediaPermissions';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('SeedMediaPermissions migration', () => {
  it('up: thêm đúng permission Media.Upload.Own (module=Media, action=Upload, scope=Own)', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedMediaPermissions1720003000000().up(qr);

    const insertPerms = calls[0].sql;
    expect(insertPerms).toContain("'Media.Upload.Own','Media','Upload','Own'");
    expect(insertPerms).toContain('ON CONFLICT ("code") DO NOTHING');
  });

  it('up: chỉ gán cho `member` (đủ để tự upload media của chính mình)', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedMediaPermissions1720003000000().up(qr);

    const grantCall = calls.find((c) => c.sql.includes('INSERT INTO "role_permissions"'))!;
    expect(grantCall.params).toEqual(['member', ['Media.Upload.Own']]);
    expect(calls.filter((c) => c.sql.includes('INSERT INTO "role_permissions"'))).toHaveLength(1);
  });

  it('down: xoá đúng 1 permission', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedMediaPermissions1720003000000().down(qr);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain(`DELETE FROM "permissions" WHERE "code" IN ('Media.Upload.Own')`);
  });
});
