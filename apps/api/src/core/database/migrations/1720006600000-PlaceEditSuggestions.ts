import { MigrationInterface, QueryRunner } from 'typeorm';

// "Báo thông tin sai / Đề xuất chỉnh sửa" — bản tối thiểu (2026-09-24, Ưu tiên 3).
//
// KHÔNG seed permission nào mới: gửi đề xuất dùng `Report.Create` ĐÃ CÓ SẴN (SeedModerationPermissions
// 1720003300000, cấp cho `member` — mọi tài khoản đã đăng nhập, cùng permission `/reviews/:id/report`
// đang dùng); xem/quyết định tái sử dụng NGUYÊN scoped-authorization đã có (Place.Approve toàn cục
// HOẶC Place.Edit.Managed khoanh vùng theo place_id — y hệt
// OwnerDecisionQueueService.assertResolutionAccess()). Vì vậy bảng này không cần đụng
// `permissions`/`role_permissions`.
export class PlaceEditSuggestions1720006600000 implements MigrationInterface {
  name = 'PlaceEditSuggestions1720006600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "place_edit_suggestions" (
        "id"              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        "place_id"        uuid        NOT NULL REFERENCES "places"("id") ON DELETE CASCADE,
        "field"           varchar(60) NOT NULL,
        "current_value"   text,
        "proposed_value"  text        NOT NULL,
        "source_url"      varchar(500) NOT NULL,
        "source_note"     text,
        "submitted_by"    uuid        NOT NULL REFERENCES "users"("id"),
        "status"          varchar(20) NOT NULL DEFAULT 'pending',
        "reviewed_by"     uuid        REFERENCES "users"("id"),
        "reviewed_at"     timestamptz,
        "review_note"     text,
        "created_at"      timestamptz NOT NULL DEFAULT now(),
        "updated_at"      timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      COMMENT ON TABLE "place_edit_suggestions"
        IS 'User-submitted "report incorrect info / suggest an edit" — one field of one place per row, with a source. status: pending | applied | rejected. NEVER auto-written into places; applied means an owner manually edited via the existing CAS editors and marked this resolved.'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_place_suggestions_place_pending"
        ON "place_edit_suggestions" ("place_id")
        WHERE "status" = 'pending'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_place_suggestions_status"
        ON "place_edit_suggestions" ("status", "created_at")
        WHERE "status" = 'pending'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "place_edit_suggestions"`);
  }
}
