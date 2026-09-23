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
    // 2026-09-23: an unconditional `DELETE FROM roles WHERE code='content_owner'` was proven
    // destructive against a real production DB copy — this role can ALREADY exist there (seeded
    // independently by production's own SeedContentOwnerRole1720005700000, with 4 grants of its
    // own, 2 of which — Media.Moderate, PlaceTranslation.Review.Any — happen to also be in THIS
    // migration's list) and already be assigned to a real user.
    //
    // A first fix tried "delete role_permissions for exactly these 10 codes, then delete the role
    // only if nothing else references it" — also proven wrong on the same production copy: up()'s
    // `ON CONFLICT DO NOTHING` makes the 2 overlapping grants silent no-ops, but a role_permissions
    // row carries no "which migration added this" marker, so a code-based DELETE in down() cannot
    // tell "pre-existing, up() no-op'd on it" apart from "up() actually inserted it" — it deleted
    // both overlapping production grants that were never this migration's to remove.
    //
    // Correct fix: down() can only prove it is safe to touch this role's grants/existence when the
    // role's ENTIRE current grant set is exactly equal (as a set) to the 10 codes up() grants, AND
    // no user has ever been assigned to it — that combination is only true when up() created the
    // role from nothing and nothing else has touched it since, i.e. this migration provably owns
    // its whole current state.
    //
    // In THIS merged codebase that condition is in fact never true, on production OR on a fresh
    // DB: production's own earlier SeedContentOwnerRole1720005700000 /
    // SeedContentOwnerModerationPermissions1720005800000 /
    // GrantContentOwnerMediaModerationScope1720005900000 (all lower timestamps, so they always run
    // first) already create the role and grant Media.Moderate.Own/PlaceTranslation.Review.Any/
    // Media.Moderate/Moderation.Queue.View directly — verified on BOTH a real production DB copy
    // (role pre-existed with those 4 grants plus a real user assignment before this migration ever
    // ran) AND a from-scratch empty DB running the full merged migration chain (same 4 grants
    // present by the time this migration's up() runs, since 1720005700000-1720005900000 execute
    // first regardless of DB history). So down() is correctly a no-op in every real execution path
    // this repository can produce, leaving the role, every grant, and any user assignment
    // untouched — the exact-match branch above is retained as a defensive invariant (it would
    // trigger a full, correct cleanup if this migration were ever the sole creator, e.g. cherry-
    // picked in isolation), not as something expected to fire here.
    // PostgreSQL DO blocks do not accept bind parameters ($1) -- confirmed by a real failed
    // migration:revert attempt against the production DB copy ("there is no parameter $1"). Safe
    // to inline here regardless: `permissionCodes` is this class's own hardcoded compile-time
    // constant, never external/user input.
    const expectedCodesLiteral = `ARRAY[${this.permissionCodes.map((code) => `'${code}'`).join(',')}]::text[]`;

    await queryRunner.query(`
      DO $$
      DECLARE
        target_role_id uuid;
        granted_codes text[];
        expected_codes text[] := ${expectedCodesLiteral};
        has_assignment boolean;
      BEGIN
        SELECT id INTO target_role_id FROM "roles" WHERE "code" = 'content_owner';
        IF target_role_id IS NULL THEN
          RETURN;
        END IF;

        SELECT array_agg(p.code ORDER BY p.code) INTO granted_codes
        FROM "role_permissions" rp JOIN "permissions" p ON p.id = rp.permission_id
        WHERE rp.role_id = target_role_id;

        SELECT EXISTS(SELECT 1 FROM "user_roles" WHERE "role_id" = target_role_id) INTO has_assignment;

        IF NOT has_assignment
           AND granted_codes = (SELECT array_agg(c ORDER BY c) FROM unnest(expected_codes) c) THEN
          DELETE FROM "role_permissions" WHERE "role_id" = target_role_id;
          DELETE FROM "roles" WHERE "id" = target_role_id;
        END IF;
      END $$;
    `);
  }
}
