import { MigrationInterface, QueryRunner } from 'typeorm';

// content_owner (2026-09-16) — một vai trò hẹp, riêng cho MỘT tài khoản chủ sở hữu nền tảng.
//
// QUYỀN THỰC TẾ GHI NHẬN Ở ĐÂY (audit trực tiếp trên baseline này, KHÔNG mô tả chung chung là
// "kế thừa miễn phí" — kế thừa vẫn là quyền THẬT, có phạm vi cụ thể, phải liệt kê rõ):
//
// Cha DUY NHẤT trong role_parents là `contributor` — KHÔNG `business_manager` (Managed-scope của
// nó không thêm gì một khi đã có `.Any`) và KHÔNG nằm trong nhánh `moderator`/`administrator`
// (`moderator -> contributor, local_guide` là một CẠNH TỪ moderator TỚI contributor, không phải
// ngược lại — content_owner và moderator là hai nhánh con SONG SONG của contributor, không kế
// thừa lẫn nhau theo bất kỳ chiều nào).
//
// Qua `contributor -> member -> guest`, content_owner THỰC SỰ nhận được (đã đối chiếu từng
// migration seed trên baseline này):
//   - Place.Edit.Any / Contact.Edit.Any / Price.Edit.Any (SeedPlacePermissions, cấp cho
//     `contributor`) — QUAN TRỌNG: đây là quyền sửa MỌI địa điểm trong hệ thống, KHÔNG giới hạn ở
//     một cơ sở cụ thể nào — cùng phạm vi `contributor` vốn đã có, không phải quyền hẹp hơn.
//   - Media.Upload.Any (SeedEditorialMediaPermission, cấp cho `contributor`) — tải ảnh cho BẤT KỲ
//     địa điểm nào, không chỉ nơi được giao quản lý.
//   - Source.Create (SeedSourcePermissions, cấp cho `contributor`).
//   - Place.Create, Business.Claim, User.Edit.Own, Category.View, Report.Create, Event.Create,
//     Event.Edit.Own, Booking.View, Booking.Create, Review.Create, Media.Upload.Own (tất cả từ
//     `member`, qua contributor -> member) — quyền mức thành viên thông thường, không đặc biệt.
//   - Place.View, Search.Query, Map.View, User.View (từ `guest`, đáy chuỗi kế thừa).
//
// Cố tình KHÔNG cấp/kế thừa: Role.Assign, User.Ban, hay bất kỳ quyền hạ tầng/quản trị tài khoản
// nào — không role nào trên đường kế thừa content_owner->contributor->member->guest giữ các quyền
// đó (chỉ administrator/super_administrator/moderator giữ Role.Assign/User.Ban, và content_owner
// không nằm trên nhánh đó).
//
// Media.Moderate.Own (ngoại lệ INV-12) và PlaceTranslation.Review.Any (duyệt bản dịch) là hai
// migration RIÊNG tiếp theo — cấp TRỰC TIẾP cho content_owner, KHÔNG kế thừa được từ đâu cả (xem
// ghi chú trong hai migration đó để biết vì sao mỗi permission không "miễn phí" theo bất kỳ nghĩa
// nào — PlaceTranslation.Review.Any đặc biệt: hôm nay CHỈ `moderator` giữ, content_owner không
// nằm trên nhánh kế thừa của moderator nên đây là một NĂNG LỰC MỚI THẬT SỰ, không phải kế thừa).
export class SeedContentOwnerRole1720005700000 implements MigrationInterface {
  name = 'SeedContentOwnerRole1720005700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "roles" ("code","name","description","is_system","is_assignable") VALUES
        ('content_owner','Content Owner','Biên tập nội dung PhuQuocHub, được tự duyệt ảnh của chính mình và tự duyệt bản dịch', true, true)
      ON CONFLICT ("code") DO NOTHING
    `);

    await queryRunner.query(
      `INSERT INTO "role_parents" ("role_id","parent_role_id")
       SELECT c.id, p.id FROM "roles" c, "roles" p
       WHERE c.code = 'content_owner' AND p.code = 'contributor'
       ON CONFLICT ("role_id","parent_role_id") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_parents" WHERE "role_id" = (SELECT id FROM "roles" WHERE code = 'content_owner')`,
    );
    await queryRunner.query(`DELETE FROM "roles" WHERE "code" = 'content_owner'`);
  }
}
