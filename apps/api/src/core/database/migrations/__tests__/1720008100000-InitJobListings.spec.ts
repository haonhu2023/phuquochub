import { InitJobListings1720008100000 } from '../1720008100000-InitJobListings';
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

describe('InitJobListings migration', () => {
  it('up: tạo 3 enum type + bảng job_listings', async () => {
    const { qr, calls } = recordingRunner();
    await new InitJobListings1720008100000().up(qr);

    const all = sqlOf(calls);
    expect(all).toContain('CREATE TYPE "job_listing_status" AS ENUM');
    expect(all).toContain('CREATE TYPE "job_listing_employment_type" AS ENUM');
    expect(all).toContain('CREATE TYPE "job_listing_salary_period" AS ENUM');
    expect(all).toContain('CREATE TABLE "job_listings"');
  });

  it('up: created_by FK RESTRICT (không mất dấu ai tạo), place_id FK SET NULL (tùy chọn)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitJobListings1720008100000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "job_listings"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('"created_by" UUID NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT');
    expect(sql).toContain('"place_id" UUID REFERENCES "places" ("id") ON DELETE SET NULL');
    expect(sql).not.toMatch(/"place_id"[^,]*NOT NULL/);
  });

  it('up: status mặc định draft, reviewer_id FK SET NULL', async () => {
    const { qr, calls } = recordingRunner();
    await new InitJobListings1720008100000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "job_listings"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('"status" "job_listing_status" NOT NULL DEFAULT \'draft\'');
    expect(sql).toContain('"reviewer_id" UUID REFERENCES "users" ("id") ON DELETE SET NULL');
  });

  it('up: CHECK khoảng lương hợp lệ và buộc có currency khi có số tiền (không mặc định VND)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitJobListings1720008100000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "job_listings"'))!.sql;
    expect(sql).toContain('chk_job_listing_salary_range');
    expect(sql).toContain('"salary_max" >= "salary_min"');
    expect(sql).toContain('chk_job_listing_salary_needs_currency');
    expect(sql).not.toContain("DEFAULT 'VND'");
  });

  it('up: CHECK draft/pending không được mang reviewer_id/reviewed_at; draft/pending/rejected không được mang published_at', async () => {
    const { qr, calls } = recordingRunner();
    await new InitJobListings1720008100000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "job_listings"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain(
      `CONSTRAINT "chk_job_listing_decision_consistency" CHECK ( "status" NOT IN ('draft','pending') OR ("reviewer_id" IS NULL AND "reviewed_at" IS NULL) )`,
    );
    expect(sql).toContain(
      `CONSTRAINT "chk_job_listing_published_at_consistency" CHECK ( "status" NOT IN ('draft','pending','rejected') OR "published_at" IS NULL )`,
    );
  });

  it('up: có index cho status/expires_at/ward/job_category/employment_type/created_by (lọc công khai + hàng chờ)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitJobListings1720008100000().up(qr);

    const all = sqlOf(calls);
    expect(all).toContain('CREATE INDEX "idx_job_listings_status" ON "job_listings" ("status")');
    expect(all).toContain('CREATE INDEX "idx_job_listings_expires_at" ON "job_listings" ("expires_at")');
    expect(all).toContain('CREATE INDEX "idx_job_listings_ward" ON "job_listings" ("ward")');
    expect(all).toContain('CREATE INDEX "idx_job_listings_job_category" ON "job_listings" ("job_category")');
    expect(all).toContain('CREATE INDEX "idx_job_listings_employment_type" ON "job_listings" ("employment_type")');
    expect(all).toContain('CREATE INDEX "idx_job_listings_created_by" ON "job_listings" ("created_by")');
  });

  it('down: xoá bảng rồi 3 enum type, không chạm bảng/type của module khác', async () => {
    const { qr, calls } = recordingRunner();
    await new InitJobListings1720008100000().down(qr);

    const all = sqlOf(calls);
    expect(all).toContain('DROP TABLE IF EXISTS "job_listings"');
    expect(all).toContain('DROP TYPE IF EXISTS "job_listing_salary_period"');
    expect(all).toContain('DROP TYPE IF EXISTS "job_listing_employment_type"');
    expect(all).toContain('DROP TYPE IF EXISTS "job_listing_status"');
  });
});
