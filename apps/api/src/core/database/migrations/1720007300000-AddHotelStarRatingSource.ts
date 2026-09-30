import { MigrationInterface, QueryRunner } from 'typeorm';

// Owner Command Center category expansion — "hạng sao có nguồn" (product spec, 2026-09-29):
// star_rating tồn tại từ InitHotel1720001000000 nhưng KHÔNG có cách nào ghi lại nó lấy từ đâu.
// Dùng lại `sources` (đã có, polymorphic reference pattern giống price_history.source_id) thay vì
// dựng một hệ nguồn thứ hai — đúng yêu cầu "Tái sử dụng evidence/verified_at hiện hữu ... không
// tạo hệ thống nguồn thứ hai". verified_at riêng (không dùng places.verified_at) vì xác minh hạng
// sao là một sự kiện khác, có thể xảy ra ở thời điểm khác, với ngôi nhà cụ thể — không phải toàn
// bộ place.
export class AddHotelStarRatingSource1720007300000 implements MigrationInterface {
  name = 'AddHotelStarRatingSource1720007300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "place_hotel_details"
        ADD COLUMN "star_rating_source_id" uuid REFERENCES "sources"("id") ON DELETE SET NULL,
        ADD COLUMN "star_rating_verified_at" timestamptz
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "place_hotel_details"
        DROP COLUMN IF EXISTS "star_rating_verified_at",
        DROP COLUMN IF EXISTS "star_rating_source_id"
    `);
  }
}
