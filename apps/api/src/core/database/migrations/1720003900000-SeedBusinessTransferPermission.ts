import { MigrationInterface, QueryRunner } from 'typeorm';

// Business Ownership Transfer milestone (UC-B7) — Owner Decision 2: seed permission CÓ hậu tố
// `.Managed` (khác chuỗi không hậu tố `Business.Transfer` mà rbac.md ghi — cùng lớp rủi ro đã phát
// hiện và chốt cho Business.Manager.Assign/Revoke.Managed) — khớp ADR-019 D6 (hậu tố trên mã
// permission QUYẾT ĐỊNH scope class). Grant CHỈ `business_owner` — BR-B6 "Manager không có
// Claim/Transfer/Manager.Assign/Delete cơ sở", rbac.md dòng 100-101/177/185.
export class SeedBusinessTransferPermission1720003900000 implements MigrationInterface {
  name = 'SeedBusinessTransferPermission1720003900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code","module","action","scope") VALUES
        ('Business.Transfer.Managed','Business','Transfer','Managed')
      ON CONFLICT ("code") DO NOTHING
    `);

    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id","permission_id","effect")
       SELECT r.id, p.id, 'allow'
       FROM "roles" r JOIN "permissions" p ON p.code = 'Business.Transfer.Managed'
       WHERE r.code = 'business_owner'
       ON CONFLICT ("role_id","permission_id") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "permissions" WHERE "code" = 'Business.Transfer.Managed'`);
  }
}
