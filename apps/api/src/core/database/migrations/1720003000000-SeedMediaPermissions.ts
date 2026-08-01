import { MigrationInterface, QueryRunner } from 'typeorm';

// Media Upload Foundation (design review, 2026-07-30). Media.Upload.Own — a member may request a
// presign and register media they themselves uploaded (uploaded_by = self); the ".Own" scope
// convention matches Event.Edit.Own/Place.Edit.Own (authorization.util.ts §Scope: Any ⊃ Managed ⊃
// Own). No Media.View/Media.Manage seeded here — no endpoint uses them yet (avoids orphan
// permissions, same discipline as SeedReviewPermissions).
export class SeedMediaPermissions1720003000000 implements MigrationInterface {
  name = 'SeedMediaPermissions1720003000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code","module","action","scope") VALUES
        ('Media.Upload.Own','Media','Upload','Own')
      ON CONFLICT ("code") DO NOTHING
    `);

    await this.grant(queryRunner, 'member', ['Media.Upload.Own']);
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
    await queryRunner.query(`DELETE FROM "permissions" WHERE "code" IN ('Media.Upload.Own')`);
  }
}
