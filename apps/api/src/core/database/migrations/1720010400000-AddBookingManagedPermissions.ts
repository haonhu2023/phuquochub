import { MigrationInterface, QueryRunner } from 'typeorm';

// Giai đoạn 3 (chiến lược data-hub, strategy-data-hub-2026-10-21.md §Giai đoạn 3) — nối "đặt chỗ"
// vào web cho CHỦ CƠ SỞ ĐÃ XÁC MINH. `business_claims`/`business_members` (InitBusinessClaims,
// 1720003600000) đã migrate TỪ LÂU, nên lý do "chưa có bảng ownership" ghi trong
// AddBookingManagePermissions1720002600000/SeedAvailabilityPermissions1720002800000 (gán
// Booking.List/Confirm/Cancel/MarkExpired + Availability.* chỉ cho `moderator`) nay đã lỗi thời —
// đây là migration đóng đúng khoảng trống đó, KHÔNG đụng gì vào các permission cũ.
//
// Seed BA permission CÓ hậu tố `.Managed` (ADR-019 D6) — đúng khuôn SeedPlacePermissions
// (Place.Edit.Managed/Contact.Edit.Managed/...): grant cho `business_manager`, kế thừa lên
// `business_owner` qua role DAG (SeedRbac: business_owner -> business_manager -> member) — nhân sự
// vận hành cơ sở (lễ tân/quản lý) xử lý booking hàng ngày được, không chỉ riêng chủ sở hữu.
//
// KHÔNG đổi permission `Booking.MarkExpired` — nằm ngoài phạm vi Giai đoạn 3 (hết hạn vẫn là hành
// vi hệ thống/moderator, chưa phải thao tác chủ cơ sở cần trong MVP này).
export class AddBookingManagedPermissions1720010400000 implements MigrationInterface {
  name = 'AddBookingManagedPermissions1720010400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code","module","action","scope") VALUES
        ('Booking.List.Managed','Booking','List','Managed'),
        ('Booking.Confirm.Managed','Booking','Confirm','Managed'),
        ('Booking.Cancel.Managed','Booking','Cancel','Managed')
      ON CONFLICT ("code") DO NOTHING
    `);

    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id","permission_id","effect")
       SELECT r.id, p.id, 'allow'
       FROM "roles" r JOIN "permissions" p
         ON p.code IN ('Booking.List.Managed','Booking.Confirm.Managed','Booking.Cancel.Managed')
       WHERE r.code = 'business_manager'
       ON CONFLICT ("role_id","permission_id") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "code" IN ('Booking.List.Managed','Booking.Confirm.Managed','Booking.Cancel.Managed')`,
    );
  }
}
