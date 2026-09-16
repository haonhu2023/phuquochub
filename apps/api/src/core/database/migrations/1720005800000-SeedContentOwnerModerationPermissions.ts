import { MigrationInterface, QueryRunner } from 'typeorm';

// content_owner self-approve/self-publish permissions (2026-09-16) — hai permission THẬT, hẹp,
// cấp TRỰC TIẾP cho content_owner. Cả hai KHÔNG kế thừa được từ đâu (xem SeedContentOwnerRole) —
// đây là năng lực TĂNG THÊM thực sự, không phải một phần của "kế thừa qua contributor".
//
// 1) Media.Moderate.Own — ngoại lệ CÓ KIỂM SOÁT cho INV-12 ("không ai được tự kiểm duyệt nội dung
//    của chính mình", moderation.service.ts). AN TOÀN QUAN TRỌNG (xác minh trực tiếp qua
//    authorization.util.spec.ts kiểu tương tự): `Media.Moderate` (không hậu tố, cái mà `moderator`
//    giữ) có rank "any" trong SCOPE_RANK, nên `grantSatisfies('Media.Moderate', 'Media.Moderate.Own')`
//    trả về TRUE — nghĩa là nếu moderation.service.ts kiểm tra permission này qua
//    `authz.can()`/`grantSatisfies` (đường thoả mãn theo BẬC), MỌI moderator/administrator/
//    super_administrator (và `'*'`) sẽ vô tình được tự duyệt — ngược lại hoàn toàn mục đích của
//    permission này. moderation.service.ts vì vậy PHẢI so khớp CHUỖI CHÍNH XÁC trên allow-list
//    (xem canSelfApproveOwnMedia()), không được dùng grantSatisfies cho permission này.
//
// 2) PlaceTranslation.Review.Any — CÙNG permission mà `moderator` đang giữ (SeedPlaceTranslation
//    ReviewPermission, human-translation-review 2026-09-04), cấp THÊM cho content_owner qua một
//    role_permissions RIÊNG (không sửa migration gốc, không đổi vai trò moderator giữ nó qua đâu).
//    KHÔNG có biến thể `.Own` cho quyền này trong hệ thống hôm nay, và
//    TranslationReviewService.reviewTranslation() KHÔNG có kiểm tra "không tự duyệt bản dịch của
//    chính mình" nào tồn tại từ trước (đã đọc trực tiếp source để xác nhận) — nghĩa là quyền này
//    là một cấp phát THÔNG THƯỜNG (không phải một ngoại lệ né một lệnh cấm như Media.Moderate.Own),
//    nhưng vẫn PHẢI liệt kê rõ ràng: content_owner qua đây có thể duyệt BẤT KỲ bản dịch nào đang
//    chờ, không chỉ bản dịch content_owner tự tạo — đúng những gì owner yêu cầu ("duyệt và công
//    khai nội dung của PhuQuocHub"), nhưng là một quyền RỘNG, không nên mô tả nhầm là hẹp.
export class SeedContentOwnerModerationPermissions1720005800000 implements MigrationInterface {
  name = 'SeedContentOwnerModerationPermissions1720005800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code","module","action","scope") VALUES
        ('Media.Moderate.Own','Media','Moderate','Own')
      ON CONFLICT ("code") DO NOTHING
    `);

    await this.grant(queryRunner, 'content_owner', ['Media.Moderate.Own']);
    // PlaceTranslation.Review.Any already exists (SeedPlaceTranslationReviewPermission) — only the
    // grant row to content_owner is new here, the permission itself is not re-inserted.
    await this.grant(queryRunner, 'content_owner', ['PlaceTranslation.Review.Any']);
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
    await queryRunner.query(`
      DELETE FROM "role_permissions" WHERE "role_id" = (SELECT id FROM "roles" WHERE code = 'content_owner')
        AND "permission_id" = (SELECT id FROM "permissions" WHERE code = 'PlaceTranslation.Review.Any')
    `);
    await queryRunner.query(`DELETE FROM "permissions" WHERE "code" = 'Media.Moderate.Own'`);
  }
}
