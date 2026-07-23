import { MigrationInterface, QueryRunner } from 'typeorm';

// Wave 1 — thêm FK user_roles.business_id → places (ADR-015), hoãn từ Sprint 1 vì
// bảng `places` khi đó chưa tồn tại. Giờ đã có → siết toàn vẹn.
export class AddUserRoleBusinessFk1720000500000 implements MigrationInterface {
  name = 'AddUserRoleBusinessFk1720000500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_roles" ADD CONSTRAINT "fk_user_roles_business" FOREIGN KEY ("business_id") REFERENCES "places"("id") ON DELETE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_roles" DROP CONSTRAINT IF EXISTS "fk_user_roles_business"`);
  }
}
