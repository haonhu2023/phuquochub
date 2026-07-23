import { MigrationInterface, QueryRunner } from 'typeorm';

// Sprint 3 · B5 — permission Event.* (EV-1: đã bổ sung catalog rbac.md §3.3).
// Peer entity (không kế thừa Place perms). Gán: member→Create (đề xuất, chờ duyệt);
// moderator→Edit.Any/Approve/Archive. Idempotent.
export class SeedEventPermissions1720001400000 implements MigrationInterface {
  name = 'SeedEventPermissions1720001400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code","module","action","scope") VALUES
        ('Event.View','Event','View',NULL),
        ('Event.Create','Event','Create',NULL),
        ('Event.Edit.Own','Event','Edit','Own'),
        ('Event.Edit.Any','Event','Edit','Any'),
        ('Event.Approve','Event','Approve',NULL),
        ('Event.Archive','Event','Archive',NULL)
      ON CONFLICT ("code") DO NOTHING
    `);

    await this.grant(queryRunner, 'member', ['Event.Create', 'Event.Edit.Own']);
    await this.grant(queryRunner, 'moderator', ['Event.Edit.Any', 'Event.Approve', 'Event.Archive']);
  }

  private async grant(queryRunner: QueryRunner, roleCode: string, permCodes: string[]): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id","permission_id","effect")
       SELECT r.id, p.id, 'allow'
       FROM "roles" r JOIN "permissions" p ON p.code = ANY($2)
       WHERE r.code = $1
       ON CONFLICT ("role_id","permission_id") DO NOTHING`,
      [roleCode, permCodes],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "code" IN
        ('Event.View','Event.Create','Event.Edit.Own','Event.Edit.Any','Event.Approve','Event.Archive')`,
    );
  }
}
