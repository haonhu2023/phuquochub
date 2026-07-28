import { MigrationInterface, QueryRunner } from 'typeorm';

// ADR-017 (Accepted 2026-07-28) — Transport là Place chuyên biệt (satellite, ADR-002), NHƯNG
// trục phân loại chính (`transport_type`) là một BẢNG TỪ ĐIỂN mở rộng được (INSERT, không
// migration), không phải ENUM đóng như `hotel_type`/`tour_type` — vì mission yêu cầu tường minh
// "không hardcode 12 loại hình như category bắt buộc". Đây là điểm khác biệt DUY NHẤT so với
// khuôn Hotel/Tour; mọi quyết định khác (1:1 place_transport_details, bảng con 1:N, tái dùng
// price_history/media/contacts/reviews nguyên trạng) đi đúng ADR-002/003/006.
//
// Thiết kế đầy đủ + lý do từng cột: docs/data/modules/transport.md.
export class InitTransport1720002300000 implements MigrationInterface {
  name = 'InitTransport1720002300000';

  // 12 mã loại hình — DỮ LIỆU THAM CHIẾU (taxonomy), không phải doanh nghiệp thật. Không nhà
  // cung cấp Transport thật nào được seed cùng migration này (xem transport.md §7 — đã rà toàn
  // bộ seed hiện có, không tìm thấy chính sách nào cho phép dữ liệu doanh nghiệp trình diễn).
  private readonly transportTypes: Array<[code: string, nameVi: string, nameEn: string, sortOrder: number]> = [
    ['taxi', 'Taxi', 'Taxi', 0],
    ['airport_transfer', 'Đưa đón sân bay', 'Airport Transfer', 1],
    ['private_car', 'Xe riêng', 'Private Car', 2],
    ['shuttle', 'Xe trung chuyển', 'Shuttle', 3],
    ['bus', 'Xe buýt', 'Bus', 4],
    ['motorbike_rental', 'Thuê xe máy', 'Motorbike Rental', 5],
    ['bicycle_rental', 'Thuê xe đạp', 'Bicycle Rental', 6],
    ['electric_buggy', 'Xe điện', 'Electric Buggy', 7],
    ['ferry', 'Phà', 'Ferry', 8],
    ['cano', 'Cano', 'Speedboat (Cano)', 9],
    ['speedboat', 'Tàu cao tốc', 'Speedboat', 10],
    ['yacht_charter', 'Thuê du thuyền', 'Yacht Charter', 11],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "pricing_model" AS ENUM ('fixed','starting_from','per_km','per_hour','per_person','per_vehicle','contact')`,
    );

    // ---- transport_types (từ điển, THAY ENUM cho đúng trục phải mở rộng được — ADR-017) ----
    await queryRunner.query(`
      CREATE TABLE "transport_types" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "code" varchar(60) NOT NULL,
        "label_vi" varchar(120) NOT NULL,
        "label_en" varchar(120),
        "icon" varchar(120),
        "parent_id" uuid REFERENCES "transport_types"("id") ON DELETE NO ACTION,
        "sort_order" int NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_transport_types_code" ON "transport_types" ("code")`);
    await queryRunner.query(`CREATE INDEX "idx_transport_types_parent" ON "transport_types" ("parent_id")`);

    // ---- place_transport_details (1:1, PK=FK=place_id) ----
    await queryRunner.query(`
      CREATE TABLE "place_transport_details" (
        "place_id" uuid PRIMARY KEY REFERENCES "places"("id") ON DELETE CASCADE,
        "transport_type_id" uuid NOT NULL REFERENCES "transport_types"("id") ON DELETE NO ACTION,
        "provider_business_id" uuid REFERENCES "places"("id") ON DELETE NO ACTION,
        "pricing_model" "pricing_model",
        "price_ref" numeric(12,2),
        "price_currency" char(3) NOT NULL DEFAULT 'VND',
        "price_unit" varchar(40),
        "capacity_passengers" smallint,
        "booking_required" boolean,
        "airport_transfer" boolean,
        "booking_note" varchar(300),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_transport_price_nonneg" CHECK ("price_ref" IS NULL OR "price_ref" >= 0),
        CONSTRAINT "chk_transport_capacity_nonneg" CHECK ("capacity_passengers" IS NULL OR "capacity_passengers" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_transport_details_type" ON "place_transport_details" ("transport_type_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_transport_details_provider" ON "place_transport_details" ("provider_business_id") WHERE "provider_business_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_transport_details_pricing_model" ON "place_transport_details" ("pricing_model") WHERE "pricing_model" IS NOT NULL`,
    );

    // ---- transport_service_options (1:N, gói dịch vụ/mức giá — cùng khuôn hotel_room_types) ----
    await queryRunner.query(`
      CREATE TABLE "transport_service_options" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "place_id" uuid NOT NULL REFERENCES "places"("id") ON DELETE CASCADE,
        "name" varchar(120) NOT NULL,
        "capacity_passengers" smallint,
        "price_ref" numeric(12,2),
        "price_currency" char(3) NOT NULL DEFAULT 'VND',
        "price_unit" varchar(40),
        "valid_from" timestamptz,
        "valid_to" timestamptz,
        "sort_order" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_transport_option_price_nonneg" CHECK ("price_ref" IS NULL OR "price_ref" >= 0),
        CONSTRAINT "chk_transport_option_capacity_nonneg" CHECK ("capacity_passengers" IS NULL OR "capacity_passengers" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_transport_options_place" ON "transport_service_options" ("place_id","sort_order")`,
    );

    // ---- transport_routes (1:N, tuyến cố định tuỳ chọn — cùng khuôn tour_stops) ----
    await queryRunner.query(`
      CREATE TABLE "transport_routes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "place_id" uuid NOT NULL REFERENCES "places"("id") ON DELETE CASCADE,
        "origin_label" varchar(160) NOT NULL,
        "origin_location" geography(Point,4326),
        "destination_label" varchar(160) NOT NULL,
        "destination_location" geography(Point,4326),
        "note" varchar(300),
        "sort_order" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_transport_route_distinct_labels" CHECK ("origin_label" <> "destination_label")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_transport_routes_place" ON "transport_routes" ("place_id","sort_order")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_transport_routes_origin_location" ON "transport_routes" USING GIST ("origin_location") WHERE "origin_location" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_transport_routes_destination_location" ON "transport_routes" USING GIST ("destination_location") WHERE "destination_location" IS NOT NULL`,
    );

    // ---- transport_service_areas (junction, tái dùng places.ward tự do — KHÔNG từ điển mới) ----
    await queryRunner.query(`
      CREATE TABLE "transport_service_areas" (
        "place_id" uuid NOT NULL REFERENCES "places"("id") ON DELETE CASCADE,
        "ward" varchar(120) NOT NULL,
        PRIMARY KEY ("place_id","ward")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_transport_service_areas_ward" ON "transport_service_areas" ("ward")`);

    // ---- Seed: từ điển transport_types (tham chiếu) + category 'transport' (đúng vị trí InitTour
    // seed category 'tour' của nó) ----
    for (const [code, nameVi, nameEn, sortOrder] of this.transportTypes) {
      await queryRunner.query(
        `INSERT INTO "transport_types" ("code","label_vi","label_en","sort_order")
         VALUES ($1,$2,$3,$4)
         ON CONFLICT ("code") DO NOTHING`,
        [code, nameVi, nameEn, sortOrder],
      );
    }
    await queryRunner.query(
      `INSERT INTO "categories" ("slug","name_vi","name_en","icon")
       VALUES ('transport','Di chuyển','Transport','car')
       ON CONFLICT ("slug") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "categories" WHERE "slug" = 'transport'`);
    await queryRunner.query(`DROP TABLE IF EXISTS "transport_service_areas"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "transport_routes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "transport_service_options"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "place_transport_details"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "transport_types"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "pricing_model"`);
  }
}
