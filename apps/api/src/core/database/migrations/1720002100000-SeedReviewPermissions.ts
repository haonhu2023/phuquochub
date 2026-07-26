import { MigrationInterface, QueryRunner } from 'typeorm';

// MVP gap-analysis (2026-07-25/26) — Review.Create cho phép mọi user đã có vai trò `member`
// (mặc định khi đăng ký, auth.service.ts:60-63) tạo đánh giá. Cùng khuôn mẫu SeedEventPermissions.
// Không seed Review.Moderate ở đây: chưa có endpoint nào dùng nó (tránh permission mồ côi) —
// hàng đợi kiểm duyệt là hạng mục Medium riêng, sẽ seed permission của nó khi có endpoint thật.
export class SeedReviewPermissions1720002100000 implements MigrationInterface {
  name = 'SeedReviewPermissions1720002100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "permissions" ("code","module","action","scope") VALUES
        ('Review.View','Review','View',NULL),
        ('Review.Create','Review','Create',NULL)
      ON CONFLICT ("code") DO NOTHING
    `);

    await this.grant(queryRunner, 'member', ['Review.Create']);
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
    await queryRunner.query(`DELETE FROM "permissions" WHERE "code" IN ('Review.View','Review.Create')`);
  }
}
