import { MigrationInterface, QueryRunner } from 'typeorm';

// MVP gap-analysis (2026-07-25/26) — "Reddit" pillar (docs/overview/vision.md) had zero
// backend/frontend surface. Bảng `reviews` đã có sẵn trong prisma/schema.prisma (nguồn thiết
// kế) nhưng chưa từng được migrate — file này hiện thực hoá đúng thiết kế đó.
// review_status: pending/published/hidden khớp ReviewStatus (schema.prisma:129). MVP hiện tại
// chưa có hàng đợi kiểm duyệt (đó là hạng mục Medium riêng) nên ứng dụng LUÔN ghi 'published'
// khi tạo — 'pending'/'hidden' giữ chỗ cho một moderation flow sau này dùng trực tiếp cột này,
// không cần đổi schema.
export class InitReviews1720002000000 implements MigrationInterface {
  name = 'InitReviews1720002000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "review_status" AS ENUM ('pending','published','hidden')`);

    await queryRunner.query(`
      CREATE TABLE "reviews" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "place_id" uuid NOT NULL REFERENCES "places"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "rating" smallint NOT NULL,
        "content" text,
        "status" "review_status" NOT NULL DEFAULT 'pending',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_reviews_rating" CHECK ("rating" BETWEEN 1 AND 5)
      )
    `);
    // "mỗi người 1 review / địa điểm" (schema.prisma:838).
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_reviews_place_user" ON "reviews" ("place_id","user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_reviews_place_status" ON "reviews" ("place_id","status")`,
    );

    // media.review_id đã tồn tại từ trước (nhánh arc, media.entity.ts:29) nhưng chưa có FK vì
    // bảng đích chưa tồn tại — cùng khuôn mẫu đã dùng cho media.event_id ở InitEvent.
    await queryRunner.query(
      `ALTER TABLE "media" ADD CONSTRAINT "fk_media_review" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "media" DROP CONSTRAINT IF EXISTS "fk_media_review"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reviews"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "review_status"`);
  }
}
