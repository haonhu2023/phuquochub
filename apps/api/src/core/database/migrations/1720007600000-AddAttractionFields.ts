import { MigrationInterface, QueryRunner } from 'typeorm';

// Owner Command Center category expansion (product spec, 2026-09-29) — "thời lượng tham quan" và
// "quy định" cho điểm tham quan. Attraction KHÔNG có bảng vệ tinh (ADR-002 — xem
// attractions.repository.ts/beaches.repository.ts: "khung nhìn theo danh mục trên chính places"),
// nên hai trường vô hướng này thêm thẳng vào `places`, cùng cách `opening_hours`/`price_range` đã
// làm — nullable, chỉ category='attraction' thực sự điền. Giá vé + điều kiện đối tượng/chiều cao
// KHÔNG cần cột mới: tái dùng price_history.description (đã có, xem PricesController) làm nơi ghi
// điều kiện đi kèm giá, tránh dựng bảng "vé" song song.
export class AddAttractionFields1720007600000 implements MigrationInterface {
  name = 'AddAttractionFields1720007600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "places"
        ADD COLUMN "visit_duration_minutes" int,
        ADD COLUMN "rules" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "places"
        DROP COLUMN IF EXISTS "rules",
        DROP COLUMN IF EXISTS "visit_duration_minutes"
    `);
  }
}
