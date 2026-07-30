import { MigrationInterface, QueryRunner } from 'typeorm';

// Availability & Inventory Foundation — cung khuon SeedBookingPermissions/
// AddBookingManagePermissions. Gan cho `moderator` (ke thua tu dong len administrator/
// super_administrator qua role DAG, SeedRbac's link()) — KHONG gan business_manager/
// business_owner, cung ly do da ghi o AddBookingManagePermissions1720002600000: business_claims/
// business_members chua migrate, khong co cach nao cuong che "chi slot cua CHINH co so minh".
export class SeedAvailabilityPermissions1720002800000 implements MigrationInterface {
  name = 'SeedAvailabilityPermissions1720002800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code","module","action","scope") VALUES
        ('Availability.View','Availability','View',NULL),
        ('Availability.Manage','Availability','Manage',NULL)
      ON CONFLICT ("code") DO NOTHING
    `);

    await this.grant(queryRunner, 'moderator', ['Availability.View', 'Availability.Manage']);
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
    await queryRunner.query(`DELETE FROM "permissions" WHERE "code" IN ('Availability.View','Availability.Manage')`);
  }
}
