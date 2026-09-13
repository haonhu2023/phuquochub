import { MigrationInterface, QueryRunner } from 'typeorm';

// Place Edit Proposals MVP — two permissions, same shape as SeedModerationPermissions
// (1720003300000): `member` gets the "submit" permission (mirrors `Report.Create` — "open to any
// signed-in member"); `moderator` gets a single combined view+decide permission (mirrors
// `Media.Moderate`/`Review.Moderate` — one permission for the whole staff review action, not split
// into separate View/Decide grants for this MVP).
export class SeedPlaceEditProposalPermissions1720005800000 implements MigrationInterface {
  name = 'SeedPlaceEditProposalPermissions1720005800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code","module","action","scope") VALUES
        ('PlaceEditProposal.Create','PlaceEditProposal','Create',NULL),
        ('PlaceEditProposal.Moderate','PlaceEditProposal','Moderate',NULL)
      ON CONFLICT ("code") DO NOTHING
    `);

    await this.grant(queryRunner, 'member', ['PlaceEditProposal.Create']);
    await this.grant(queryRunner, 'moderator', ['PlaceEditProposal.Moderate']);
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
        'PlaceEditProposal.Create','PlaceEditProposal.Moderate'
      )
    `);
  }
}
