import { SeedContentOwnerRole1720005700000 } from '../1720005700000-SeedContentOwnerRole';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('SeedContentOwnerRole migration', () => {
  it('up: thêm đúng MỘT role content_owner, is_assignable=true', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedContentOwnerRole1720005700000().up(qr);

    const insertRole = calls[0].sql;
    expect(insertRole).toContain("'content_owner','Content Owner'");
    expect(insertRole).toContain('ON CONFLICT ("code") DO NOTHING');
    expect(calls.filter((c) => c.sql.includes('INSERT INTO "roles"'))).toHaveLength(1);
  });

  it('up: cha DUY NHẤT trong role_parents là contributor', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedContentOwnerRole1720005700000().up(qr);

    const linkCalls = calls.filter((c) => c.sql.includes('INSERT INTO "role_parents"'));
    expect(linkCalls).toHaveLength(1);
    expect(linkCalls[0].sql).toContain("c.code = 'content_owner' AND p.code = 'contributor'");
  });

  it('up: KHÔNG cấp permission nào (role_permissions) trong migration này — hai permission trực tiếp nằm ở migration riêng', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedContentOwnerRole1720005700000().up(qr);

    const all = calls.map((c) => c.sql).join('\n');
    expect(all).not.toContain('role_permissions');
  });

  it('up: KHÔNG đặt content_owner làm cha/con của moderator/administrator/business_manager', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedContentOwnerRole1720005700000().up(qr);

    const linkCalls = calls.filter((c) => c.sql.includes('INSERT INTO "role_parents"'));
    const linkedRoles = linkCalls.map((c) => c.sql).join('\n');
    expect(linkedRoles).not.toContain('moderator');
    expect(linkedRoles).not.toContain('administrator');
    expect(linkedRoles).not.toContain('business_manager');
  });

  it('down: gỡ role_parents rồi role, đúng theo mã content_owner', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedContentOwnerRole1720005700000().down(qr);

    expect(calls).toHaveLength(2);
    expect(calls[0].sql).toContain('DELETE FROM "role_parents"');
    expect(calls[0].sql).toContain("code = 'content_owner'");
    expect(calls[1].sql).toContain(`DELETE FROM "roles" WHERE "code" = 'content_owner'`);
  });
});
