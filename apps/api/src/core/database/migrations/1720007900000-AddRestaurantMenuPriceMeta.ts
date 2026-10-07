import { MigrationInterface, QueryRunner } from 'typeorm';

// Đơn vị, ngày ghi nhận và nguồn cho GIÁ MÓN nhà hàng (quyết định sản phẩm 07/10/2026).
// Chỉ thêm cột NULLABLE; không backfill — bản ghi cũ giữ đơn vị/ngày/nguồn = NULL (nghĩa là "chưa rõ",
// KHÔNG suy đoán). `currency` đã có sẵn (NOT NULL DEFAULT 'VND') và không đổi.
// Ràng buộc: ngày ghi nhận chỉ có khi có giá; đơn vị nếu có phải không rỗng.
// Rollback: DOWN chỉ gỡ ba cột/ràng buộc mới này — không đụng price/currency/name. KHÔNG chạy DOWN trên
// production để "rollback image" (image cũ không đọc các cột này nên không cần DOWN để chạy).
export class AddRestaurantMenuPriceMeta1720007900000 implements MigrationInterface {
  name = 'AddRestaurantMenuPriceMeta1720007900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "restaurant_menu_items"
        ADD COLUMN "price_unit" varchar(40) NULL,
        ADD COLUMN "price_recorded_on" date NULL,
        ADD COLUMN "price_source_id" uuid NULL REFERENCES "sources"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "restaurant_menu_items"
        ADD CONSTRAINT "chk_menu_item_price_date_needs_price"
          CHECK ("price_recorded_on" IS NULL OR "price" IS NOT NULL),
        ADD CONSTRAINT "chk_menu_item_price_unit_nonblank"
          CHECK ("price_unit" IS NULL OR btrim("price_unit") <> '')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "restaurant_menu_items"
        DROP CONSTRAINT IF EXISTS "chk_menu_item_price_unit_nonblank",
        DROP CONSTRAINT IF EXISTS "chk_menu_item_price_date_needs_price"
    `);
    await queryRunner.query(`
      ALTER TABLE "restaurant_menu_items"
        DROP COLUMN IF EXISTS "price_source_id",
        DROP COLUMN IF EXISTS "price_recorded_on",
        DROP COLUMN IF EXISTS "price_unit"
    `);
  }
}
