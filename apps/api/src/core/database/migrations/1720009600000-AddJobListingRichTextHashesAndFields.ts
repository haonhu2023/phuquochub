import { MigrationInterface, QueryRunner } from 'typeorm';

// Gói D, mở rộng phạm vi (18/10/2026): (1) thêm cột hash cho `description_rich` (theo sau
// AddJobListingDescriptionRich1720009500000 — KHÔNG sửa migration đã chạy, thêm cột mới) — cơ chế
// đóng rủi ro rollback (xem apps/api/src/common/rich-text-field.ts's ghi chú đầy đủ): so hash lưu
// với hash(description) hiện tại trước khi phục vụ `description_rich`, lệch thì coi như chưa có.
// (2) áp dụng CÙNG mẫu rich-text cho `requirements`/`benefits` (owner yêu cầu rõ: "những trường dài
// khác đã nằm trong phạm vi... áp dụng component dùng chung phù hợp"). Tất cả cột MỚI, NULLABLE,
// KHÔNG backfill — dữ liệu cũ tiếp tục hiển thị đúng như trước.
export class AddJobListingRichTextHashesAndFields1720009600000 implements MigrationInterface {
  name = 'AddJobListingRichTextHashesAndFields1720009600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "job_listings" ADD COLUMN "description_rich_hash" CHAR(64)`);
    await queryRunner.query(`ALTER TABLE "job_listings" ADD COLUMN "requirements_rich" JSONB`);
    await queryRunner.query(`ALTER TABLE "job_listings" ADD COLUMN "requirements_rich_hash" CHAR(64)`);
    await queryRunner.query(`ALTER TABLE "job_listings" ADD COLUMN "benefits_rich" JSONB`);
    await queryRunner.query(`ALTER TABLE "job_listings" ADD COLUMN "benefits_rich_hash" CHAR(64)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "job_listings" DROP COLUMN "benefits_rich_hash"`);
    await queryRunner.query(`ALTER TABLE "job_listings" DROP COLUMN "benefits_rich"`);
    await queryRunner.query(`ALTER TABLE "job_listings" DROP COLUMN "requirements_rich_hash"`);
    await queryRunner.query(`ALTER TABLE "job_listings" DROP COLUMN "requirements_rich"`);
    await queryRunner.query(`ALTER TABLE "job_listings" DROP COLUMN "description_rich_hash"`);
  }
}
