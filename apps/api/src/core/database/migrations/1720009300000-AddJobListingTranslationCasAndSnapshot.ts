import { MigrationInterface, QueryRunner } from 'typeorm';

// Gói C, sửa thiết kế sau phản hồi owner (17/10/2026) — bản đầu (InitJobListingTranslations) có
// MỘT lỗ hổng thật: lưu draft ghi ĐÈ TRỰC TIẾP lên các cột title/description/requirements/benefits
// — nếu bản dịch đang `published`, một lần lưu nháp sẽ XOÁ MẤT nội dung đang hiện công khai ngay
// lúc đó (status rớt về draft, và chính các cột đó không còn giữ bản đã duyệt). Sửa bằng cách tách
// RÕ hai vùng dữ liệu, cùng khuôn `places.content_version`/`updateScalarsWithCas()` cho CAS (KHÔNG
// dùng TypeORM @VersionColumn — giữ nhất quán với cơ chế CAS hand-rolled đã có trong repo này):
//   - title/description/requirements/benefits + source_content_hash: BẢN NHÁP đang soạn (có thể
//     là draft/pending/rejected) — KHÔNG phải nội dung công khai.
//   - published_title/published_description/published_requirements/published_benefits +
//     published_source_content_hash + published_at: BẢN ĐÃ DUYỆT gần nhất — ĐÂY là nội dung công
//     khai thật sự (đọc công khai giờ kiểm `published_title IS NOT NULL`, KHÔNG kiểm `status`).
//     Chỉ decide() approve mới viết vào nhóm cột này; save()/submit() KHÔNG BAO GIỜ đụng tới —
//     nghĩa là sửa/gửi duyệt lại không ảnh hưởng gì tới bản đang công khai cho tới khi bản MỚI
//     được duyệt.
//   - content_version: CAS — save()/decide() đều dùng `UPDATE ... WHERE id=? AND content_version=?`
//     (cùng `PlacesRepository.updateScalarsWithCas()`), 0 row ảnh hưởng → 409, không ghi đè âm thầm
//     khi hai tab cùng sửa hoặc moderator duyệt trong lúc người đăng sửa.
export class AddJobListingTranslationCasAndSnapshot1720009300000 implements MigrationInterface {
  name = 'AddJobListingTranslationCasAndSnapshot1720009300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_listing_translations"
        ADD COLUMN "content_version" INTEGER NOT NULL DEFAULT 1,
        ADD COLUMN "published_title" VARCHAR(200),
        ADD COLUMN "published_description" VARCHAR(4000),
        ADD COLUMN "published_requirements" VARCHAR(2000),
        ADD COLUMN "published_benefits" VARCHAR(2000),
        ADD COLUMN "published_source_content_hash" CHAR(64),
        ADD COLUMN "published_at" TIMESTAMPTZ
    `);

    // Dữ liệu cũ (nếu có, từ trước migration này): một bản dịch đã `published` dưới thiết kế CŨ có
    // nội dung công khai nằm Ở CHÍNH title/description/requirements/benefits (thiết kế cũ không
    // tách hai vùng) — di chuyển sang published_* để không mất nội dung đang công khai khi nâng cấp
    // từ baseline có dữ liệu thật, cùng nguyên tắc "migration không được âm thầm xoá dữ liệu công
    // khai đang có" áp dụng xuyên toàn repo (ví dụ InitJobListings's down() từ chối xoá có dữ liệu).
    await queryRunner.query(`
      UPDATE "job_listing_translations"
      SET
        "published_title" = "title",
        "published_description" = "description",
        "published_requirements" = "requirements",
        "published_benefits" = "benefits",
        "published_source_content_hash" = "source_content_hash",
        "published_at" = "updated_at"
      WHERE "status" = 'published'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "job_listing_translations"
        DROP COLUMN "content_version",
        DROP COLUMN "published_title",
        DROP COLUMN "published_description",
        DROP COLUMN "published_requirements",
        DROP COLUMN "published_benefits",
        DROP COLUMN "published_source_content_hash",
        DROP COLUMN "published_at"
    `);
  }
}
