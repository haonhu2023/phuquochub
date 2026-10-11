import { MigrationInterface, QueryRunner } from 'typeorm';

// "Chính sách" (mục V đợt 1 mục A) — chính sách huỷ phòng là chính sách duy nhất mọi khách sạn
// đều có và khách cần biết trước khi đặt; các chính sách khác (trẻ em, thú cưng, đặt cọc…) khác
// nhau nhiều giữa cơ sở, không có một bộ trường cấu trúc chung hợp lý ở MVP này — văn bản tự do,
// cùng khuôn `place_tour_details.cancellation_policy` đã có trước. Chỉ thêm cột NULLABLE; không
// backfill — khách sạn cũ hiện "chưa có thông tin", không suy đoán.
// Rollback image: API cũ không đọc cột này nên an toàn; DOWN chỉ gỡ cột này (không chạy trên
// production nếu chưa duyệt).
export class AddHotelCancellationPolicy1720009000000 implements MigrationInterface {
  name = 'AddHotelCancellationPolicy1720009000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "place_hotel_details" ADD COLUMN "cancellation_policy" varchar(1000) NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "place_hotel_details" DROP COLUMN IF EXISTS "cancellation_policy"`);
  }
}
