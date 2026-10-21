import { AddBookingManagedPermissions1720010400000 } from '../1720010400000-AddBookingManagedPermissions';
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

describe('AddBookingManagedPermissions migration (Giai đoạn 3 — đặt chỗ cho chủ cơ sở đã xác minh)', () => {
  it('up: seed đúng BA permission có hậu tố .Managed', async () => {
    const { qr, calls } = recordingRunner();
    await new AddBookingManagedPermissions1720010400000().up(qr);

    const all = sqlOf(calls);
    expect(all).toContain(`('Booking.List.Managed','Booking','List','Managed')`);
    expect(all).toContain(`('Booking.Confirm.Managed','Booking','Confirm','Managed')`);
    expect(all).toContain(`('Booking.Cancel.Managed','Booking','Cancel','Managed')`);
    expect(all).toContain('ON CONFLICT ("code") DO NOTHING');
    // KHÔNG đụng Booking.MarkExpired — ngoài phạm vi Giai đoạn 3.
    expect(all).not.toContain('Booking.MarkExpired');
  });

  it('up: grant cho business_manager (kế thừa lên business_owner qua role DAG), không role nào khác', async () => {
    const { qr, calls } = recordingRunner();
    await new AddBookingManagedPermissions1720010400000().up(qr);

    const grantCalls = calls.filter((c) => c.sql.includes('INSERT INTO "role_permissions"'));
    expect(grantCalls).toHaveLength(1);
    const sql = grantCalls[0].sql.replace(/\s+/g, ' ');
    expect(sql).toContain(`r.code = 'business_manager'`);
    expect(sql).toContain(`p.code IN ('Booking.List.Managed','Booking.Confirm.Managed','Booking.Cancel.Managed')`);
    expect(sql).toContain('ON CONFLICT ("role_id","permission_id") DO NOTHING');
    expect(sql).not.toContain(`'moderator'`);
    expect(sql).not.toContain(`'business_owner'`);
  });

  it('down: xoá đúng ba permission mới, không đụng gì khác', async () => {
    const { qr, calls } = recordingRunner();
    await new AddBookingManagedPermissions1720010400000().down(qr);

    const sql = sqlOf(calls);
    expect(sql).toContain(
      `DELETE FROM "permissions" WHERE "code" IN ('Booking.List.Managed','Booking.Confirm.Managed','Booking.Cancel.Managed')`,
    );
  });
});
