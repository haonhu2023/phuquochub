import { MigrationInterface, QueryRunner } from 'typeorm';

// Booking Request Foundation — Booking.Create/Booking.View cấp cho `member` (mọi user đã đăng
// ký, auth.service.ts). Cùng khuôn mẫu SeedReviewPermissions/SeedEventPermissions. Booking.View
// KHÔNG mở quyền xem booking của người khác — BookingsService tự đối chiếu customer_user_id,
// permission chỉ cưỡng chế "đã đăng nhập + có quyền xem booking (của chính mình)".
export class SeedBookingPermissions1720002500000 implements MigrationInterface {
  name = 'SeedBookingPermissions1720002500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code","module","action","scope") VALUES
        ('Booking.View','Booking','View',NULL),
        ('Booking.Create','Booking','Create',NULL)
      ON CONFLICT ("code") DO NOTHING
    `);

    await this.grant(queryRunner, 'member', ['Booking.View', 'Booking.Create']);
  }

  private async grant(queryRunner: QueryRunner, roleCode: string, permCodes: string[]): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id","permission_id","effect")
       SELECT r.id, p.id, 'allow'
       FROM "roles" r JOIN "permissions" p ON p.code = ANY($2)
       WHERE r.code = $1
       ON CONFLICT ("role_id","permission_id") DO NOTHING`,
      [roleCode, permCodes],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "permissions" WHERE "code" IN ('Booking.View','Booking.Create')`);
  }
}
