import { MigrationInterface, QueryRunner } from 'typeorm';

// Phát hiện khi rà soát Gói B (2026-09-24): SeedPlaceEditProposalPermissions1720006800000 cấp
// `PlaceEditProposal.Moderate` cho `moderator` — nhưng `content_owner` KHÔNG kế thừa từ
// `moderator` (là role song song với các grant riêng, xem GrantContentOwnerMediaModerationScope's
// own comment đã giải thích đầy đủ lý do không dùng role_parents). Không có migration này,
// content_owner đăng nhập được, xem được `GET /place-edit-proposals` trả 403 — người dùng gửi
// được đề xuất chỉnh sửa nhưng KHÔNG AI có thể xử lý chúng, mâu thuẫn trực tiếp với mục tiêu "owner
// tự vận hành, không chờ người khác kiểm duyệt". Cùng khuôn cấp trực tiếp (không qua kế thừa) đã
// dùng cho mọi quyền content_owner khác.
export class GrantContentOwnerPlaceEditProposalModeration1720006900000 implements MigrationInterface {
  name = 'GrantContentOwnerPlaceEditProposalModeration1720006900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id","permission_id","effect")
       SELECT r.id, p.id, 'allow'
       FROM "roles" r JOIN "permissions" p ON p.code = ANY($2)
       WHERE r.code = $1
       ON CONFLICT ("role_id","permission_id") DO NOTHING`,
      ['content_owner', ['PlaceEditProposal.Moderate']],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions"
       WHERE "role_id" = (SELECT id FROM "roles" WHERE code = 'content_owner')
         AND "permission_id" IN (SELECT id FROM "permissions" WHERE code = ANY($1))`,
      [['PlaceEditProposal.Moderate']],
    );
  }
}
