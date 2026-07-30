import { SeedAvailabilityPermissions1720002800000 } from '../1720002800000-SeedAvailabilityPermissions';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('SeedAvailabilityPermissions migration', () => {
  it('up: thêm đúng 2 permission Availability.{View,Manage}', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedAvailabilityPermissions1720002800000().up(qr);

    const insertPerms = calls[0].sql;
    expect(insertPerms).toContain("'Availability.View','Availability','View',NULL");
    expect(insertPerms).toContain("'Availability.Manage','Availability','Manage',NULL");
    expect(insertPerms).toContain('ON CONFLICT ("code") DO NOTHING');
  });

  it('up: chỉ gán cho `moderator` (KHÔNG business_manager/business_owner — chưa có business ownership scoping)', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedAvailabilityPermissions1720002800000().up(qr);

    const grantCall = calls.find((c) => c.sql.includes('INSERT INTO "role_permissions"'))!;
    expect(grantCall.params).toEqual(['moderator', ['Availability.View', 'Availability.Manage']]);
    expect(calls.filter((c) => c.sql.includes('INSERT INTO "role_permissions"'))).toHaveLength(1);
  });

  it('down: xoá đúng 2 permission', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedAvailabilityPermissions1720002800000().down(qr);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain(`DELETE FROM "permissions" WHERE "code" IN ('Availability.View','Availability.Manage')`);
  });
});
