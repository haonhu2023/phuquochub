import { MigrationInterface, QueryRunner } from 'typeorm';

// Sprint 2 · B1 — khắc phục drift audit (Prompt 29):
//  D1: chuẩn hóa discriminator đa hình về lowercase snake_case (data-dictionary B-3) —
//      contacts.owner_type / price_history.entity_type ('PLACE'→'place', 'BUSINESS'→'business'…).
//      Idempotent: chỉ đụng hàng chưa lowercase.
//  D3: media index gallery Place khớp dictionary → (place_id, sort_order) WHERE place_id IS NOT NULL.
export class NormalizeDiscriminatorsAndMediaIndex1720000800000 implements MigrationInterface {
  name = 'NormalizeDiscriminatorsAndMediaIndex1720000800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- D1: lowercase discriminators (defensive; an toàn cả khi chưa có dữ liệu) ----
    await queryRunner.query(
      `UPDATE "contacts" SET "owner_type" = lower("owner_type") WHERE "owner_type" <> lower("owner_type")`,
    );
    await queryRunner.query(
      `UPDATE "price_history" SET "entity_type" = lower("entity_type") WHERE "entity_type" <> lower("entity_type")`,
    );

    // ---- D3: media (place_id, sort_order) partial index (thay (place_id) đơn) ----
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_media_place"`);
    await queryRunner.query(
      `CREATE INDEX "idx_media_place" ON "media" ("place_id","sort_order") WHERE "place_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Khôi phục index cũ (chỉ place_id). Không thể suy ngược case gốc của discriminator →
    // dữ liệu giữ nguyên lowercase (an toàn: lowercase là chuẩn hiện hành).
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_media_place"`);
    await queryRunner.query(
      `CREATE INDEX "idx_media_place" ON "media" ("place_id") WHERE "place_id" IS NOT NULL`,
    );
  }
}
