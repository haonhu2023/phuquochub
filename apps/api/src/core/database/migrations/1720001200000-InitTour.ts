import { MigrationInterface, QueryRunner } from 'typeorm';

// Sprint 3 · B3 — Tour (ADR-002 satellite, category='tour'). data-dictionary §11:
// place_tour_details(1:1) · tour_stops(1:N, GIST location) · tour_schedules(1:N). FK → places CASCADE.
export class InitTour1720001200000 implements MigrationInterface {
  name = 'InitTour1720001200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "tour_type" AS ENUM ('diving','fishing','trekking','sightseeing','cruise','other')`,
    );
    await queryRunner.query(`CREATE TYPE "tour_difficulty" AS ENUM ('easy','moderate','hard')`);

    await queryRunner.query(`
      CREATE TABLE "place_tour_details" (
        "place_id" uuid PRIMARY KEY REFERENCES "places"("id") ON DELETE CASCADE,
        "tour_type" "tour_type" NOT NULL,
        "duration_minutes" int,
        "difficulty" "tour_difficulty",
        "organizer_id" uuid REFERENCES "places"("id") ON DELETE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "tour_stops" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "place_id" uuid NOT NULL REFERENCES "places"("id") ON DELETE CASCADE,
        "name" varchar(160) NOT NULL,
        "location" geography(Point,4326),
        "sort_order" int NOT NULL DEFAULT 0,
        "time" varchar(40),
        "note" varchar(300)
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_tour_stops_place" ON "tour_stops" ("place_id","sort_order")`);
    await queryRunner.query(
      `CREATE INDEX "idx_tour_stops_location" ON "tour_stops" USING GIST ("location") WHERE "location" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "tour_schedules" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "place_id" uuid NOT NULL REFERENCES "places"("id") ON DELETE CASCADE,
        "date" date NOT NULL,
        "capacity" int,
        "price" numeric(12,2),
        "currency" char(3) NOT NULL DEFAULT 'VND',
        "valid_from" timestamptz,
        "valid_to" timestamptz
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_tour_schedules_place" ON "tour_schedules" ("place_id","date")`);

    // Danh mục 'tour' (discriminator ADR-002) — Sprint 2 seed chưa có.
    await queryRunner.query(
      `INSERT INTO "categories" ("slug","name_vi","name_en","icon")
       VALUES ('tour','Tour & Trải nghiệm','Tours & Experiences','map')
       ON CONFLICT ("slug") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "tour_schedules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tour_stops"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "place_tour_details"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tour_difficulty"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tour_type"`);
  }
}
