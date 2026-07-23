import { MigrationInterface, QueryRunner } from 'typeorm';

// Provenance subsystem — permission Source.* (source.md). Chỉ seed 2 mã thực sự có
// endpoint dùng tới (Create, Verify) — tránh permission "chết" không ai cưỡng chế
// (đối chiếu Module 04 PR-R4: cột/permission thiết kế sẵn nhưng không nơi nào dùng).
// GET (list nguồn/attribution) là @Public(), không cần permission riêng.
// Idempotent: ON CONFLICT DO NOTHING.
export class SeedSourcePermissions1720001800000 implements MigrationInterface {
  name = 'SeedSourcePermissions1720001800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code","module","action","scope") VALUES
        ('Source.Create','Source','Create',NULL),
        ('Source.Verify','Source','Verify',NULL)
      ON CONFLICT ("code") DO NOTHING
    `);

    // contributor + business_manager: khai báo nguồn/quy chiếu (bằng chứng) cho dữ liệu
    // họ được sửa — không kế thừa lẫn nhau trong DAG (rbac.md §5) nên gán riêng từng vai.
    await this.grant(queryRunner, 'contributor', ['Source.Create']);
    await this.grant(queryRunner, 'business_manager', ['Source.Create']);
    // moderator: xác nhận nguồn (đối chiếu §7 xử lý xung đột) + kế thừa Source.Create qua contributor.
    await this.grant(queryRunner, 'moderator', ['Source.Verify']);
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
      `DELETE FROM "role_permissions" WHERE "permission_id" IN (
        SELECT "id" FROM "permissions" WHERE "code" IN ('Source.Create','Source.Verify')
      )`,
    );
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "code" IN ('Source.Create','Source.Verify')`,
    );
  }
}
