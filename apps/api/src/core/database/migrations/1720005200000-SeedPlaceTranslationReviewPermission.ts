import { MigrationInterface, QueryRunner } from 'typeorm';

// Human Translation Review workflow (2026-09-04). Seeds the ONE permission the new review
// endpoint (POST /admin/place-translations/:id/review) requires: `PlaceTranslation.Review.Any`.
//
// GRANTED TO `moderator` ONLY, not administrator/super_administrator directly — role_parents
// (moderator -> administrator -> super_administrator, SeedRbac) already carries every moderator
// grant upward, same inheritance precedent as SeedEditorialMediaPermission's grant to
// `contributor`. `moderator` ("Kiểm duyệt nội dung") is the correct home: reviewing a translation
// before it becomes public is content moderation, not a separate capability class.
//
// Scope `Any` (not `.Own`/`.Managed`): a translation is not owned/managed by the reviewing user in
// any ADR-019 sense — there is no resource-identity check to perform here, matching the same
// context-free scope class as `Moderation.Queue.View`.
//
// Does NOT assign this role to any real user — same precedent as every other seed-permission
// migration in this codebase (see SeedEditorialMediaPermission's own note): a migration cannot know
// who the real reviewer is, and hardcoding a specific user id would not reproduce across
// environments. Granting a real reviewer this capability is a separate, explicit operator action
// (npm run operator:bootstrap / Role.Assign), never done implicitly by this migration.
export class SeedPlaceTranslationReviewPermission1720005200000 implements MigrationInterface {
  name = 'SeedPlaceTranslationReviewPermission1720005200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code","module","action","scope") VALUES
        ('PlaceTranslation.Review.Any','PlaceTranslation','Review','Any')
      ON CONFLICT ("code") DO NOTHING
    `);

    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id","permission_id","effect")
       SELECT r.id, p.id, 'allow'
       FROM "roles" r JOIN "permissions" p ON p.code = 'PlaceTranslation.Review.Any'
       WHERE r.code = 'moderator'
       ON CONFLICT ("role_id","permission_id") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Unconditional delete is safe: this is an ADDITIVE grant, removing it only narrows access
    // (never widens), and user_roles points at ROLE not permission — no user assignment is lost.
    // role_permissions rows referencing this permission cascade-delete via FK, same behavior as
    // every other seed-permission migration's down().
    await queryRunner.query(`DELETE FROM "permissions" WHERE "code" = 'PlaceTranslation.Review.Any'`);
  }
}
