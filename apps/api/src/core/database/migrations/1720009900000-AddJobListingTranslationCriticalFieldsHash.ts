import { MigrationInterface, QueryRunner } from 'typeorm';

// Gói D điểm 4 (18/10/2026, owner yêu cầu rõ) — "không coi một cảnh báo chung là đủ" khi bản dịch
// đã biết mâu thuẫn với dữ kiện QUAN TRỌNG (ca làm/địa điểm/giá/điều kiện giao dịch). Cột MỚI,
// NULLABLE, không backfill — bản dịch đã duyệt TRƯỚC migration này có cột = NULL, xử lý như "chưa
// biết, không ẩn" (xem job-listing-translation-hash.ts's isJobListingTranslationCriticallyStale()).
export class AddJobListingTranslationCriticalFieldsHash1720009900000 implements MigrationInterface {
  name = 'AddJobListingTranslationCriticalFieldsHash1720009900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "job_listing_translations" ADD COLUMN "published_critical_fields_hash" CHAR(64)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "job_listing_translations" DROP COLUMN "published_critical_fields_hash"`);
  }
}
