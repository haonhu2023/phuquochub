import { MigrationInterface, QueryRunner } from 'typeorm';

// Cấp trực tiếp cho CẢ 'moderator' và 'content_owner' ngay trong migration này — khác với
// place_edit_proposals (SeedPlaceEditProposalPermissions1720006800000), nơi thiếu grant cho
// content_owner phải sửa bằng một migration vá sau (GrantContentOwnerPlaceEditProposalModeration).
// content_owner KHÔNG kế thừa từ moderator (role song song, xem comment của migration đó).
export class SeedJobListingPermissions1720008200000 implements MigrationInterface {
  name = 'SeedJobListingPermissions1720008200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code","module","action","scope")
      VALUES
        ('JobListing.Create','JobListing','Create',NULL),
        ('JobListing.Moderate','JobListing','Moderate',NULL)
      ON CONFLICT ("code") DO NOTHING
    `);

    await this.grant(queryRunner, 'member', ['JobListing.Create']);
    await this.grant(queryRunner, 'moderator', ['JobListing.Moderate']);
    await this.grant(queryRunner, 'content_owner', ['JobListing.Moderate']);
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
    await queryRunner.query(`DELETE FROM "permissions" WHERE "code" IN ('JobListing.Create','JobListing.Moderate')`);
  }
}
