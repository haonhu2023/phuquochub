import { AddReviewConfirmedVisit1720010500000 } from '../1720010500000-AddReviewConfirmedVisit';
import type { QueryRunner } from 'typeorm';

function recordingRunner(queryResults: unknown[] = []) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  let i = 0;
  const qr = {
    query: (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      return Promise.resolve(queryResults[i++]);
    },
  } as QueryRunner;
  return { qr, calls };
}

describe('AddReviewConfirmedVisit migration (Giai đoạn 4 — "đã xác nhận từng đến")', () => {
  it('up: thêm cột verified_booking_id, nullable, FK tới bookings ON DELETE SET NULL', async () => {
    const { qr, calls } = recordingRunner();
    await new AddReviewConfirmedVisit1720010500000().up(qr);

    const sqls = calls.map((c) => c.sql);
    expect(
      sqls.some(
        (s) =>
          s.includes('ALTER TABLE "reviews" ADD COLUMN "verified_booking_id"') &&
          s.includes('REFERENCES "bookings"("id")') &&
          s.includes('ON DELETE SET NULL'),
      ),
    ).toBe(true);
    // KHÔNG NOT NULL — "không bắt buộc ngay" (nguyên văn chiến lược).
    expect(sqls.some((s) => s.includes('NOT NULL'))).toBe(false);
  });

  it('down: không có review nào dùng verified_booking_id → gỡ cột', async () => {
    const { qr, calls } = recordingRunner([[{ count: '0' }]]);
    await new AddReviewConfirmedVisit1720010500000().down(qr);

    const sqls = calls.map((c) => c.sql);
    expect(sqls.some((s) => s.includes('SELECT count(*)'))).toBe(true);
    expect(sqls.some((s) => s.includes('DROP COLUMN IF EXISTS "verified_booking_id"'))).toBe(true);
  });

  it('down: CÓ review dùng verified_booking_id → từ chối (throw), KHÔNG gỡ cột (không âm thầm mất bằng chứng đã-từng-đến)', async () => {
    const { qr, calls } = recordingRunner([[{ count: '3' }]]);

    await expect(new AddReviewConfirmedVisit1720010500000().down(qr)).rejects.toThrow(/refused/i);

    const sqls = calls.map((c) => c.sql);
    expect(sqls.some((s) => s.includes('DROP COLUMN'))).toBe(false);
  });
});
