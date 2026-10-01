import { MigrationInterface, QueryRunner } from 'typeorm';

// Chuyên mục/tags cẩm nang (2026-09-29). `category` là MỘT Postgres enum thật — KHÔNG dùng bảng
// `categories` hiện có (đó là loại địa điểm: nhà hàng/khách sạn/bãi biển, một khái niệm khác hẳn
// chủ đề bài viết cẩm nang) và KHÔNG dựng một bảng categories thứ hai (khối lượng bài cẩm nang nhỏ,
// tập chủ đề do đội nội dung quản lý là một tập đóng — cùng tiền lệ guide_article_status/
// guide_block_type). `tags` NGƯỢC LẠI là `text[]` tự do — thẻ cần mở rộng không cần migration mỗi
// lần thêm một thẻ mới, khác chuyên mục.
//
// Cả hai cột đều NULLABLE/rỗng-mặc-định: bài cẩm nang cũ (trước migration này) không có chuyên
// mục/thẻ nào — KHÔNG backfill, KHÔNG suy đoán chuyên mục cho bài cũ (đúng nguyên tắc đã áp cho mọi
// migration thêm cột tuỳ chọn trong repo này — vd `licenseType` ở Media, cũng NULL cho dòng cũ).
export class AddGuideArticleCategoryAndTags1720007100000 implements MigrationInterface {
  name = 'AddGuideArticleCategoryAndTags1720007100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "guide_article_category" AS ENUM
        ('kinh_nghiem','am_thuc','luu_tru','di_chuyen','lich_trinh','vui_choi')
    `);
    await queryRunner.query(`
      ALTER TABLE "guide_articles" ADD COLUMN "category" "guide_article_category"
    `);
    await queryRunner.query(`
      ALTER TABLE "guide_articles" ADD COLUMN "tags" text[] NOT NULL DEFAULT '{}'
    `);
    // Lọc công khai theo chuyên mục CHỈ bao giờ chạy trên bài đã published (xem
    // GuideArticlesService.listPublished) — partial index cùng khuôn idx_places_status_active
    // (PLACE-042) và idx_guide_articles_status hiện có, không đánh index cho bản nháp không ai lọc.
    await queryRunner.query(`
      CREATE INDEX "idx_guide_articles_category" ON "guide_articles" ("category")
      WHERE "status" = 'published'
    `);
    // GIN cho lọc theo thẻ (`tags && ARRAY[...]`/`tags @> ARRAY[...]`) — chuẩn Postgres cho mảng.
    await queryRunner.query(`
      CREATE INDEX "idx_guide_articles_tags" ON "guide_articles" USING GIN ("tags")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_guide_articles_tags"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_guide_articles_category"`);
    await queryRunner.query(`ALTER TABLE "guide_articles" DROP COLUMN IF EXISTS "tags"`);
    await queryRunner.query(`ALTER TABLE "guide_articles" DROP COLUMN IF EXISTS "category"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "guide_article_category"`);
  }
}
