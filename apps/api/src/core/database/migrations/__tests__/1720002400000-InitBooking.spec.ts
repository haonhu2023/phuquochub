import { InitBooking1720002400000 } from '../1720002400000-InitBooking';
import type { QueryRunner } from 'typeorm';

// Test cấu trúc migration (không cần DB) — cùng recordingRunner đã dùng cho InitTransport.spec.ts.
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

describe('InitBooking migration (Booking Request Foundation)', () => {
  it('up: tạo 2 bảng mới + 3 enum trạng thái tách riêng', async () => {
    const { qr, calls } = recordingRunner();
    await new InitBooking1720002400000().up(qr);

    const all = sqlOf(calls);
    expect(all).toContain('CREATE TYPE "booking_status"');
    expect(all).toContain('CREATE TYPE "booking_payment_status"');
    expect(all).toContain('CREATE TYPE "booking_fulfillment_status"');
    expect(all).toContain('CREATE TABLE "bookings"');
    expect(all).toContain('CREATE TABLE "booking_items"');
  });

  it('up: booking_status/payment_status/fulfillment_status là BA cột enum khác nhau, không gộp', async () => {
    const { qr, calls } = recordingRunner();
    await new InitBooking1720002400000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "bookings"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('"booking_status" "booking_status" NOT NULL DEFAULT \'pending\'');
    expect(sql).toContain('"payment_status" "booking_payment_status" NOT NULL DEFAULT \'unpaid\'');
    expect(sql).toContain('"fulfillment_status" "booking_fulfillment_status" NOT NULL DEFAULT \'pending\'');
  });

  it('up: entity_type/entity_id KHÔNG có FK cứng (đa hình, ADR-003 ngoại lệ); place_id CÓ FK thật ON DELETE NO ACTION', async () => {
    const { qr, calls } = recordingRunner();
    await new InitBooking1720002400000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "bookings"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('"entity_type" varchar(30) NOT NULL');
    expect(sql).toContain('"entity_id" uuid NOT NULL');
    expect(sql).not.toMatch(/"entity_id"[^,]*REFERENCES/);
    expect(sql).toContain('"place_id" uuid NOT NULL REFERENCES "places"("id") ON DELETE NO ACTION');
  });

  it('up: booking_code UNIQUE, currency_code mặc định VND', async () => {
    const { qr, calls } = recordingRunner();
    await new InitBooking1720002400000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "bookings"'))!.sql;
    expect(sql).toContain('CONSTRAINT "uq_bookings_code" UNIQUE ("booking_code")');
    expect(sql).toContain(`"currency_code" char(3) NOT NULL DEFAULT 'VND'`);
  });

  it('up: booking_items FK CASCADE về bookings (xoá booking thì xoá item, không mồ côi)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitBooking1720002400000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "booking_items"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('"booking_id" uuid NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE');
  });

  it('up: có index cho booking_status và service_start_at (truy vấn quản trị/lịch sắp tới)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitBooking1720002400000().up(qr);

    const all = sqlOf(calls);
    expect(all).toContain('CREATE INDEX "idx_bookings_status" ON "bookings" ("booking_status")');
    expect(all).toContain('CREATE INDEX "idx_bookings_service_start" ON "bookings" ("service_start_at")');
  });

  it('down: xoá 2 bảng + 3 enum type (thứ tự an toàn, chỉ cộng thêm/không mất dữ liệu module khác)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitBooking1720002400000().down(qr);

    const all = sqlOf(calls);
    expect(all).toContain('DROP TABLE IF EXISTS "booking_items"');
    expect(all).toContain('DROP TABLE IF EXISTS "bookings"');
    expect(all).toContain('DROP TYPE IF EXISTS "booking_fulfillment_status"');
    expect(all).toContain('DROP TYPE IF EXISTS "booking_payment_status"');
    expect(all).toContain('DROP TYPE IF EXISTS "booking_status"');
  });
});
