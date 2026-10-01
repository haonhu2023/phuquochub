import { MigrationInterface, QueryRunner } from 'typeorm';

// Owner Command Center category expansion — "món nổi bật" (product spec, 2026-09-29): cờ đơn giản
// trên món ăn đã có sẵn (restaurant_menu_items, InitRestaurant1720001100000), không cần bảng mới —
// đúng nguyên tắc tái dùng ID/mô hình hiện có, không xây thêm một khái niệm "món ăn" song song.
export class AddRestaurantMenuItemSignature1720007400000 implements MigrationInterface {
  name = 'AddRestaurantMenuItemSignature1720007400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "restaurant_menu_items"
        ADD COLUMN "is_signature" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "restaurant_menu_items" DROP COLUMN IF EXISTS "is_signature"
    `);
  }
}
