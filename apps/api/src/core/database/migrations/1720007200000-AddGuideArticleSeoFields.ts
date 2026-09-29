import { MigrationInterface, QueryRunner } from 'typeorm';

// SEO riêng cho cẩm nang (2026-09-29) — `meta_title`/`meta_description` THẬT, không phải suy ra
// từ `title`/`intro` ở tầng render như trước (SerpPreview trong editor trước bản này chỉ minh hoạ
// title/intro, KHÔNG có gì để lưu/gửi lên API khác đi — "SEO riêng" chưa tồn tại). Cả hai NULLABLE:
// khi trống, tầng render (generateMetadata) lùi về title/intro — fallback sống ở PRESENTATION layer,
// không phải ở migration/entity (cùng khuôn `metaDescription()` helper places/[slug]/page.tsx đã
// dùng cho Place, nơi field seo_description riêng "chưa được API expose" — bản này thì CÓ, đầy đủ
// storage+API+render, không chỉ một cột nằm im).
//
// Độ dài cột (160/320) khớp CHÍNH XÁC PlaceSeo.metaTitle/metaDescription (place-seo.entity.ts) —
// tái dùng giới hạn đã có, không tự đặt số riêng cho cùng một khái niệm.
//
// KHÔNG dựng bảng `guide_article_seo` riêng như `place_seo` (1-1 join table): khối lượng SEO cần
// cho cẩm nang ở milestone này chỉ có hai trường, thêm thẳng vào `guide_articles` đơn giản hơn một
// bảng phụ chỉ có 2 cột thật dụng — cùng lý do `category`/`tags` (migration liền trước) không dựng
// bảng riêng.
export class AddGuideArticleSeoFields1720007200000 implements MigrationInterface {
  name = 'AddGuideArticleSeoFields1720007200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "guide_articles" ADD COLUMN "meta_title" varchar(160)`);
    await queryRunner.query(`ALTER TABLE "guide_articles" ADD COLUMN "meta_description" varchar(320)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "guide_articles" DROP COLUMN IF EXISTS "meta_description"`);
    await queryRunner.query(`ALTER TABLE "guide_articles" DROP COLUMN IF EXISTS "meta_title"`);
  }
}
