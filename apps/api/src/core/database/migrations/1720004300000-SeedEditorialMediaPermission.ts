import { MigrationInterface, QueryRunner } from 'typeorm';

// Operator Bootstrap & Editorial Place Content (2026-08-12). Adds the ONE permission missing from
// the editorial capability set: `Media.Upload.Any`.
//
// VÌ SAO CHỈ MỘT PERMISSION: vai trò `contributor` ("Biên tập viên dữ liệu", SeedRbac) ĐÃ có sẵn
// `Place.Edit.Any`, `Contact.Edit.Any` và `Price.Edit.Any` (SeedPlacePermissions) — tức là mô hình
// "biên tập viên tin cậy sửa được MỌI địa điểm, kể cả địa điểm chưa ai nhận" ĐÃ tồn tại trong RBAC
// từ trước và đã chạy qua PDP thật. Chỉ riêng ẢNH là chưa: `media` chỉ có `Media.Upload.Own`
// (member — ảnh của chính mình) và `Media.Upload.Managed` (business_manager — ảnh của cơ sở mình
// quản lý). Không có bậc `.Any`, nên đội vận hành KHÔNG thể thêm ảnh cho 49 địa điểm seed.
//
// KHÔNG cần sửa guard/controller/resolver nào: `authorization.util.ts` đã định nghĩa
// `Any ⊃ Managed ⊃ Own` (SCOPE_RANK), nên một grant `Media.Upload.Any` (rank 3) tự thoả mãn
// `@RequirePermissions('Media.Upload.Managed')` (rank 2) sẵn có trên place-media.controller.ts, và
// `evaluateScopedAccess()` xếp nó vào nhánh context-free (bước 3) nên KHÔNG phải phân giải tư cách
// thành viên cơ sở. Đây đúng là cơ chế ADR-019 đã thiết kế cho scope Any — không phải lối tắt mới.
//
// CẤP CHO `contributor`, KHÔNG cấp cho administrator/moderator trực tiếp: đó là vai trò biên tập
// đúng nghĩa và đã giữ ba `.Any` còn lại — cấp ở đây giữ trọn bộ năng lực biên tập trên MỘT vai
// trò, thay vì rải rác. Đồ thị kế thừa (role_parents, chiều con → cha ở
// UserRolesRepository.getScopedGrants) đưa quyền này tới ĐÚNG: contributor, moderator,
// administrator, super_administrator. KHÔNG chạm tới member, local_guide, guest, business_owner,
// business_manager, ai_agent — có test hồi quy chứng minh từng vai trò một.
//
// KHÔNG gán vai trò cho người dùng thật ở đây (migration không biết ai là operator, và một
// migration gán user cụ thể sẽ không tái lập được giữa các môi trường) — đó là việc của
// `npm run operator:bootstrap`, xem apps/api/src/scripts/bootstrap-operator.ts.
export class SeedEditorialMediaPermission1720004300000 implements MigrationInterface {
  name = 'SeedEditorialMediaPermission1720004300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code","module","action","scope") VALUES
        ('Media.Upload.Any','Media','Upload','Any')
      ON CONFLICT ("code") DO NOTHING
    `);

    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id","permission_id","effect")
       SELECT r.id, p.id, 'allow'
       FROM "roles" r JOIN "permissions" p ON p.code = ANY($2)
       WHERE r.code = $1
       ON CONFLICT ("role_id","permission_id") DO NOTHING`,
      ['contributor', ['Media.Upload.Any']],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Xoá permission kéo theo role_permissions qua FK CASCADE (cùng hành vi
    // SeedMediaPermissions.down()). An toàn vô điều kiện: đây là quyền CẤP THÊM, gỡ nó chỉ thu hẹp
    // quyền chứ không bao giờ mở rộng, và không có dữ liệu người dùng nào phụ thuộc vào nó —
    // `user_roles` trỏ tới ROLE, không tới permission, nên operator đã bootstrap vẫn giữ nguyên vai
    // trò (chỉ mất khả năng đăng ảnh biên tập, đúng nghĩa "quay lại trạng thái trước milestone").
    await queryRunner.query(`DELETE FROM "permissions" WHERE "code" = 'Media.Upload.Any'`);
  }
}
