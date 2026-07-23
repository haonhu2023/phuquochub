import { MigrationInterface, QueryRunner } from 'typeorm';

// GAP-06 (PLACE-003) — bổ sung index còn thiếu so với SSOT: places.md §3 quy định
// `BTREE (status) WHERE deleted_at IS NULL`, nhưng InitPlaces1720000400000 chỉ tạo
// uq_places_slug / idx_places_category_status / idx_places_location (GIST) / idx_places_fts.
//
// Vì sao idx_places_category_status KHÔNG thay thế được: cột dẫn đầu là category_id, nên
// truy vấn lọc theo status mà không có category (PlacesRepository.list() khi bỏ trống
// `category` — đường công khai mặc định `status = 'published' AND deleted_at IS NULL`)
// không dùng được index đó.
//
// Partial WHERE theo đúng quy ước sẵn có trong repo (idx_media_place, uq_contacts_primary).
// KHÔNG dùng CREATE INDEX CONCURRENTLY: data-source.ts không đặt migrationsTransactionMode
// nên TypeORM bọc mỗi migration trong một transaction, và CONCURRENTLY không chạy được
// trong transaction. Đổi cấu hình đó là thay đổi toàn cục, ngoài phạm vi PLACE-003.
export class AddPlacesStatusPartialIndex1720001900000 implements MigrationInterface {
  name = 'AddPlacesStatusPartialIndex1720001900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "idx_places_status_active" ON "places" ("status") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Chỉ gỡ index do migration này tạo — không đụng index nào khác của places.
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_places_status_active"`);
  }
}
