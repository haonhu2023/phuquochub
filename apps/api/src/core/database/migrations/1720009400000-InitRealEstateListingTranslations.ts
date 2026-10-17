import { MigrationInterface, QueryRunner } from 'typeorm';

// Gói C phần 2/2 (17/10/2026) — bản dịch tiếng Anh cho real_estate_listings, CÙNG thiết kế đã sửa
// cho job_listing_translations sau phản hồi owner (xem InitJobListingTranslations +
// AddJobListingTranslationCasAndSnapshot's ghi chú đầy đủ về lý do — không lặp lại ở đây). Đi
// THẲNG vào bản thiết kế đã đúng ngay từ đầu (một migration, không cần migration vá thêm lần hai):
//   - MỘT row/locale, vùng NHÁP tách biệt vùng ĐÃ DUYỆT (published_*) — lưu nháp/gửi duyệt KHÔNG
//     BAO GIỜ đụng published_* (bản đang công khai không mất khi sửa tiếp).
//   - `content_version` — CAS cùng khuôn `places.content_version` (hand-rolled, KHÔNG
//     TypeORM @VersionColumn).
//   - `locale` cố định 'en' (CHECK) — giữ cột để không phải đổi schema lớn nếu cần thêm locale sau.
//   - 4 trường dịch được (KHÁC job_listings — field thực tế của BĐS): title/description/
//     utilities_note/legal_status_note. KHÔNG dịch address_text (địa chỉ, giữ nguyên), KHÔNG nhân
//     đôi giá/diện tích/liên hệ/toạ độ/hạn đăng/loại giao dịch (owner yêu cầu rõ, dùng CHUNG).
export class InitRealEstateListingTranslations1720009400000 implements MigrationInterface {
  name = 'InitRealEstateListingTranslations1720009400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "real_estate_listing_translation_status" AS ENUM ('draft','pending','published','rejected')`);

    await queryRunner.query(`
      CREATE TABLE "real_estate_listing_translations" (
        "id"                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "real_estate_listing_id"       UUID NOT NULL REFERENCES "real_estate_listings" ("id") ON DELETE CASCADE,
        "locale"                       VARCHAR(10) NOT NULL,
        "title"                        VARCHAR(200),
        "description"                  VARCHAR(4000),
        "utilities_note"               VARCHAR(500),
        "legal_status_note"            VARCHAR(500),
        "status"                       "real_estate_listing_translation_status" NOT NULL DEFAULT 'draft',
        "review_note"                  VARCHAR(1000),
        "reviewer_id"                  UUID REFERENCES "users" ("id") ON DELETE SET NULL,
        "reviewed_at"                  TIMESTAMPTZ,
        "source_content_hash"          CHAR(64) NOT NULL,
        "published_title"              VARCHAR(200),
        "published_description"        VARCHAR(4000),
        "published_utilities_note"     VARCHAR(500),
        "published_legal_status_note"  VARCHAR(500),
        "published_source_content_hash" CHAR(64),
        "published_at"                 TIMESTAMPTZ,
        "content_version"              INTEGER NOT NULL DEFAULT 1,
        "created_at"                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "chk_re_listing_translation_decision_consistency" CHECK (
          "status" NOT IN ('draft','pending') OR ("reviewer_id" IS NULL AND "reviewed_at" IS NULL)
        ),
        CONSTRAINT "chk_re_listing_translation_locale" CHECK ("locale" = 'en'),
        CONSTRAINT "uq_re_listing_translation_locale" UNIQUE ("real_estate_listing_id", "locale")
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_re_listing_translations_status" ON "real_estate_listing_translations" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "real_estate_listing_translations"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "real_estate_listing_translation_status"`);
  }
}
