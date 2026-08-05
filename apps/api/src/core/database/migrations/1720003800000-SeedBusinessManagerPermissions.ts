import { MigrationInterface, QueryRunner } from 'typeorm';

// Business Manager Assignment/Revocation milestone — Owner Decision 1: seed CÁC permission CÓ hậu
// tố `.Managed` (khác `Business.Claim`/`Business.Verify` từ M3, cả hai KHÔNG có hậu tố scope) —
// khớp ADR-019 D6 (hậu tố trên mã permission QUYẾT ĐỊNH scope class, không phải chuỗi tên gợi ý ở
// rbac.md). Grant CHỈ cho `business_owner` — BR-B6 "Manager không có ... Manager.Assign/Delete cơ
// sở", rbac.md dòng 100/177/185. `business_owner` là leaf trên cùng DAG (không role nào kế thừa
// NÓ), nên grant trực tiếp không rò xuống `business_manager`/`moderator`/ai khác.
export class SeedBusinessManagerPermissions1720003800000 implements MigrationInterface {
  name = 'SeedBusinessManagerPermissions1720003800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code","module","action","scope") VALUES
        ('Business.Manager.Assign.Managed','Business','Manager.Assign','Managed'),
        ('Business.Manager.Revoke.Managed','Business','Manager.Revoke','Managed')
      ON CONFLICT ("code") DO NOTHING
    `);

    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id","permission_id","effect")
       SELECT r.id, p.id, 'allow'
       FROM "roles" r JOIN "permissions" p
         ON p.code IN ('Business.Manager.Assign.Managed','Business.Manager.Revoke.Managed')
       WHERE r.code = 'business_owner'
       ON CONFLICT ("role_id","permission_id") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "code" IN ('Business.Manager.Assign.Managed','Business.Manager.Revoke.Managed')`,
    );
  }
}
