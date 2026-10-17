import { AddJobListingDescriptionRich1720009500000 } from '../1720009500000-AddJobListingDescriptionRich';
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

describe('AddJobListingDescriptionRich migration', () => {
  it('up: thêm cột description_rich kiểu JSONB (nullable mặc định — không ràng buộc NOT NULL, dữ liệu cũ hợp lệ ngay)', async () => {
    const { qr, calls } = recordingRunner();
    await new AddJobListingDescriptionRich1720009500000().up(qr);

    expect(sqlOf(calls)).toContain('ALTER TABLE "job_listings" ADD COLUMN "description_rich" JSONB');
    // Không có NOT NULL/DEFAULT nào trong câu lệnh — mọi hàng hiện có tự động nhận NULL, không cần
    // UPDATE backfill (đúng yêu cầu "không tự chuyển đổi hàng loạt nội dung production").
    expect(sqlOf(calls)).not.toMatch(/NOT NULL/);
    expect(sqlOf(calls)).not.toMatch(/DEFAULT/);
  });

  it('down: xoá cột, không đụng gì khác của bảng', async () => {
    const { qr, calls } = recordingRunner();
    await new AddJobListingDescriptionRich1720009500000().down(qr);

    expect(sqlOf(calls)).toBe('ALTER TABLE "job_listings" DROP COLUMN "description_rich"');
  });
});
