import { MigrationInterface, QueryRunner } from 'typeorm';

// PhuQuocHub owner-operated content role (2026-09-22 launch-readiness pass).
//
// WHY: `content_owner` did not exist anywhere in this codebase (confirmed by grep across
// migrations/entities/services — the only prior mentions were a comment in
// SeedGuideEditPermission1720006100000 stating exactly that, and an unused CLI union type in
// scripts/grant-hotel-media-task-permissions.ts). The site owner had no role that could both
// publish place content AND upload/moderate media: `Media.Upload.Managed` is granted only to
// `business_manager` (and roles that inherit it), which `administrator`/`super_administrator`
// do NOT — this is the confirmed root cause of 0/50 production places having a photo.
//
// DESIGN: a standalone role with permissions granted DIRECTLY (no role_parents inheritance links)
// — deliberately NOT built by inheriting `administrator`/`super_administrator`, which would also
// carry `Role.Assign`, `Permission.Manage`, `User.Ban`, `Search.Reindex`: none of those are
// "content" permissions and granting them would exceed the standing "content administration,
// never user/secret management" boundary this role exists to respect. All ten grants below are
// the ones a person running the website's actual content — places, media, guides, translations —
// needs to never be blocked by a missing role. `PlaceTranslation.Review.Any` and `Guide.Edit.Any`
// are granted with the same scope class SeedPlaceTranslationReviewPermission1720005200000 and
// SeedGuideEditPermission1720006100000 already established.
//
// `SiteContent.Edit` (site-wide hero/contact CMS) is intentionally NOT granted here — that
// permission does not exist until SiteContentSchema, which grants it to `content_owner` itself
// once the permission row exists (avoids a migration referencing a permission code that doesn't
// exist yet at this point in migration order).
//
// Does NOT assign this role to any real user — same precedent as every seed-permission migration
// in this codebase. Assigning it to a specific person (e.g. the owner) is an operational action,
// done by a separate idempotent script, not baked into schema history.
export class SeedContentOwnerRole1720006200000 implements MigrationInterface {
  name = 'SeedContentOwnerRole1720006200000';

  private readonly permissionCodes = [
    'Place.Create',
    'Place.Edit.Any',
    'Place.Approve',
    'Place.Archive',
    'Media.Upload.Managed',
    'Media.Moderate',
    'Contact.Edit.Managed',
    'Price.Edit.Managed',
    'Guide.Edit.Any',
    'PlaceTranslation.Review.Any',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "roles" ("code","name","description","is_system","is_assignable") VALUES
        ('content_owner','Content Owner','Vận hành nội dung: địa điểm, ảnh, cẩm nang, bản dịch — không quản lý người dùng/hệ thống', true, true)
      ON CONFLICT ("code") DO NOTHING
    `);

    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id","permission_id","effect")
       SELECT r.id, p.id, 'allow'
       FROM "roles" r JOIN "permissions" p ON p.code = ANY($2)
       WHERE r.code = $1
       ON CONFLICT ("role_id","permission_id") DO NOTHING`,
      ['content_owner', this.permissionCodes],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Unconditional delete is safe: role_permissions/user_roles rows referencing this role
    // cascade-delete via FK. Reverting only narrows access — this is a purely additive grant.
    await queryRunner.query(`DELETE FROM "roles" WHERE "code" = 'content_owner'`);
  }
}
