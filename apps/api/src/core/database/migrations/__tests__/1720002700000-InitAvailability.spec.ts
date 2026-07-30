import { InitAvailability1720002700000 } from '../1720002700000-InitAvailability';
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

describe('InitAvailability migration (Availability & Inventory Foundation)', () => {
  it('up: tạo 2 bảng mới + 1 enum trạng thái hold', async () => {
    const { qr, calls } = recordingRunner();
    await new InitAvailability1720002700000().up(qr);

    const all = sqlOf(calls);
    expect(all).toContain('CREATE TYPE "inventory_hold_status"');
    expect(all).toContain('CREATE TABLE "availability_slots"');
    expect(all).toContain('CREATE TABLE "inventory_holds"');
  });

  it('up: inventory_hold_status có đúng 4 giá trị (active/expired/released/confirmed)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitAvailability1720002700000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TYPE "inventory_hold_status"'))!.sql;
    expect(sql).toContain("'active','expired','released','confirmed'");
  });

  it('up: availability_slots — entity_type/entity_id KHÔNG có FK cứng (đa hình); place_id CÓ FK thật ON DELETE NO ACTION', async () => {
    const { qr, calls } = recordingRunner();
    await new InitAvailability1720002700000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "availability_slots"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('"entity_type" varchar(30) NOT NULL');
    expect(sql).toContain('"entity_id" uuid NOT NULL');
    expect(sql).not.toMatch(/"entity_id"[^,]*REFERENCES/);
    expect(sql).toContain('"place_id" uuid NOT NULL REFERENCES "places"("id") ON DELETE NO ACTION');
  });

  it('up: availability_slots có UNIQUE(entity_type,entity_id,slot_start) + CHECK total_capacity>0', async () => {
    const { qr, calls } = recordingRunner();
    await new InitAvailability1720002700000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "availability_slots"'))!.sql;
    expect(sql).toContain('CONSTRAINT "uq_availability_slots_entity_start" UNIQUE ("entity_type","entity_id","slot_start")');
    expect(sql).toContain('CONSTRAINT "chk_availability_slots_capacity" CHECK ("total_capacity" > 0)');
  });

  it('up: slot_end nullable (không NOT NULL) — điểm thời gian đơn không bắt buộc có khung', async () => {
    const { qr, calls } = recordingRunner();
    await new InitAvailability1720002700000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "availability_slots"'))!.sql;
    expect(sql).toContain('"slot_end" timestamptz,');
    expect(sql).not.toContain('"slot_end" timestamptz NOT NULL');
  });

  it('up: inventory_holds FK CASCADE về CẢ availability_slots LẪN bookings; UNIQUE(booking_id); CHECK quantity>0', async () => {
    const { qr, calls } = recordingRunner();
    await new InitAvailability1720002700000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "inventory_holds"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('"availability_slot_id" uuid NOT NULL REFERENCES "availability_slots"("id") ON DELETE CASCADE');
    expect(sql).toContain('"booking_id" uuid NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE');
    expect(sql).toContain('CONSTRAINT "uq_inventory_holds_booking" UNIQUE ("booking_id")');
    expect(sql).toContain('CONSTRAINT "chk_inventory_holds_quantity" CHECK ("quantity" > 0)');
  });

  it('up: có index cho entity/place/slot_start (availability_slots) và slot/status (inventory_holds) — truy vấn quản trị/sweep tương lai', async () => {
    const { qr, calls } = recordingRunner();
    await new InitAvailability1720002700000().up(qr);

    const all = sqlOf(calls);
    expect(all).toContain('CREATE INDEX "idx_availability_slots_entity" ON "availability_slots" ("entity_type","entity_id")');
    expect(all).toContain('CREATE INDEX "idx_availability_slots_place" ON "availability_slots" ("place_id")');
    expect(all).toContain('CREATE INDEX "idx_availability_slots_start" ON "availability_slots" ("slot_start")');
    expect(all).toContain('CREATE INDEX "idx_inventory_holds_slot" ON "inventory_holds" ("availability_slot_id")');
    expect(all).toContain('CREATE INDEX "idx_inventory_holds_status" ON "inventory_holds" ("status")');
  });

  it('down: xoá 2 bảng (thứ tự inventory_holds trước availability_slots) + enum type', async () => {
    const { qr, calls } = recordingRunner();
    await new InitAvailability1720002700000().down(qr);

    const dropInventoryIdx = calls.findIndex((c) => c.sql.includes('DROP TABLE IF EXISTS "inventory_holds"'));
    const dropSlotsIdx = calls.findIndex((c) => c.sql.includes('DROP TABLE IF EXISTS "availability_slots"'));
    expect(dropInventoryIdx).toBeGreaterThanOrEqual(0);
    expect(dropSlotsIdx).toBeGreaterThan(dropInventoryIdx); // inventory_holds phụ thuộc availability_slots — phải xoá trước
    expect(sqlOf(calls)).toContain('DROP TYPE IF EXISTS "inventory_hold_status"');
  });
});
