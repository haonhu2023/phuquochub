import { MigrationInterface, QueryRunner } from 'typeorm';

// Google Place ID confirm/revoke ownership decision (2026-10-16, "mở đúng hồ sơ Google Maps"
// Track A). `PUT /places/:id/external-identifiers/google-places` (entering/proposing an ID) stays
// `Place.Edit.Managed` — unchanged, a place manager may still propose an ID for a place they
// manage. But CONFIRMING that a proposed ID actually matches the real place is a DIFFERENT trust
// decision (did someone cross-check the Google profile against this place, not just "may I edit
// this place's content") — reusing `Place.Edit.Managed` for it would let the SAME person who
// entered an ID also self-confirm it, defeating the point of a confirm step at all. Explicitly
// NOT broadening `Place.Edit.Managed` into an approval permission (owner instruction).
//
// `PlaceExternalIdentifier.Verify` is a NEW, NARROW permission scoped to this one sub-resource —
// same precedent/shape as `Price.Verify` (1720007800000-SeedPriceVerifyPermission.ts): a
// content-trust action split out from an edit action, granted ONLY to `content_owner` (the role
// that already holds every other place-trust permission directly — `Place.Approve`,
// `Place.Edit.Any`, `Price.Verify` — and is NOT on the moderator inheritance branch, see that
// role's own seed comment). Not granted to `moderator` in this migration — `content_owner` is the
// narrowest correct grantee matching the Price.Verify precedent exactly; widening to `moderator`
// is a separate, later decision if the owner wants it, not assumed here.
//
// Scope `Any` (no `AuthorizationContext`, global on the route) — same as `Price.Verify`: this is a
// moderator-ish trust role allowed to confirm ANY place's identifier, not scoped to "places they
// personally manage" the way `Place.Edit.Managed` is.
export class SeedPlaceExternalIdentifierVerifyPermission1720009100000 implements MigrationInterface {
  name = 'SeedPlaceExternalIdentifierVerifyPermission1720009100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code","module","action","scope") VALUES
        ('PlaceExternalIdentifier.Verify','PlaceExternalIdentifier','Verify','Any')
      ON CONFLICT ("code") DO NOTHING
    `);

    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id","permission_id","effect")
       SELECT r.id, p.id, 'allow'
       FROM "roles" r JOIN "permissions" p ON p.code = 'PlaceExternalIdentifier.Verify'
       WHERE r.code = 'content_owner'
       ON CONFLICT ("role_id","permission_id") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Unconditional delete is safe: this is an ADDITIVE grant, removing it only narrows access.
    await queryRunner.query(`DELETE FROM "permissions" WHERE "code" = 'PlaceExternalIdentifier.Verify'`);
  }
}
