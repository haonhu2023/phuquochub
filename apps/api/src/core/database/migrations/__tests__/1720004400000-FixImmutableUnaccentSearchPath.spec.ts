import { FixImmutableUnaccentSearchPath1720004400000 } from '../1720004400000-FixImmutableUnaccentSearchPath';
import type { QueryRunner } from 'typeorm';

function recordingRunner() {
  const calls: Array<{ sql: string }> = [];
  const qr = {
    query: (sql: string) => (calls.push({ sql }), Promise.resolve()),
  } as unknown as QueryRunner;
  return { qr, calls };
}

function sqlOf(calls: Array<{ sql: string }>): string {
  return calls
    .map((c) => c.sql)
    .join('\n')
    .replace(/\s+/g, ' ');
}

// Production Backup/Restore Hardening (2026-08-12). Migration này tồn tại vì MỘT lý do: bản restore
// sạch phải chạy được khi `search_path` RỖNG. Test dưới đây khoá lại đúng tính chất đó ở mức SQL —
// tính chất ngữ nghĩa (kết quả không đổi) được chứng minh trên Postgres thật ở
// test/backup-restore.e2e-spec.ts.
describe('FixImmutableUnaccentSearchPath migration', () => {
  describe('up', () => {
    it('ghi rõ schema cho CẢ tên hàm LẪN literal regdictionary', async () => {
      const { qr, calls } = recordingRunner();
      await new FixImmutableUnaccentSearchPath1720004400000().up(qr);

      const sql = sqlOf(calls);
      expect(sql).toContain(`SELECT public.unaccent('public.unaccent'::regdictionary, $1)`);
    });

    it('KHÔNG còn lời gọi `unaccent` trần nào (đây chính là lỗi gốc)', async () => {
      const { qr, calls } = recordingRunner();
      await new FixImmutableUnaccentSearchPath1720004400000().up(qr);

      const body = sqlOf(calls).match(/\$\$(.*?)\$\$/)?.[1] ?? '';
      expect(body).not.toMatch(/(?<!public\.)\bunaccent\s*\(/);
      expect(body).not.toContain(`'unaccent'::regdictionary`); // literal chưa kèm schema cũng hỏng
    });

    it('dùng CREATE OR REPLACE — giữ OID, KHÔNG drop index FTS nào', async () => {
      const { qr, calls } = recordingRunner();
      await new FixImmutableUnaccentSearchPath1720004400000().up(qr);

      const sql = sqlOf(calls);
      expect(sql).toContain('CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)');
      expect(sql).not.toMatch(/DROP\s+FUNCTION/i);
      expect(sql).not.toMatch(/DROP\s+INDEX/i);
      expect(sql).not.toMatch(/idx_places_fts|idx_events_fts/);
      expect(sql).not.toMatch(/REINDEX/i);
    });

    it('giữ nguyên bộ thuộc tính bắt buộc để dùng được trong index GIN', async () => {
      const { qr, calls } = recordingRunner();
      await new FixImmutableUnaccentSearchPath1720004400000().up(qr);

      const sql = sqlOf(calls);
      // IMMUTABLE là điều kiện BẮT BUỘC để Postgres cho phép dùng hàm trong biểu thức index.
      expect(sql).toContain('IMMUTABLE');
      expect(sql).toContain('STRICT');
      expect(sql).toContain('PARALLEL SAFE');
      expect(sql).toContain('LANGUAGE sql');
    });

    it('chỉ chạy ĐÚNG MỘT câu lệnh — không đụng bảng/dữ liệu nào', async () => {
      const { qr, calls } = recordingRunner();
      await new FixImmutableUnaccentSearchPath1720004400000().up(qr);

      expect(calls).toHaveLength(1);
      expect(sqlOf(calls)).not.toMatch(/INSERT|UPDATE|DELETE|ALTER TABLE/i);
    });
  });

  describe('down', () => {
    it('khôi phục đúng thân hàm cũ của InitPlaces (đảo ngược được)', async () => {
      const { qr, calls } = recordingRunner();
      await new FixImmutableUnaccentSearchPath1720004400000().down(qr);

      expect(sqlOf(calls)).toContain(`SELECT unaccent('unaccent', $1)`);
      expect(calls).toHaveLength(1);
    });

    it('down cũng dùng CREATE OR REPLACE — không phá index khi lùi', async () => {
      const { qr, calls } = recordingRunner();
      await new FixImmutableUnaccentSearchPath1720004400000().down(qr);

      const sql = sqlOf(calls);
      expect(sql).toContain('CREATE OR REPLACE FUNCTION');
      expect(sql).not.toMatch(/DROP/i);
    });
  });
});
