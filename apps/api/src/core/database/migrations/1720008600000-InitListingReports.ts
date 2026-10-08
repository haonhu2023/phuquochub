import { MigrationInterface, QueryRunner } from 'typeorm';

// "Báo sai/báo trùng" (mục V đợt 3/đợt 4, mục VII "Tái sử dụng... báo sai") — MỘT hạ tầng mới,
// KHÔNG tái dùng `reports`/`moderation_cases`: `ModerationTargetType` (moderation.enums.ts) tự ghi
// rõ "ĐỦ 3 loại đã đăng ký FSM-hoặc-dự-trù trong ADR-018 §D9/MR-4" (review/media/place) — một tập
// ĐÃ CHỐT theo ADR, mở rộng là sửa ADR chứ không phải patch nhỏ (xem docs §13v). Thay vào đó, dùng
// ĐÚNG mẫu vừa xây cho `saved_items`: bảng polymorphic mới, nhẹ, không claim/assign/multi-reason-
// theo-content-type như ModerationCase — nhu cầu thật ở đây chỉ là "người dùng gắn cờ một tin, một
// moderator đã có sẵn quyền duyệt tin đó xem và xử lý qua CHÍNH luồng decide()/close() hiện có của
// job_listings/real_estate_listings", không cần một vòng đời case riêng.
//
// Đổi tên "saved_item_target_type" → "listable_target_type": enum đó vốn đã đúng đăng ký 2 loại
// entity cần cho CẢ saved_items LẪN listing_reports — tách thành một registry dùng chung khi xuất
// hiện consumer thứ hai (xem common/listable-target-type.enum.ts), thay vì tạo một enum trùng giá
// trị thứ hai. An toàn đổi tên: chưa có dữ liệu thật nào trên production phụ thuộc tên type này.
export class InitListingReports1720008600000 implements MigrationInterface {
  name = 'InitListingReports1720008600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "saved_item_target_type" RENAME TO "listable_target_type"`);

    await queryRunner.query(`CREATE TYPE "listing_report_reason" AS ENUM ('wrong_info', 'duplicate', 'spam', 'scam', 'other')`);
    await queryRunner.query(`CREATE TYPE "listing_report_status" AS ENUM ('open', 'resolved', 'dismissed')`);

    await queryRunner.query(`
      CREATE TABLE "listing_reports" (
        "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "reporter_id" UUID NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
        "target_type" "listable_target_type" NOT NULL,
        "target_id"   UUID NOT NULL,
        "reason"      "listing_report_reason" NOT NULL,
        "description" VARCHAR(1000),
        "status"      "listing_report_status" NOT NULL DEFAULT 'open',
        "resolver_id" UUID REFERENCES "users" ("id") ON DELETE SET NULL,
        "resolved_at" TIMESTAMPTZ,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "chk_listing_report_resolution_consistency" CHECK (
          "status" = 'open' OR ("resolver_id" IS NOT NULL AND "resolved_at" IS NOT NULL)
        )
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_listing_reports_target" ON "listing_reports" ("target_type", "target_id")`);
    // Truy vấn chính của hàng chờ moderator: báo cáo đang mở, theo loại (quyền Moderate tách theo
    // module — xem ListingReportsService's comment).
    await queryRunner.query(`CREATE INDEX "idx_listing_reports_status_target_type" ON "listing_reports" ("status", "target_type")`);
    await queryRunner.query(`CREATE INDEX "idx_listing_reports_reporter_id" ON "listing_reports" ("reporter_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "listing_reports"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "listing_report_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "listing_report_reason"`);
    await queryRunner.query(`ALTER TYPE "listable_target_type" RENAME TO "saved_item_target_type"`);
  }
}
