import { MigrationInterface, QueryRunner } from 'typeorm';

// Cấp trực tiếp cho CẢ 'moderator' và 'content_owner' ngay trong migration này — cùng mẫu
// SeedJobListingPermissions1720008200000 (tránh lặp lại bug class từng xảy ra với
// place_edit_proposals, nơi thiếu grant cho content_owner phải vá bằng một migration riêng sau).
export class SeedRealEstateListingPermissions1720008400000 implements MigrationInterface {
  name = 'SeedRealEstateListingPermissions1720008400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code","module","action","scope")
      VALUES
        ('RealEstateListing.Create','RealEstateListing','Create',NULL),
        ('RealEstateListing.Moderate','RealEstateListing','Moderate',NULL)
      ON CONFLICT ("code") DO NOTHING
    `);

    await this.grant(queryRunner, 'member', ['RealEstateListing.Create']);
    await this.grant(queryRunner, 'moderator', ['RealEstateListing.Moderate']);
    await this.grant(queryRunner, 'content_owner', ['RealEstateListing.Moderate']);
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
    await queryRunner.query(`DELETE FROM "permissions" WHERE "code" IN ('RealEstateListing.Create','RealEstateListing.Moderate')`);
  }
}
