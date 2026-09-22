import { MigrationInterface, QueryRunner } from 'typeorm';

// Phú Quốc Guide CMS candidate (2026-09-18). Seeds the ONE permission every guide-article write
// endpoint requires: `Guide.Edit.Any` — covers create/edit/publish/unpublish (single permission
// for the whole workflow, same choice ContactImportModule made this session; guides have no
// separate publish-approval tier the way the contact-import batch flow did).
//
// GRANTED TO `moderator` ONLY — role_parents (moderator -> administrator -> super_administrator)
// already carries this upward, same inheritance precedent as
// SeedPlaceTranslationReviewPermission1720005200000. No `content_owner` role exists in this
// codebase; `moderator` is the closest existing access class already trusted for other structured
// content workflows (PlaceTranslation.Review.Any, Contact.Edit.Any).
//
// Scope `Any` (not `.Own`/`.Managed`): a guide article is not owned/managed by a specific business
// in the ADR-019 sense — same context-free scope class as PlaceTranslation.Review.Any.
//
// Does NOT assign this role to any real user — same precedent as every other seed-permission
// migration in this codebase.
export class SeedGuideEditPermission1720006100000 implements MigrationInterface {
  name = 'SeedGuideEditPermission1720006100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code","module","action","scope") VALUES
        ('Guide.Edit.Any','Guide','Edit','Any')
      ON CONFLICT ("code") DO NOTHING
    `);

    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id","permission_id","effect")
       SELECT r.id, p.id, 'allow'
       FROM "roles" r JOIN "permissions" p ON p.code = 'Guide.Edit.Any'
       WHERE r.code = 'moderator'
       ON CONFLICT ("role_id","permission_id") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Unconditional delete is safe: this is an ADDITIVE grant, removing it only narrows access.
    // role_permissions rows referencing this permission cascade-delete via FK.
    await queryRunner.query(`DELETE FROM "permissions" WHERE "code" = 'Guide.Edit.Any'`);
  }
}
