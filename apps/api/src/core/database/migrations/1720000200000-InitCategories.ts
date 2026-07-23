import { MigrationInterface, QueryRunner } from 'typeorm';

// Sprint 1 — bảng `categories` (cây phân cấp qua parent_id). Không timestamp (khớp schema).
export class InitCategories1720000200000 implements MigrationInterface {
  name = 'InitCategories1720000200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug" varchar(120) NOT NULL,
        "name_vi" varchar(120) NOT NULL,
        "name_en" varchar(120),
        "icon" varchar(120),
        "parent_id" uuid REFERENCES "categories"("id") ON DELETE NO ACTION
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_categories_slug" ON "categories" ("slug")`);
    await queryRunner.query(`CREATE INDEX "idx_categories_parent" ON "categories" ("parent_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "categories"`);
  }
}
