import { MigrationInterface, QueryRunner } from 'typeorm';

// BK1 (launch-readiness pass, 2026-09-22) — read-only backup/restore status for the owner
// dashboard (N2's "Hướng dẫn" page). `Ops.BackupStatus.View` is deliberately its own permission,
// not folded into `SiteContent.Edit` or any existing code — it grants READ of operational
// filesystem metadata (backup file names/timestamps/sizes), not a content-edit capability, and a
// future narrower "ops viewer" role (no content-edit rights at all) should be able to hold it
// without also holding `SiteContent.Edit`.
//
// GRANTED TO `content_owner` ONLY — same precedent as SiteContentSchema1720006400000. Module name
// `Ops` (not `Backup`) anticipates other read-only operational status surfaces landing under the
// same module later (e.g. queue depth, scheduler health) without inventing a new module per metric.
export class SeedBackupStatusPermission1720006500000 implements MigrationInterface {
  name = 'SeedBackupStatusPermission1720006500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code","module","action","scope") VALUES
        ('Ops.BackupStatus.View','Ops','View','Any')
      ON CONFLICT ("code") DO NOTHING
    `);

    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id","permission_id","effect")
       SELECT r.id, p.id, 'allow'
       FROM "roles" r JOIN "permissions" p ON p.code = 'Ops.BackupStatus.View'
       WHERE r.code = 'content_owner'
       ON CONFLICT ("role_id","permission_id") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Unconditional delete is safe: this is an ADDITIVE grant, removing it only narrows access.
    await queryRunner.query(`DELETE FROM "permissions" WHERE "code" = 'Ops.BackupStatus.View'`);
  }
}
