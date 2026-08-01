import { AddMediaUploadFoundation1720002900000 } from '../1720002900000-AddMediaUploadFoundation';
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
  return calls.map((c) => c.sql).join('\n').replace(/\s+/g, ' ');
}

describe('AddMediaUploadFoundation migration (Media Upload Foundation)', () => {
  it('up: url trở thành nullable (DROP NOT NULL) — không backfill, luôn an toàn dù bảng rỗng hay có dữ liệu', async () => {
    const { qr, calls } = recordingRunner();
    await new AddMediaUploadFoundation1720002900000().up(qr);
    expect(sqlOf(calls)).toContain('ALTER TABLE "media" ALTER COLUMN "url" DROP NOT NULL');
  });

  it('up: thêm đúng 5 cột metadata object storage (KHÔNG có cột url tuyệt đối/signed nào)', async () => {
    const { qr, calls } = recordingRunner();
    await new AddMediaUploadFoundation1720002900000().up(qr);
    const all = sqlOf(calls);
    expect(all).toContain('ADD COLUMN "object_key" varchar(300)');
    expect(all).toContain('ADD COLUMN "bucket" varchar(100)');
    expect(all).toContain('ADD COLUMN "content_type" varchar(100)');
    expect(all).toContain('ADD COLUMN "size_bytes" int');
    expect(all).toContain('ADD COLUMN "checksum_sha256" char(64)');
    expect(all).not.toMatch(/ADD COLUMN "(presigned|signed|absolute)/i);
  });

  it('up: nới lỏng CHECK từ đúng-một (=1) sang tối-đa-một (<=1)', async () => {
    const { qr, calls } = recordingRunner();
    await new AddMediaUploadFoundation1720002900000().up(qr);
    const all = sqlOf(calls);
    expect(all).toContain('DROP CONSTRAINT "chk_media_one_owner"');
    expect(all).toMatch(/ADD CONSTRAINT "chk_media_at_most_one_owner" CHECK \([\s\S]*?<= 1/);
  });

  it('up: unique index (uploaded_by, checksum_sha256) partial — chống trùng theo người upload', async () => {
    const { qr, calls } = recordingRunner();
    await new AddMediaUploadFoundation1720002900000().up(qr);
    const sql = calls.find((c) => c.sql.includes('idx_media_uploader_checksum'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('CREATE UNIQUE INDEX "idx_media_uploader_checksum" ON "media" ("uploaded_by", "checksum_sha256")');
    expect(sql).toContain('WHERE "deleted_at" IS NULL AND "checksum_sha256" IS NOT NULL');
  });

  it('up: thêm index uploaded_by (trước đây chưa có — chỉ có place/business/event/status)', async () => {
    const { qr, calls } = recordingRunner();
    await new AddMediaUploadFoundation1720002900000().up(qr);
    const sql = calls.find((c) => c.sql.includes('idx_media_uploaded_by'))!.sql;
    expect(sql).toContain('CREATE INDEX "idx_media_uploaded_by" ON "media" ("uploaded_by")');
  });

  describe('down — an toàn có điều kiện, từ chối rõ ràng thay vì phá dữ liệu', () => {
    it('có row object_key IS NOT NULL (upload thật) → từ chối, KHÔNG DROP gì cả', async () => {
      const { qr, calls } = recordingRunner([[{ count: 2 }]]);
      await expect(new AddMediaUploadFoundation1720002900000().down(qr)).rejects.toThrow(/object_key/);
      expect(calls.filter((c) => c.sql.includes('DROP'))).toHaveLength(0);
    });

    it('có row url IS NULL → từ chối (sẽ vi phạm NOT NULL nếu phục hồi)', async () => {
      const { qr, calls } = recordingRunner([[{ count: 0 }], [{ count: 1 }]]);
      await expect(new AddMediaUploadFoundation1720002900000().down(qr)).rejects.toThrow(/NULL "url"/);
      expect(calls.filter((c) => c.sql.includes('DROP'))).toHaveLength(0);
    });

    it('có row mồ côi (0 owner) → từ chối (sẽ vi phạm CHECK =1 nếu phục hồi)', async () => {
      const { qr, calls } = recordingRunner([[{ count: 0 }], [{ count: 0 }], [{ count: 3 }]]);
      await expect(new AddMediaUploadFoundation1720002900000().down(qr)).rejects.toThrow(/ZERO owners/);
      expect(calls.filter((c) => c.sql.includes('DROP'))).toHaveLength(0);
    });

    it('an toàn (0/0/0) → thực hiện đủ rollback: drop index trước, phục hồi cột/constraint sau', async () => {
      const { qr, calls } = recordingRunner([[{ count: 0 }], [{ count: 0 }], [{ count: 0 }]]);
      await new AddMediaUploadFoundation1720002900000().down(qr);

      const all = sqlOf(calls);
      expect(all).toContain('DROP INDEX "idx_media_uploaded_by"');
      expect(all).toContain('DROP INDEX "idx_media_uploader_checksum"');
      expect(all).toContain('DROP CONSTRAINT "chk_media_at_most_one_owner"');
      expect(all).toMatch(/ADD CONSTRAINT "chk_media_one_owner" CHECK \([\s\S]*?= 1/);
      expect(all).toContain('DROP COLUMN "checksum_sha256"');
      expect(all).toContain('DROP COLUMN "size_bytes"');
      expect(all).toContain('DROP COLUMN "content_type"');
      expect(all).toContain('DROP COLUMN "bucket"');
      expect(all).toContain('DROP COLUMN "object_key"');
      expect(all).toContain('ALTER COLUMN "url" SET NOT NULL');

      const dropIdxIdx = calls.findIndex((c) => c.sql.includes('DROP INDEX "idx_media_uploaded_by"'));
      const dropColIdx = calls.findIndex((c) => c.sql.includes('DROP COLUMN "object_key"'));
      expect(dropIdxIdx).toBeLessThan(dropColIdx); // indexes dropped before columns
    });
  });
});
