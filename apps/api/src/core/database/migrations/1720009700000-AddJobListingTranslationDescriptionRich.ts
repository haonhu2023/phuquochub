import { MigrationInterface, QueryRunner } from 'typeorm';

// Gói D, mở rộng phạm vi (18/10/2026) — "Bổ sung rich-text cho mô tả bản dịch EN tuyển dụng" (owner
// yêu cầu rõ, CHƯA phải giới hạn đã chốt loại khỏi phạm vi như báo cáo trước đó nhầm hiểu). CHỈ
// `description` (không requirements/benefits bản dịch — ngoài phạm vi yêu cầu). Bốn cột MỚI,
// NULLABLE, một cặp cho vùng NHÁP (`description_rich`/`description_rich_hash`) và một cặp ĐỘC LẬP
// cho vùng ĐÃ DUYỆT (`published_description_rich`/`published_description_rich_hash`) — đúng kiến
// trúc tách nháp/công khai đã có của bảng này (xem AddJobListingTranslationCasAndSnapshot). Không
// backfill, không đổi cột cũ.
export class AddJobListingTranslationDescriptionRich1720009700000 implements MigrationInterface {
  name = 'AddJobListingTranslationDescriptionRich1720009700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "job_listing_translations" ADD COLUMN "description_rich" JSONB`);
    await queryRunner.query(`ALTER TABLE "job_listing_translations" ADD COLUMN "description_rich_hash" CHAR(64)`);
    await queryRunner.query(`ALTER TABLE "job_listing_translations" ADD COLUMN "published_description_rich" JSONB`);
    await queryRunner.query(`ALTER TABLE "job_listing_translations" ADD COLUMN "published_description_rich_hash" CHAR(64)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "job_listing_translations" DROP COLUMN "published_description_rich_hash"`);
    await queryRunner.query(`ALTER TABLE "job_listing_translations" DROP COLUMN "published_description_rich"`);
    await queryRunner.query(`ALTER TABLE "job_listing_translations" DROP COLUMN "description_rich_hash"`);
    await queryRunner.query(`ALTER TABLE "job_listing_translations" DROP COLUMN "description_rich"`);
  }
}
