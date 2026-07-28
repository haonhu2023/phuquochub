import { SeedPlaceSatelliteDetails1720002200000 } from '../1720002200000-SeedPlaceSatelliteDetails';
import type { QueryRunner } from 'typeorm';

// Test cấu trúc migration (không cần DB) — cùng kiểu với InitSources.spec.ts /
// AddPlacesStatusPartialIndex.spec.ts. Đặt trong __tests__/ vì glob nạp migration của
// data-source.ts là "migrations/*.{ts,js}", không khớp thư mục con.
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

describe('SeedPlaceSatelliteDetails migration (vá lỗ hổng seed ADR-002)', () => {
  it('up: điền cả ba bảng vệ tinh — hotel, restaurant, tour', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedPlaceSatelliteDetails1720002200000().up(qr);

    const all = sqlOf(calls);
    expect(all).toContain('INSERT INTO "place_hotel_details"');
    expect(all).toContain('INSERT INTO "place_restaurant_details"');
    expect(all).toContain('INSERT INTO "place_tour_details"');
  });

  it('up: hotel_type suy từ categories.slug (resort → resort, còn lại → hotel)', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedPlaceSatelliteDetails1720002200000().up(qr);

    const hotelCall = calls.find((c) => c.sql.includes('place_hotel_details'))!;
    expect(hotelCall.sql.replace(/\s+/g, ' ')).toContain(
      `CASE c."slug" WHEN 'resort' THEN 'resort' ELSE 'hotel' END`,
    );
    // Cả hai danh mục lưu trú đều được phủ, truyền qua tham số chứ không nối chuỗi.
    expect(hotelCall.params).toEqual([['hotel', 'resort']]);
  });

  it('up: KHÔNG gán star_rating / check_in / check_out (không bịa dữ liệu cơ sở có thật)', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedPlaceSatelliteDetails1720002200000().up(qr);

    const all = sqlOf(calls);
    expect(all).not.toContain('star_rating');
    expect(all).not.toContain('check_in');
    expect(all).not.toContain('check_out');
  });

  it('up: KHÔNG đụng tới cuisines/amenities/menu (suy từ tên nhà hàng là bịa dữ liệu)', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedPlaceSatelliteDetails1720002200000().up(qr);

    const all = sqlOf(calls);
    for (const table of [
      'place_cuisines',
      'place_amenities',
      'restaurant_menu_sections',
      'restaurant_menu_items',
      'hotel_room_types',
    ]) {
      expect(all).not.toContain(table);
    }
  });

  it('up: restaurant chỉ chèn place_id — is_local_specialty giữ DEFAULT, dietary NULL', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedPlaceSatelliteDetails1720002200000().up(qr);

    const call = calls.find((c) => c.sql.includes('place_restaurant_details'))!;
    expect(call.sql.replace(/\s+/g, ' ')).toContain('INSERT INTO "place_restaurant_details" ("place_id")');
    expect(call.sql).not.toContain('is_local_specialty');
    expect(call.sql).not.toContain('dietary');
  });

  it.each([
    ['lan-ngam-san-ho-hon-thom', 'diving'],
    ['sunset-cruise-phu-quoc', 'cruise'],
    ['tour-3-dao-an-thoi', 'sightseeing'],
  ])('up: %s → tour_type=%s, truyền qua tham số bound', async (slug, tourType) => {
    const { qr, calls } = recordingRunner();
    await new SeedPlaceSatelliteDetails1720002200000().up(qr);

    const call = calls.find((c) => c.params?.[0] === slug);
    expect(call).toBeDefined();
    expect(call!.params).toEqual([slug, tourType]);
    // Giá trị enum đi qua tham số, không nội suy vào chuỗi SQL.
    expect(call!.sql).not.toContain(tourType);
  });

  it('up: tour chưa được ánh xạ → "other" (ô chưa phân loại của enum), không gán bừa loại cụ thể', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedPlaceSatelliteDetails1720002200000().up(qr);

    const fallback = calls.find((c) => c.sql.includes(`'other'::"tour_type"`));
    expect(fallback).toBeDefined();
    expect(fallback!.sql.replace(/\s+/g, ' ')).toContain(`c."slug" = 'tour'`);
  });

  it('up: mọi INSERT đều idempotent (ON CONFLICT DO NOTHING) — chạy lại không vỡ', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedPlaceSatelliteDetails1720002200000().up(qr);

    const inserts = calls.filter((c) => c.sql.includes('INSERT INTO'));
    expect(inserts.length).toBeGreaterThan(0);
    for (const insert of inserts) {
      expect(insert.sql).toContain('ON CONFLICT');
      expect(insert.sql).toContain('DO NOTHING');
    }
  });

  it('up: chỉ lấy Place chưa bị xoá mềm', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedPlaceSatelliteDetails1720002200000().up(qr);

    for (const insert of calls.filter((c) => c.sql.includes('INSERT INTO'))) {
      expect(insert.sql).toContain('"deleted_at" IS NULL');
    }
  });

  it('down: xoá đúng ba bảng vệ tinh mà up đã điền, không đụng bảng places', async () => {
    const { qr, calls } = recordingRunner();
    await new SeedPlaceSatelliteDetails1720002200000().down(qr);

    const all = sqlOf(calls);
    expect(all).toContain('DELETE FROM "place_hotel_details"');
    expect(all).toContain('DELETE FROM "place_restaurant_details"');
    expect(all).toContain('DELETE FROM "place_tour_details"');
    expect(all).not.toContain('DELETE FROM "places"');
    expect(all).not.toContain('DROP TABLE');
  });

  it('khứ hồi: mọi bảng up chèn vào đều được down xoá', async () => {
    const up = recordingRunner();
    const down = recordingRunner();
    const migration = new SeedPlaceSatelliteDetails1720002200000();
    await migration.up(up.qr);
    await migration.down(down.qr);

    const inserted = new Set(
      [...sqlOf(up.calls).matchAll(/INSERT INTO "([^"]+)"/g)].map((m) => m[1]),
    );
    const deleted = new Set([...sqlOf(down.calls).matchAll(/DELETE FROM "([^"]+)"/g)].map((m) => m[1]));
    expect([...inserted].sort()).toEqual([...deleted].sort());
  });
});
