import { InitListingReports1720008600000 } from '../1720008600000-InitListingReports';
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

describe('InitListingReports migration', () => {
  it('up: đổi tên saved_item_target_type → listable_target_type TRƯỚC khi tạo bảng listing_reports (thứ tự quan trọng — bảng mới dùng type đã đổi tên)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitListingReports1720008600000().up(qr);

    const renameIndex = calls.findIndex((c) => c.sql.includes('RENAME TO "listable_target_type"'));
    const createTableIndex = calls.findIndex((c) => c.sql.includes('CREATE TABLE "listing_reports"'));
    expect(renameIndex).toBeGreaterThanOrEqual(0);
    expect(createTableIndex).toBeGreaterThan(renameIndex);
  });

  it('up: tạo 2 enum type mới (reason/status) + bảng listing_reports dùng type đã đổi tên', async () => {
    const { qr, calls } = recordingRunner();
    await new InitListingReports1720008600000().up(qr);

    const all = sqlOf(calls);
    expect(all).toContain(`CREATE TYPE "listing_report_reason" AS ENUM ('wrong_info', 'duplicate', 'spam', 'scam', 'other')`);
    expect(all).toContain(`CREATE TYPE "listing_report_status" AS ENUM ('open', 'resolved', 'dismissed')`);
    expect(all).toContain('CREATE TABLE "listing_reports"');

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "listing_reports"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('"target_type" "listable_target_type" NOT NULL');
  });

  it('up: reporter_id FK CASCADE, target_id KHÔNG FK cứng (đa hình), resolver_id FK SET NULL', async () => {
    const { qr, calls } = recordingRunner();
    await new InitListingReports1720008600000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "listing_reports"'))!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain('"reporter_id" UUID NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE');
    expect(sql).toContain('"resolver_id" UUID REFERENCES "users" ("id") ON DELETE SET NULL');
    expect(sql).not.toMatch(/"target_id"[^,]*REFERENCES/);
  });

  it('up: CHECK status=open HOẶC có đủ resolver_id/resolved_at (không "đã xử lý" mà thiếu ai xử lý)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitListingReports1720008600000().up(qr);

    const sql = calls.find((c) => c.sql.includes('CREATE TABLE "listing_reports"'))!.sql;
    expect(sql).toContain('chk_listing_report_resolution_consistency');
  });

  it('up: có index cho (target_type,target_id), (status,target_type) và reporter_id', async () => {
    const { qr, calls } = recordingRunner();
    await new InitListingReports1720008600000().up(qr);

    const all = sqlOf(calls);
    expect(all).toContain('CREATE INDEX "idx_listing_reports_target" ON "listing_reports" ("target_type", "target_id")');
    expect(all).toContain('CREATE INDEX "idx_listing_reports_status_target_type" ON "listing_reports" ("status", "target_type")');
    expect(all).toContain('CREATE INDEX "idx_listing_reports_reporter_id" ON "listing_reports" ("reporter_id")');
  });

  it('down: xoá bảng + 2 enum type MỚI rồi đổi tên type dùng chung TRỞ LẠI tên cũ (không DROP type đó — saved_items vẫn cần nó)', async () => {
    const { qr, calls } = recordingRunner();
    await new InitListingReports1720008600000().down(qr);

    const all = sqlOf(calls);
    expect(all).toContain('DROP TABLE IF EXISTS "listing_reports"');
    expect(all).toContain('DROP TYPE IF EXISTS "listing_report_status"');
    expect(all).toContain('DROP TYPE IF EXISTS "listing_report_reason"');
    expect(all).toContain('ALTER TYPE "listable_target_type" RENAME TO "saved_item_target_type"');
    expect(all).not.toContain('DROP TYPE IF EXISTS "listable_target_type"');
  });
});
