import { InitTransport1720002300000 } from '../1720002300000-InitTransport';
import type { QueryRunner } from 'typeorm';

// Test cấu trúc migration (không cần DB) — cùng kiểu recordingRunner đã dùng cho
// AddPlacesStatusPartialIndex.spec.ts / SeedPlaceSatelliteDetails.spec.ts.
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

describe('InitTransport migration (ADR-017)', () => {
  it('up: tạo đủ 5 bảng mới + enum pricing_model', async () => {
    const { qr, calls } = recordingRunner();
    await new InitTransport1720002300000().up(qr);

    const all = sqlOf(calls);
    expect(all).toContain(`CREATE TYPE "pricing_model" AS ENUM`);
    expect(all).toContain('CREATE TABLE "transport_types"');
    expect(all).toContain('CREATE TABLE "place_transport_details"');
    expect(all).toContain('CREATE TABLE "transport_service_options"');
    expect(all).toContain('CREATE TABLE "transport_routes"');
    expect(all).toContain('CREATE TABLE "transport_service_areas"');
  });

  it('up: pricing_model liệt kê đủ 7 giá trị đã thiết kế (transport.md §3.2)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitTransport1720002300000().up(qr);

    const enumCall = calls.find((c) => c.sql.includes('CREATE TYPE "pricing_model"'))!;
    for (const v of ['fixed', 'starting_from', 'per_km', 'per_hour', 'per_person', 'per_vehicle', 'contact']) {
      expect(enumCall.sql).toContain(`'${v}'`);
    }
  });

  it('up: place_transport_details là 1:1 (place_id PK+FK CASCADE), transport_type_id NOT NULL', async () => {
    const { qr, calls } = recordingRunner();
    await new InitTransport1720002300000().up(qr);

    const call = calls.find((c) => c.sql.includes('CREATE TABLE "place_transport_details"'))!;
    const sql = call.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('"place_id" uuid PRIMARY KEY REFERENCES "places"("id") ON DELETE CASCADE');
    expect(sql).toContain('"transport_type_id" uuid NOT NULL REFERENCES "transport_types"("id") ON DELETE NO ACTION');
  });

  it('up: provider_business_id/pricing_model/booking_required/airport_transfer đều NULLABLE (tri-state, không default che giấu)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitTransport1720002300000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "place_transport_details"'))!.sql;
    expect(sql).not.toMatch(/"provider_business_id"[^,]*NOT NULL/);
    expect(sql).not.toMatch(/"pricing_model"[^,]*NOT NULL/);
    expect(sql).not.toMatch(/"booking_required"[^,]*NOT NULL/);
    expect(sql).not.toMatch(/"airport_transfer"[^,]*NOT NULL/);
    // Đối chiếu: is_local_specialty (Restaurant) DÙNG default false — Transport CỐ Ý khác đi,
    // xác nhận migration này không vô tình copy khuôn đó.
    expect(sql).not.toContain('DEFAULT false');
  });

  it('up: ràng buộc CHECK giá và sức chứa không âm', async () => {
    const { qr, calls } = recordingRunner();
    await new InitTransport1720002300000().up(qr);

    const detailsSql = calls.find((c) => c.sql.includes('CREATE TABLE "place_transport_details"'))!.sql;
    expect(detailsSql).toContain('CONSTRAINT "chk_transport_price_nonneg" CHECK ("price_ref" IS NULL OR "price_ref" >= 0)');
    expect(detailsSql).toContain(
      'CONSTRAINT "chk_transport_capacity_nonneg" CHECK ("capacity_passengers" IS NULL OR "capacity_passengers" >= 0)',
    );

    const optionsSql = calls.find((c) => c.sql.includes('CREATE TABLE "transport_service_options"'))!.sql;
    expect(optionsSql).toContain('CONSTRAINT "chk_transport_option_price_nonneg"');
    expect(optionsSql).toContain('CONSTRAINT "chk_transport_option_capacity_nonneg"');
  });

  it('up: transport_routes cấm origin/destination trùng nhãn', async () => {
    const { qr, calls } = recordingRunner();
    await new InitTransport1720002300000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "transport_routes"'))!.sql;
    expect(sql).toContain('CONSTRAINT "chk_transport_route_distinct_labels" CHECK ("origin_label" <> "destination_label")');
  });

  it('up: transport_service_areas là junction (place_id, ward) — tái dùng ward tự do, không FK tới từ điển mới', async () => {
    const { qr, calls } = recordingRunner();
    await new InitTransport1720002300000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "transport_service_areas"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('"ward" varchar(120) NOT NULL');
    expect(sql).toContain('PRIMARY KEY ("place_id","ward")');
    expect(sql).not.toContain('REFERENCES "service_areas"');
  });

  it('up: index GIST cho toạ độ tuyến, chỉ khi có toạ độ (WHERE NOT NULL)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitTransport1720002300000().up(qr);

    const all = sqlOf(calls);
    expect(all).toContain('USING GIST ("origin_location") WHERE "origin_location" IS NOT NULL');
    expect(all).toContain('USING GIST ("destination_location") WHERE "destination_location" IS NOT NULL');
  });

  it('up: unique index trên transport_types.code', async () => {
    const { qr, calls } = recordingRunner();
    await new InitTransport1720002300000().up(qr);

    expect(sqlOf(calls)).toContain('CREATE UNIQUE INDEX "uq_transport_types_code" ON "transport_types" ("code")');
  });

  it('up: seed đúng 12 mã transport_types, mỗi INSERT ON CONFLICT DO NOTHING (idempotent)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitTransport1720002300000().up(qr);

    const typeSeeds = calls.filter((c) => c.sql.includes('INSERT INTO "transport_types"'));
    expect(typeSeeds).toHaveLength(12);
    for (const c of typeSeeds) {
      expect(c.sql).toContain('ON CONFLICT ("code") DO NOTHING');
    }
    const codes = typeSeeds.map((c) => c.params?.[0]);
    expect(new Set(codes).size).toBe(12); // không trùng mã
    expect(codes).toEqual(
      expect.arrayContaining([
        'taxi', 'airport_transfer', 'private_car', 'shuttle', 'bus', 'motorbike_rental',
        'bicycle_rental', 'electric_buggy', 'ferry', 'cano', 'speedboat', 'yacht_charter',
      ]),
    );
  });

  it('up: seed category "transport" — ON CONFLICT DO NOTHING, cùng vị trí InitTour seed "tour"', async () => {
    const { qr, calls } = recordingRunner();
    await new InitTransport1720002300000().up(qr);

    const call = calls.find((c) => c.sql.includes('INSERT INTO "categories"'))!;
    expect(call.sql.replace(/\s+/g, ' ')).toContain(`VALUES ('transport','Di chuyển','Transport','car')`);
    expect(call.sql).toContain('ON CONFLICT ("slug") DO NOTHING');
  });

  it('up: KHÔNG có INSERT nào vào places/place_transport_details — không doanh nghiệp/giá thật nào bị seed', async () => {
    const { qr, calls } = recordingRunner();
    await new InitTransport1720002300000().up(qr);

    const all = sqlOf(calls);
    expect(all).not.toContain('INSERT INTO "places"');
    expect(all).not.toContain('INSERT INTO "place_transport_details"');
  });

  it('down: xoá đúng 5 bảng + enum theo thứ tự ngược, xoá category, KHÔNG đụng places/bảng vertical khác', async () => {
    const { qr, calls } = recordingRunner();
    await new InitTransport1720002300000().down(qr);

    const all = sqlOf(calls);
    expect(all).toContain('DELETE FROM "categories" WHERE "slug" = \'transport\'');
    expect(all).toContain('DROP TABLE IF EXISTS "transport_service_areas"');
    expect(all).toContain('DROP TABLE IF EXISTS "transport_routes"');
    expect(all).toContain('DROP TABLE IF EXISTS "transport_service_options"');
    expect(all).toContain('DROP TABLE IF EXISTS "place_transport_details"');
    expect(all).toContain('DROP TABLE IF EXISTS "transport_types"');
    expect(all).toContain('DROP TYPE IF EXISTS "pricing_model"');
    expect(all).not.toContain('DROP TABLE IF EXISTS "places"');
    expect(all).not.toMatch(/"place_hotel_details"|"place_tour_details"|"place_restaurant_details"/);
  });

  it('khứ hồi: mọi bảng up tạo đều được down drop, đúng số lượng', async () => {
    const up = recordingRunner();
    const down = recordingRunner();
    const migration = new InitTransport1720002300000();
    await migration.up(up.qr);
    await migration.down(down.qr);

    const created = [...sqlOf(up.calls).matchAll(/CREATE TABLE "([^"]+)"/g)].map((m) => m[1]).sort();
    const dropped = [...sqlOf(down.calls).matchAll(/DROP TABLE IF EXISTS "([^"]+)"/g)].map((m) => m[1]).sort();
    expect(dropped).toEqual(created);
  });
});
