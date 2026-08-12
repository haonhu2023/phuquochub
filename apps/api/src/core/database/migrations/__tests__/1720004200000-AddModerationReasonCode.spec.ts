import { AddModerationReasonCode1720004200000 } from '../1720004200000-AddModerationReasonCode';
import type { QueryRunner } from 'typeorm';

function recordingRunner(queryResults: unknown[] = []) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  let i = 0;
  const qr = {
    query: (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      const result = queryResults[i];
      i += 1;
      return Promise.resolve(result);
    },
  } as unknown as QueryRunner;
  return { qr, calls };
}

function sqlOf(calls: Array<{ sql: string }>): string {
  return calls
    .map((c) => c.sql)
    .join('\n')
    .replace(/\s+/g, ' ');
}

// Controlled Media Rejection Reason (2026-08-12). Migration CỘNG THÊM thuần tuý — điều quan trọng
// nhất cần ghim: nó KHÔNG chạm vào dữ liệu lịch sử theo bất kỳ cách nào (không backfill, không
// CHECK, không NOT NULL, không DEFAULT), và `down()` từ chối thay vì âm thầm xoá phân loại thật.
describe('AddModerationReasonCode migration (Controlled Media Rejection Reason)', () => {
  describe('up', () => {
    it('tạo enum CSDL thật với ĐÚNG 5 giá trị taxonomy (không phải varchar tự do)', async () => {
      const { qr, calls } = recordingRunner();
      await new AddModerationReasonCode1720004200000().up(qr);

      expect(sqlOf(calls)).toContain(
        `CREATE TYPE "media_moderation_reason_code" AS ENUM ('inappropriate_content','low_quality','unrelated_to_place','copyright','other')`,
      );
    });

    it('thêm ĐÚNG MỘT cột, nullable — KHÔNG NOT NULL, KHÔNG DEFAULT', async () => {
      const { qr, calls } = recordingRunner();
      await new AddModerationReasonCode1720004200000().up(qr);
      const all = sqlOf(calls);

      expect(all).toContain(`ALTER TABLE "moderation_cases" ADD COLUMN "reason_code" "media_moderation_reason_code"`);
      expect(all).not.toMatch(/NOT NULL/i);
      expect(all).not.toMatch(/DEFAULT/i);
      expect(calls.filter((c) => /ADD COLUMN/i.test(c.sql))).toHaveLength(1);
    });

    // Điểm mấu chốt của tương thích ngược: dòng lịch sử (`reason != null`, `reason_code = null`)
    // là dữ liệu HỢP LỆ. Một CHECK kiểu `ck_business_claims_rejected_reason` sẽ biến toàn bộ case
    // đã resolved trước milestone này thành vi phạm ràng buộc và làm migration hỏng.
    it('KHÔNG thêm CHECK constraint nào — quy tắc "reject phải có mã" sống ở tầng service', async () => {
      const { qr, calls } = recordingRunner();
      await new AddModerationReasonCode1720004200000().up(qr);

      expect(sqlOf(calls)).not.toMatch(/CHECK|CONSTRAINT/i);
    });

    it('KHÔNG backfill, KHÔNG UPDATE, KHÔNG suy đoán mã từ cột reason free text', async () => {
      const { qr, calls } = recordingRunner();
      await new AddModerationReasonCode1720004200000().up(qr);
      const all = sqlOf(calls);

      expect(all).not.toMatch(/UPDATE\s+"?moderation_cases"?/i);
      expect(all).not.toMatch(/INSERT/i);
      // Không có phép đoán nào từ `reason` (LIKE/ILIKE/CASE WHEN trên text tự do).
      expect(all).not.toMatch(/ILIKE|LIKE|CASE WHEN/i);
    });

    it('KHÔNG đụng media/reviews/reports và KHÔNG đụng cột reason sẵn có', async () => {
      const { qr, calls } = recordingRunner();
      await new AddModerationReasonCode1720004200000().up(qr);
      const all = sqlOf(calls);

      expect(all).not.toMatch(/ALTER TABLE "(media|reviews|reports)"/);
      expect(all).not.toMatch(/DROP COLUMN|ALTER COLUMN/i);
    });
  });

  describe('down — MR-5: từ chối thay vì huỷ phân loại quyết định thật', () => {
    it('có case mang reason_code -> ném lỗi, KHÔNG DROP gì cả', async () => {
      const { qr, calls } = recordingRunner([[{ count: 3 }]]);

      await expect(new AddModerationReasonCode1720004200000().down(qr)).rejects.toThrow(/reason_code/);
      expect(calls.filter((c) => /DROP/i.test(c.sql))).toHaveLength(0);
    });

    it('thông điệp từ chối nêu rõ số dòng bị ảnh hưởng (để người vận hành xử lý được)', async () => {
      const { qr } = recordingRunner([[{ count: 7 }]]);

      await expect(new AddModerationReasonCode1720004200000().down(qr)).rejects.toThrow(/7 moderation case/);
    });

    it('không có dòng nào mang mã -> revert đầy đủ: drop cột rồi drop type', async () => {
      const { qr, calls } = recordingRunner([[{ count: 0 }]]);
      await new AddModerationReasonCode1720004200000().down(qr);
      const all = sqlOf(calls);

      expect(all).toContain(`ALTER TABLE "moderation_cases" DROP COLUMN "reason_code"`);
      expect(all).toContain(`DROP TYPE IF EXISTS "media_moderation_reason_code"`);

      const dropCol = calls.findIndex((c) => c.sql.includes('DROP COLUMN'));
      const dropType = calls.findIndex((c) => c.sql.includes('DROP TYPE'));
      expect(dropCol).toBeLessThan(dropType); // cột phụ thuộc type — phải bỏ cột trước
    });

    it('kiểm tra an toàn chỉ đếm reason_code — KHÔNG đụng tới cột reason free text', async () => {
      const { qr, calls } = recordingRunner([[{ count: 0 }]]);
      await new AddModerationReasonCode1720004200000().down(qr);

      const guard = calls[0].sql.replace(/\s+/g, ' ');
      expect(guard).toContain(`FROM "moderation_cases" WHERE "reason_code" IS NOT NULL`);
    });
  });
});
