import { AddPlaceTranslationRichDoc1720010100000 } from '../1720010100000-AddPlaceTranslationRichDoc';
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

describe('AddPlaceTranslationRichDoc migration', () => {
  it('up: thêm cột rich_doc kiểu JSONB (nullable mặc định — không ràng buộc NOT NULL, dữ liệu cũ hợp lệ ngay)', async () => {
    const { qr, calls } = recordingRunner();
    await new AddPlaceTranslationRichDoc1720010100000().up(qr);

    expect(sqlOf(calls)).toContain('ALTER TABLE "place_translations" ADD COLUMN "rich_doc" JSONB');
    // Không có NOT NULL/DEFAULT nào trong câu lệnh — mọi hàng hiện có tự động nhận NULL, không cần
    // UPDATE backfill (đúng yêu cầu "không tự chuyển đổi hàng loạt nội dung production").
    expect(sqlOf(calls)).not.toMatch(/NOT NULL/);
    expect(sqlOf(calls)).not.toMatch(/DEFAULT/);
  });

  it('down: xoá cột, không đụng gì khác của bảng', async () => {
    const { qr, calls } = recordingRunner();
    await new AddPlaceTranslationRichDoc1720010100000().down(qr);

    expect(sqlOf(calls)).toBe('ALTER TABLE "place_translations" DROP COLUMN "rich_doc"');
  });
});
