import { MigrationInterface, QueryRunner } from 'typeorm';

// ADR-015 Claim Decision Workflow — Owner Decision 2: một quyền MỚI `Business.Verify`, TÁCH BIỆT
// khỏi `Verification.Verify` (đã seed ở SeedRbac1720000300000, gác transition verification_status
// của Place nói chung — ADR-008). `Business.Verify` gác riêng hành động "duyệt/bác một
// business_claims" (WF-05, rbac.md dòng 98/191/275) — hai quyền độc lập dù cùng do `moderator` giữ
// và cùng có thể xảy ra trong một quyết định approve (service gọi CẢ HAI hiệu ứng, chỉ kiểm tra
// permission `Business.Verify`). `Business.Claim` ĐÃ tồn tại (SeedRbac) — KHÔNG seed lại.
//
// KHÔNG role mới, KHÔNG seed tường minh cho administrator/super_administrator — kế thừa qua
// role_parents DAG sẵn có (moderator -> ... -> administrator -> super_administrator), cùng quy ước
// SeedModerationPermissions1720003300000.
export class SeedBusinessPermissions1720003700000 implements MigrationInterface {
  name = 'SeedBusinessPermissions1720003700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code","module","action","scope") VALUES
        ('Business.Verify','Business','Verify',NULL)
      ON CONFLICT ("code") DO NOTHING
    `);

    await queryRunner.query(
      `INSERT INTO "role_permissions" ("role_id","permission_id","effect")
       SELECT r.id, p.id, 'allow'
       FROM "roles" r JOIN "permissions" p ON p.code = 'Business.Verify'
       WHERE r.code = 'moderator'
       ON CONFLICT ("role_id","permission_id") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "permissions" WHERE "code" = 'Business.Verify'`);
  }
}
