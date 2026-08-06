import { MigrationInterface, QueryRunner } from 'typeorm';

// ADR-008 Verification Foundation — Owner Decision (2026-08-06):
// - `Verification.Verify`/`Verification.Reject` already seeded by SeedRbac1720000300000, granted to
//   `moderator` only, unscoped (global) — LEFT UNCHANGED here. `business_owner` does NOT receive
//   either permission and no `.Managed`-suffixed variant is created; verification.md §5D's "Moderator
//   / Business (đã claim)" wording is the CONCEPTUAL outcome ADR-015 already delivers through its own
//   separate `Business.Verify` + claim-approval path, not a literal grant on this permission.
// - `Verification.Vote` was documented in rbac.md (§3.3, §4.3) but never seeded until now. Granted
//   ONLY to `local_guide`, unscoped (global, no `@AuthorizationContext` needed) — matches the ONLY
//   role rbac.md explicitly names. `moderator`/`administrator`/`super_administrator` pick it up
//   through the REAL, already-seeded `role_parents` DAG edge `moderator -> local_guide`
//   (SeedRbac1720000300000) — not assumed, not re-granted explicitly here.
export class SeedVerificationPermissions1720004100000 implements MigrationInterface {
  name = 'SeedVerificationPermissions1720004100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code","module","action","scope") VALUES
        ('Verification.Vote','Verification','Vote',NULL)
      ON CONFLICT ("code") DO NOTHING
    `);

    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id","permission_id","effect")
       SELECT r.id, p.id, 'allow'
       FROM "roles" r JOIN "permissions" p ON p.code = 'Verification.Vote'
       WHERE r.code = 'local_guide'
       ON CONFLICT ("role_id","permission_id") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "permissions" WHERE "code" = 'Verification.Vote'`);
  }
}
