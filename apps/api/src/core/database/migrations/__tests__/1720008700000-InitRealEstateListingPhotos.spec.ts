import { InitRealEstateListingPhotos1720008700000 } from '../1720008700000-InitRealEstateListingPhotos';
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

describe('InitRealEstateListingPhotos migration', () => {
  it('up: tạo bảng real_estate_listing_photos', async () => {
    const { qr, calls } = recordingRunner();
    await new InitRealEstateListingPhotos1720008700000().up(qr);

    const all = sqlOf(calls);
    expect(all).toContain('CREATE TABLE "real_estate_listing_photos"');
  });

  it('up: listing_id FK CASCADE tới real_estate_listings (khác saved_items/listing_reports — chỉ nhắm một loại entity, không đa hình)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitRealEstateListingPhotos1720008700000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "real_estate_listing_photos"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('"listing_id" UUID NOT NULL REFERENCES "real_estate_listings" ("id") ON DELETE CASCADE');
    expect(sql).toContain('"uploaded_by" UUID NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE');
  });

  it('up: object_key UNIQUE (mỗi object storage chỉ đăng ký thành một ảnh duy nhất)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitRealEstateListingPhotos1720008700000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "real_estate_listing_photos"'))!.sql;
    expect(sql).toContain('CONSTRAINT "uq_real_estate_listing_photos_object_key" UNIQUE ("object_key")');
  });

  it('up: có index (listing_id, sort_order) cho truy vấn "ảnh của tin này theo thứ tự"', async () => {
    const { qr, calls } = recordingRunner();
    await new InitRealEstateListingPhotos1720008700000().up(qr);

    const all = sqlOf(calls);
    expect(all).toContain(
      'CREATE INDEX "idx_real_estate_listing_photos_listing" ON "real_estate_listing_photos" ("listing_id", "sort_order")',
    );
  });

  it('down: xoá bảng', async () => {
    const { qr, calls } = recordingRunner();
    await new InitRealEstateListingPhotos1720008700000().down(qr);

    expect(sqlOf(calls)).toContain('DROP TABLE IF EXISTS "real_estate_listing_photos"');
  });
});
