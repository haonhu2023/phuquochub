import { MigrationInterface, QueryRunner } from 'typeorm';

// Sprint 3 · B1 — Hotel (ADR-002 satellite của Place, discriminator = categories.slug='hotel').
// data-dictionary §11: place_hotel_details(1:1) · hotel_room_types(1:N) · amenities(dict) ·
// place_amenities(N:N). FK → places ON DELETE CASCADE. KHÔNG thêm cột vào places.
export class InitHotel1720001000000 implements MigrationInterface {
  name = 'InitHotel1720001000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "hotel_type" AS ENUM ('resort','hotel','homestay','villa','guesthouse','apartment')`,
    );

    // place_hotel_details (1:1, PK=FK=place_id)
    await queryRunner.query(`
      CREATE TABLE "place_hotel_details" (
        "place_id" uuid PRIMARY KEY REFERENCES "places"("id") ON DELETE CASCADE,
        "star_rating" smallint,
        "hotel_type" "hotel_type" NOT NULL,
        "check_in" time,
        "check_out" time,
        CONSTRAINT "chk_hotel_star" CHECK ("star_rating" IS NULL OR "star_rating" BETWEEN 1 AND 5)
      )
    `);

    // hotel_room_types (1:N place_id)
    await queryRunner.query(`
      CREATE TABLE "hotel_room_types" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "place_id" uuid NOT NULL REFERENCES "places"("id") ON DELETE CASCADE,
        "name" varchar(120) NOT NULL,
        "capacity" int,
        "price_ref" numeric(12,2),
        "currency" char(3) NOT NULL DEFAULT 'VND',
        "valid_from" timestamptz,
        "valid_to" timestamptz,
        "sort_order" int NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_hotel_room_types_place" ON "hotel_room_types" ("place_id","sort_order")`,
    );

    // amenities (dictionary dùng chung)
    await queryRunner.query(`
      CREATE TABLE "amenities" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" varchar(60) NOT NULL,
        "label_vi" varchar(120) NOT NULL,
        "label_en" varchar(120),
        "icon" varchar(120),
        "group" varchar(60)
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_amenities_code" ON "amenities" ("code")`);

    // place_amenities (N:N)
    await queryRunner.query(`
      CREATE TABLE "place_amenities" (
        "place_id" uuid NOT NULL REFERENCES "places"("id") ON DELETE CASCADE,
        "amenity_id" uuid NOT NULL REFERENCES "amenities"("id") ON DELETE CASCADE,
        PRIMARY KEY ("place_id","amenity_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_place_amenities_amenity" ON "place_amenities" ("amenity_id")`);

    // Seed amenity phổ biến (idempotent).
    await queryRunner.query(`
      INSERT INTO "amenities" ("code","label_vi","label_en","group") VALUES
        ('wifi','Wi-Fi miễn phí','Free Wi-Fi','connectivity'),
        ('pool','Hồ bơi','Swimming pool','facility'),
        ('parking','Bãi đỗ xe','Parking','facility'),
        ('breakfast','Bữa sáng','Breakfast','service'),
        ('air_con','Máy lạnh','Air conditioning','room'),
        ('spa','Spa','Spa','service'),
        ('beach_access','Lối ra biển','Beach access','location'),
        ('restaurant','Nhà hàng','Restaurant','facility')
      ON CONFLICT ("code") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "place_amenities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "amenities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "hotel_room_types"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "place_hotel_details"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "hotel_type"`);
  }
}
