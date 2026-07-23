import { AddPlacesStatusPartialIndex1720001900000 } from '../1720001900000-AddPlacesStatusPartialIndex';
import { InitPlaces1720000400000 } from '../1720000400000-InitPlaces';
import type { QueryRunner } from 'typeorm';

// Test cấu trúc migration (không cần DB) — xác nhận SQL khớp SSOT places.md §3
// `BTREE (status) WHERE deleted_at IS NULL`. Đặt trong __tests__/ giống InitSources.spec.ts:
// glob nạp migration là "migrations/*.{ts,js}" (data-source.ts) — không khớp thư mục con.
function recordingRunner() {
  const queries: string[] = [];
  const qr = { query: (sql: string) => (queries.push(sql), Promise.resolve()) } as QueryRunner;
  return { qr, queries };
}

describe('AddPlacesStatusPartialIndex migration (GAP-06)', () => {
  it('up: tạo đúng index partial BTREE(status) WHERE deleted_at IS NULL trên places', async () => {
    const { qr, queries } = recordingRunner();
    await new AddPlacesStatusPartialIndex1720001900000().up(qr);

    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('CREATE INDEX "idx_places_status_active"');
    expect(queries[0]).toContain('ON "places" ("status")');
    // Vị ngữ partial là phần bắt buộc của đặc tả — thiếu nó thì index sai.
    expect(queries[0]).toMatch(/WHERE\s+"deleted_at"\s+IS\s+NULL/);
  });

  it('up: KHÔNG dùng CONCURRENTLY (migration chạy trong transaction của TypeORM)', async () => {
    const { qr, queries } = recordingRunner();
    await new AddPlacesStatusPartialIndex1720001900000().up(qr);

    expect(queries.join('\n')).not.toContain('CONCURRENTLY');
  });

  it('down: chỉ drop index vừa tạo, không đụng index khác của places', async () => {
    const { qr, queries } = recordingRunner();
    await new AddPlacesStatusPartialIndex1720001900000().down(qr);

    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('DROP INDEX IF EXISTS "idx_places_status_active"');
    for (const other of [
      'uq_places_slug',
      'idx_places_category_status',
      'idx_places_location',
      'idx_places_fts',
    ]) {
      expect(queries[0]).not.toContain(other);
    }
  });

  it('up/down khứ hồi: down gỡ đúng index mà up tạo', async () => {
    const up = recordingRunner();
    const down = recordingRunner();
    const migration = new AddPlacesStatusPartialIndex1720001900000();
    await migration.up(up.qr);
    await migration.down(down.qr);

    const created = /CREATE INDEX "([^"]+)"/.exec(up.queries[0])?.[1];
    const dropped = /DROP INDEX IF EXISTS "([^"]+)"/.exec(down.queries[0])?.[1];
    expect(created).toBe('idx_places_status_active');
    expect(dropped).toBe(created);
  });

  it('không trùng lặp: InitPlaces chưa từng tạo index status-only nào', async () => {
    const { qr, queries } = recordingRunner();
    await new InitPlaces1720000400000().up(qr);
    const all = queries.join('\n');

    // 4 index gốc của places vẫn còn nguyên (migration mới chỉ THÊM).
    expect(all).toContain('uq_places_slug');
    expect(all).toContain('idx_places_category_status');
    expect(all).toContain('idx_places_location');
    expect(all).toContain('idx_places_fts');
    // …và không có index nào mang vị ngữ partial theo deleted_at trên places.
    expect(all).not.toContain('idx_places_status_active');
    expect(all).not.toMatch(/ON "places" \("status"\)/);
  });
});
