import { MigrationInterface, QueryRunner } from 'typeorm';

// Price verification ownership decision (2026-10-01, P0 permission audit). Owner Decision
// 2026-08-06 keeps `Verification.Verify`/`.Reject` moderator-only for ALL THREE entities the
// Verification Foundation (ADR-008) covers — place, contact, price_history — through that one
// permission, with no per-entity split. Content Owner inherits `Price.Edit.Managed` (price INPUT)
// via Contributor but has no way to move a price from pending to verified: they can enter a price
// but never see it reach the public page without a moderator.
//
// `Price.Verify` is deliberately a NEW, NARROW permission scoped to price_history ONLY — not a
// broadening of `Verification.Verify` itself. Place and contact verification/official/reject stay
// exactly as moderator-only as before; this migration touches neither. VerificationsController's
// submit()/verify() now accept `Price.Verify` as an alternate permission, but ONLY takes effect
// when the target/current row is a price_history row (see verifications.controller.ts).
//
// GRANTED TO `content_owner` ONLY — same precedent as SiteContentSchema1720006400000 /
// SeedBackupStatusPermission1720006500000 (direct grant, outside the Contributor inheritance
// chain). Deliberately does NOT cover `/official` (OFFICIAL_SOURCE_TYPES + 12-month expiry stays a
// moderator-only decision) — `verified` already satisfies `canDisclosePrice`.
export class SeedPriceVerifyPermission1720007800000 implements MigrationInterface {
  name = 'SeedPriceVerifyPermission1720007800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code","module","action","scope") VALUES
        ('Price.Verify','Price','Verify','Any')
      ON CONFLICT ("code") DO NOTHING
    `);

    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id","permission_id","effect")
       SELECT r.id, p.id, 'allow'
       FROM "roles" r JOIN "permissions" p ON p.code = 'Price.Verify'
       WHERE r.code = 'content_owner'
       ON CONFLICT ("role_id","permission_id") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Unconditional delete is safe: this is an ADDITIVE grant, removing it only narrows access.
    await queryRunner.query(`DELETE FROM "permissions" WHERE "code" = 'Price.Verify'`);
  }
}
