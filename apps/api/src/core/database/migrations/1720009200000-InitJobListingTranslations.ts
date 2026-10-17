import { MigrationInterface, QueryRunner } from 'typeorm';

// Gói C (17/10/2026, phần 1/2 — job_listings trước, real_estate_listings cùng mẫu sau). Owner đã
// chốt: KHÔNG tái dùng `place_translations` (bảng đó gắn chặt với `places`/`wiki_revisions`/
// `supported_locales` — một bộ máy cho một tập field biến đổi theo loại địa điểm; job_listings có
// đúng MỘT schema cố định, không cần granularity theo field hay lịch sử nhiều revision). Bảng này
// là một bản dịch TỐI GIẢN, riêng, theo ĐÚNG khuôn vòng đời draft→pending→published/rejected mà
// job_listings đã có — tái dùng NGUYÊN TẮC (không tái dùng CODE/bảng) theo đúng yêu cầu owner.
//
// Thiết kế có chủ đích KHÁC place_translations:
//   - MỘT ROW/locale cho CẢ 4 trường dịch được (title/description/requirements/benefits) — không
//     field-granular — vì job_listings chỉ có một schema cố định, không cần linh hoạt theo loại.
//   - KHÔNG lưu lịch sử nhiều revision (place_translations giữ full history qua partial-unique-
//     current-index) — một listing chỉ có MỘT bản dịch hiện hành; sửa là UPDATE tại chỗ, không
//     INSERT row mới. Không cần, vì không có yêu cầu "xem lại bản dịch cũ" cho tính năng này.
//   - `locale` cố định 'en' (CHECK) — job_listings chỉ có MỘT nguồn (owner luôn gõ tiếng Việt) và
//     MỘT đích (tiếng Anh), khác hẳn `supported_locales` của places (nhiều nguồn/đích tiềm năng).
//     Giữ cột này (thay vì bỏ hẳn) để không phải đổi schema lớn hơn nếu sau này thật sự cần thêm
//     một locale khác — nhưng KHÔNG xây sẵn bộ máy đa-locale cho một yêu cầu chưa tồn tại.
//   - `source_content_hash`: sha256 của {title,description,requirements,benefits} tiếng Việt TẠI
//     THỜI ĐIỂM bản dịch này được lưu — phát hiện "bản dịch có thể đã lỗi thời" khi nội dung tiếng
//     Việt đổi sau đó (so khớp lại ở service, KHÔNG tự động làm gì — chỉ để UI/API báo rõ, cùng
//     nguyên tắc `source_text_hash` của place_translations).
//   - KHÔNG có cột `published_at` — không hành vi đọc nào cần nó (khác job_listings.published_at,
//     nơi dashboard hiện "xử lý ngày").
export class InitJobListingTranslations1720009200000 implements MigrationInterface {
  name = 'InitJobListingTranslations1720009200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "job_listing_translation_status" AS ENUM ('draft','pending','published','rejected')`);

    await queryRunner.query(`
      CREATE TABLE "job_listing_translations" (
        "id"                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "job_listing_id"       UUID NOT NULL REFERENCES "job_listings" ("id") ON DELETE CASCADE,
        "locale"               VARCHAR(10) NOT NULL,
        "title"                VARCHAR(200),
        "description"          VARCHAR(4000),
        "requirements"         VARCHAR(2000),
        "benefits"             VARCHAR(2000),
        "status"               "job_listing_translation_status" NOT NULL DEFAULT 'draft',
        "review_note"          VARCHAR(1000),
        "reviewer_id"          UUID REFERENCES "users" ("id") ON DELETE SET NULL,
        "reviewed_at"          TIMESTAMPTZ,
        "source_content_hash"  CHAR(64) NOT NULL,
        "created_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        -- Cùng lý do InitJobListings: draft/pending chưa qua quyết định moderator, không mang
        -- reviewer_id/reviewed_at.
        CONSTRAINT "chk_job_listing_translation_decision_consistency" CHECK (
          "status" NOT IN ('draft','pending') OR ("reviewer_id" IS NULL AND "reviewed_at" IS NULL)
        ),
        -- Chỉ 'en' hôm nay — xem ghi chú đầu file về lý do giữ cột mà không xây đa-locale.
        CONSTRAINT "chk_job_listing_translation_locale" CHECK ("locale" = 'en'),
        CONSTRAINT "uq_job_listing_translation_locale" UNIQUE ("job_listing_id", "locale")
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_job_listing_translations_status" ON "job_listing_translations" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "job_listing_translations"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "job_listing_translation_status"`);
  }
}
