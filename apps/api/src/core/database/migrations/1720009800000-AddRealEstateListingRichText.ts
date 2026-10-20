import { MigrationInterface, QueryRunner } from 'typeorm';

// Gói D, mở rộng sang BĐS (18/10/2026, owner yêu cầu rõ điểm 1) — cùng mẫu đã dùng cho job_listings
// (description/requirements/benefits): rich-text cho `description`/`utilities_note`/
// `legal_status_note` NGUỒN, cộng `description_rich` cho bản dịch EN (draft + published snapshot).
// Tất cả cột MỚI, NULLABLE, KHÔNG backfill — dữ liệu cũ tiếp tục hiển thị đúng như trước. Mỗi
// `*_rich` đi kèm `*_rich_hash` — cơ chế đóng rủi ro rollback dùng chung (xem
// apps/api/src/common/rich-text-field.ts).
export class AddRealEstateListingRichText1720009800000 implements MigrationInterface {
  name = 'AddRealEstateListingRichText1720009800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "real_estate_listings" ADD COLUMN "description_rich" JSONB`);
    await queryRunner.query(`ALTER TABLE "real_estate_listings" ADD COLUMN "description_rich_hash" CHAR(64)`);
    await queryRunner.query(`ALTER TABLE "real_estate_listings" ADD COLUMN "utilities_note_rich" JSONB`);
    await queryRunner.query(`ALTER TABLE "real_estate_listings" ADD COLUMN "utilities_note_rich_hash" CHAR(64)`);
    await queryRunner.query(`ALTER TABLE "real_estate_listings" ADD COLUMN "legal_status_note_rich" JSONB`);
    await queryRunner.query(`ALTER TABLE "real_estate_listings" ADD COLUMN "legal_status_note_rich_hash" CHAR(64)`);

    await queryRunner.query(`ALTER TABLE "real_estate_listing_translations" ADD COLUMN "description_rich" JSONB`);
    await queryRunner.query(`ALTER TABLE "real_estate_listing_translations" ADD COLUMN "description_rich_hash" CHAR(64)`);
    await queryRunner.query(`ALTER TABLE "real_estate_listing_translations" ADD COLUMN "published_description_rich" JSONB`);
    await queryRunner.query(`ALTER TABLE "real_estate_listing_translations" ADD COLUMN "published_description_rich_hash" CHAR(64)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "real_estate_listing_translations" DROP COLUMN "published_description_rich_hash"`);
    await queryRunner.query(`ALTER TABLE "real_estate_listing_translations" DROP COLUMN "published_description_rich"`);
    await queryRunner.query(`ALTER TABLE "real_estate_listing_translations" DROP COLUMN "description_rich_hash"`);
    await queryRunner.query(`ALTER TABLE "real_estate_listing_translations" DROP COLUMN "description_rich"`);

    await queryRunner.query(`ALTER TABLE "real_estate_listings" DROP COLUMN "legal_status_note_rich_hash"`);
    await queryRunner.query(`ALTER TABLE "real_estate_listings" DROP COLUMN "legal_status_note_rich"`);
    await queryRunner.query(`ALTER TABLE "real_estate_listings" DROP COLUMN "utilities_note_rich_hash"`);
    await queryRunner.query(`ALTER TABLE "real_estate_listings" DROP COLUMN "utilities_note_rich"`);
    await queryRunner.query(`ALTER TABLE "real_estate_listings" DROP COLUMN "description_rich_hash"`);
    await queryRunner.query(`ALTER TABLE "real_estate_listings" DROP COLUMN "description_rich"`);
  }
}
