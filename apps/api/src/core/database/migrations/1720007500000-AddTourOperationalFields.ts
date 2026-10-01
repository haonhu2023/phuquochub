import { MigrationInterface, QueryRunner } from 'typeorm';

// Owner Command Center category expansion — 3 field tour còn thiếu hoàn toàn ở mọi tầng (product
// spec, 2026-09-29): điểm đón, bao gồm/không bao gồm, chính sách hủy. Thêm vào place_tour_details
// (satellite 1:1 đã có từ InitTour1720001200000) thay vì bảng mới — đây là thuộc tính vô hướng của
// MỘT tour, không phải danh sách 1:N như tour_stops/tour_schedules.
export class AddTourOperationalFields1720007500000 implements MigrationInterface {
  name = 'AddTourOperationalFields1720007500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "place_tour_details"
        ADD COLUMN "pickup_point" varchar(300),
        ADD COLUMN "inclusions" text,
        ADD COLUMN "exclusions" text,
        ADD COLUMN "cancellation_policy" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "place_tour_details"
        DROP COLUMN IF EXISTS "cancellation_policy",
        DROP COLUMN IF EXISTS "exclusions",
        DROP COLUMN IF EXISTS "inclusions",
        DROP COLUMN IF EXISTS "pickup_point"
    `);
  }
}
