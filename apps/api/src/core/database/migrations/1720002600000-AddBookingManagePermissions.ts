import { MigrationInterface, QueryRunner } from 'typeorm';

// Booking Application Layer (Phase 2) — booking.md §7 đã ghi rõ: "Admin/staff xem booking người
// khác — chưa có scope/permission nào cho việc này". Migration này thêm đúng 4 permission cho
// đúng việc đó + 3 hành động chuyển trạng thái (mục A/B của yêu cầu Phase 2), cùng khuôn
// SeedBookingPermissions1720002500000 (Booking.View/Booking.Create).
//
// Gán cho `moderator` — KHÔNG gán cho `business_manager`/`business_owner`: business_claims/
// business_members CHƯA migrate (0 bảng DB sống, booking.md §2.3), nên không có cách nào cưỡng
// chế "chỉ xem/sửa booking CỦA CHÍNH cơ sở mình" ở slice này — gán cho role kinh doanh sẽ là lỗ
// hổng cho phép một business_manager quản lý booking của cơ sở KHÁC. `administrator`/
// `super_administrator` tự động kế thừa qua role DAG (moderator -> administrator ->
// super_administrator, xem SeedRbac1720000300000's `link()` calls) — không cần gán lặp lại.
export class AddBookingManagePermissions1720002600000 implements MigrationInterface {
  name = 'AddBookingManagePermissions1720002600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code","module","action","scope") VALUES
        ('Booking.List','Booking','List',NULL),
        ('Booking.Confirm','Booking','Confirm',NULL),
        ('Booking.Cancel','Booking','Cancel',NULL),
        ('Booking.MarkExpired','Booking','MarkExpired',NULL)
      ON CONFLICT ("code") DO NOTHING
    `);

    await this.grant(queryRunner, 'moderator', [
      'Booking.List',
      'Booking.Confirm',
      'Booking.Cancel',
      'Booking.MarkExpired',
    ]);
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
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "code" IN ('Booking.List','Booking.Confirm','Booking.Cancel','Booking.MarkExpired')`,
    );
  }
}
