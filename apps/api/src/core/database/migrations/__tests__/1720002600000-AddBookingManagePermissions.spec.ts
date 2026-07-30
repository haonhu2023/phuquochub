import { AddBookingManagePermissions1720002600000 } from '../1720002600000-AddBookingManagePermissions';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const qr = {
    query: (sql: string, params?: unknown[]) => (calls.push({ sql, params }), Promise.resolve()),
  } as QueryRunner;
  return { qr, calls };
}

describe('AddBookingManagePermissions migration (Booking Application Layer, Phase 2)', () => {
  it('up: thêm đúng 4 permission Booking.{List,Confirm,Cancel,MarkExpired}', async () => {
    const { qr, calls } = recordingRunner();
    await new AddBookingManagePermissions1720002600000().up(qr);

    const insertPerms = calls[0].sql;
    expect(insertPerms).toContain("'Booking.List','Booking','List',NULL");
    expect(insertPerms).toContain("'Booking.Confirm','Booking','Confirm',NULL");
    expect(insertPerms).toContain("'Booking.Cancel','Booking','Cancel',NULL");
    expect(insertPerms).toContain("'Booking.MarkExpired','Booking','MarkExpired',NULL");
    expect(insertPerms).toContain('ON CONFLICT ("code") DO NOTHING');
  });

  it('up: chỉ gán 4 permission mới cho role `moderator` (KHÔNG gán business_manager/business_owner — chưa có business ownership scoping)', async () => {
    const { qr, calls } = recordingRunner();
    await new AddBookingManagePermissions1720002600000().up(qr);

    const grantCall = calls.find((c) => c.sql.includes('INSERT INTO "role_permissions"'))!;
    expect(grantCall.params).toEqual([
      'moderator',
      ['Booking.List', 'Booking.Confirm', 'Booking.Cancel', 'Booking.MarkExpired'],
    ]);
    expect(calls.filter((c) => c.sql.includes('INSERT INTO "role_permissions"'))).toHaveLength(1);
  });

  it('down: xoá đúng 4 permission (không đụng Booking.View/Booking.Create hay permission module khác)', async () => {
    const { qr, calls } = recordingRunner();
    await new AddBookingManagePermissions1720002600000().down(qr);

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain(
      `DELETE FROM "permissions" WHERE "code" IN ('Booking.List','Booking.Confirm','Booking.Cancel','Booking.MarkExpired')`,
    );
    expect(calls[0].sql).not.toContain('Booking.View');
    expect(calls[0].sql).not.toContain('Booking.Create');
  });
});
