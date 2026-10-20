import { MigrationInterface, QueryRunner } from 'typeorm';

// Gói D điểm 4 (18/10/2026) — mirror AddJobListingTranslationCriticalFieldsHash cho real estate.
// Cột MỚI, NULLABLE, không backfill.
export class AddRealEstateListingTranslationCriticalFieldsHash1720010000000 implements MigrationInterface {
  name = 'AddRealEstateListingTranslationCriticalFieldsHash1720010000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "real_estate_listing_translations" ADD COLUMN "published_critical_fields_hash" CHAR(64)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "real_estate_listing_translations" DROP COLUMN "published_critical_fields_hash"`);
  }
}
