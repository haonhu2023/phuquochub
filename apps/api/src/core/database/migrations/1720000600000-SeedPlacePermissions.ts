import { MigrationInterface, QueryRunner } from 'typeorm';

// Wave 1 — bổ sung permission cho Place/Contact/Price/Media/Search + gán vào vai trò.
// Idempotent: ON CONFLICT DO NOTHING (chạy được cả khi seed lại).
export class SeedPlacePermissions1720000600000 implements MigrationInterface {
  name = 'SeedPlacePermissions1720000600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code","module","action","scope") VALUES
        ('Place.Edit.Own','Place','Edit','Own'),
        ('Place.Edit.Managed','Place','Edit','Managed'),
        ('Place.Edit.Any','Place','Edit','Any'),
        ('Place.Archive','Place','Archive',NULL),
        ('Place.Merge','Place','Merge',NULL),
        ('Contact.Edit.Managed','Contact','Edit','Managed'),
        ('Contact.Edit.Any','Contact','Edit','Any'),
        ('Price.Edit.Managed','Price','Edit','Managed'),
        ('Price.Edit.Any','Price','Edit','Any'),
        ('Media.Upload.Own','Media','Upload','Own'),
        ('Media.Upload.Managed','Media','Upload','Managed'),
        ('Search.Reindex','Search','Reindex',NULL)
      ON CONFLICT ("code") DO NOTHING
    `);

    await this.grant(queryRunner, 'member', ['Media.Upload.Own']);
    await this.grant(queryRunner, 'contributor', [
      'Place.Edit.Any',
      'Contact.Edit.Any',
      'Price.Edit.Any',
      'Media.Upload.Own',
    ]);
    await this.grant(queryRunner, 'business_manager', [
      'Place.Edit.Managed',
      'Contact.Edit.Managed',
      'Price.Edit.Managed',
      'Media.Upload.Managed',
    ]);
    await this.grant(queryRunner, 'moderator', ['Place.Archive', 'Place.Merge', 'Search.Reindex']);
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
    await queryRunner.query(`
      DELETE FROM "permissions" WHERE "code" IN (
        'Place.Edit.Own','Place.Edit.Managed','Place.Edit.Any','Place.Archive','Place.Merge',
        'Contact.Edit.Managed','Contact.Edit.Any','Price.Edit.Managed','Price.Edit.Any',
        'Media.Upload.Own','Media.Upload.Managed','Search.Reindex'
      )
    `);
  }
}
