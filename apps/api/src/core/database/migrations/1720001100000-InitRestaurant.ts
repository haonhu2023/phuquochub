import { MigrationInterface, QueryRunner } from 'typeorm';

// Sprint 3 · B2 — Restaurant (ADR-002 satellite, category='restaurant'). data-dictionary §11:
// place_restaurant_details(1:1) · restaurant_menu_sections(1:N) · restaurant_menu_items(1:N→sections
// CASCADE) · cuisines(dict) · place_cuisines(N:N). FK → places ON DELETE CASCADE.
export class InitRestaurant1720001100000 implements MigrationInterface {
  name = 'InitRestaurant1720001100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "place_restaurant_details" (
        "place_id" uuid PRIMARY KEY REFERENCES "places"("id") ON DELETE CASCADE,
        "is_local_specialty" boolean NOT NULL DEFAULT false,
        "dietary" jsonb
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "restaurant_menu_sections" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "place_id" uuid NOT NULL REFERENCES "places"("id") ON DELETE CASCADE,
        "name" varchar(120) NOT NULL,
        "sort_order" int NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_menu_sections_place" ON "restaurant_menu_sections" ("place_id","sort_order")`,
    );

    await queryRunner.query(`
      CREATE TABLE "restaurant_menu_items" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "section_id" uuid NOT NULL REFERENCES "restaurant_menu_sections"("id") ON DELETE CASCADE,
        "name" varchar(160) NOT NULL,
        "price" numeric(12,2),
        "currency" char(3) NOT NULL DEFAULT 'VND',
        "tags" jsonb,
        "sort_order" int NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_menu_items_section" ON "restaurant_menu_items" ("section_id","sort_order")`,
    );

    await queryRunner.query(`
      CREATE TABLE "cuisines" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" varchar(60) NOT NULL,
        "label_vi" varchar(120) NOT NULL,
        "label_en" varchar(120)
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_cuisines_code" ON "cuisines" ("code")`);

    await queryRunner.query(`
      CREATE TABLE "place_cuisines" (
        "place_id" uuid NOT NULL REFERENCES "places"("id") ON DELETE CASCADE,
        "cuisine_id" uuid NOT NULL REFERENCES "cuisines"("id") ON DELETE CASCADE,
        PRIMARY KEY ("place_id","cuisine_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_place_cuisines_cuisine" ON "place_cuisines" ("cuisine_id")`);

    await queryRunner.query(`
      INSERT INTO "cuisines" ("code","label_vi","label_en") VALUES
        ('seafood','Hải sản','Seafood'),
        ('vietnamese','Món Việt','Vietnamese'),
        ('bbq','Nướng','BBQ / Grill'),
        ('vegetarian','Chay','Vegetarian'),
        ('street_food','Ăn vặt','Street food')
      ON CONFLICT ("code") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "place_cuisines"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cuisines"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "restaurant_menu_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "restaurant_menu_sections"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "place_restaurant_details"`);
  }
}
