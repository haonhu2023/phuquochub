import { MigrationInterface, QueryRunner } from 'typeorm';

// Điểm tiếp cận/đường vào của khách sạn (cùng khuôn place_beach_details.access_route). Chỉ thêm cột NULLABLE;
// không backfill — khách sạn cũ hiện "chưa có thông tin", không suy đoán từ địa chỉ.
// Rollback image: API cũ không đọc cột này nên an toàn; DOWN chỉ gỡ cột này (không chạy trên production nếu chưa duyệt).
export class AddHotelAccessRoute1720008000000 implements MigrationInterface {
  name = 'AddHotelAccessRoute1720008000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "place_hotel_details" ADD COLUMN "access_route" varchar(300) NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "place_hotel_details" DROP COLUMN IF EXISTS "access_route"`);
  }
}
