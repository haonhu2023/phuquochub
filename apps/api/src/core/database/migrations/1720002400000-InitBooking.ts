import { MigrationInterface, QueryRunner } from 'typeorm';

// Booking Request Foundation (audit-truoc-implement session, 2026-07-29). Vertical slice toi
// thieu: tao booking + doc theo booking_code cong khai. KHONG payment that, KHONG inventory
// realtime, KHONG commission/refund/invoice/settlement (xem docs/delivery/reports/
// MVP-BOOKING-FOUNDATION-2026-07-29.md).
//
// entity_type/entity_id la tham chieu DA HINH (ADR-003 ngoai le co kiem soat) toi mot Place ve
// tinh (hotel/restaurant/tour/event/transport) - dung nguyen mau `price_history.entity_type`
// (ADR-006, varchar(30) tu do, khong FK cung, toan ven cuong che tang app). place_id la FK that
// (ON DELETE NO ACTION, khong CASCADE - booking la ban ghi tai chinh/audit, khong duoc xoa ngam
// theo Place) vi Place la thuc the loi (ADR-001) va moi thu bookable deu la mot Place.
//
// booking_status/payment_status/fulfillment_status la BA cot tach rieng (khong gop) - vong doi
// booking, vong doi tien, va vong doi giao dich dich vu la ba khai niem khac nhau.
export class InitBooking1720002400000 implements MigrationInterface {
  name = 'InitBooking1720002400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "booking_status" AS ENUM ('pending','confirmed','cancelled','expired')`,
    );
    await queryRunner.query(
      `CREATE TYPE "booking_payment_status" AS ENUM ('unpaid','paid','refunded')`,
    );
    await queryRunner.query(
      `CREATE TYPE "booking_fulfillment_status" AS ENUM ('pending','fulfilled','no_show','cancelled')`,
    );

    // ---- bookings ----
    await queryRunner.query(`
      CREATE TABLE "bookings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "booking_code" varchar(20) NOT NULL,
        "booking_type" varchar(30),
        "entity_type" varchar(30) NOT NULL,
        "entity_id" uuid NOT NULL,
        "place_id" uuid NOT NULL REFERENCES "places"("id") ON DELETE NO ACTION,
        "customer_user_id" uuid REFERENCES "users"("id") ON DELETE NO ACTION,
        "currency_code" char(3) NOT NULL DEFAULT 'VND',
        "booking_status" "booking_status" NOT NULL DEFAULT 'pending',
        "payment_status" "booking_payment_status" NOT NULL DEFAULT 'unpaid',
        "fulfillment_status" "booking_fulfillment_status" NOT NULL DEFAULT 'pending',
        "service_start_at" timestamptz,
        "service_end_at" timestamptz,
        "party_size" int NOT NULL DEFAULT 1,
        "subtotal" numeric(12,2) NOT NULL DEFAULT 0,
        "discount" numeric(12,2) NOT NULL DEFAULT 0,
        "fees" numeric(12,2) NOT NULL DEFAULT 0,
        "grand_total" numeric(12,2) NOT NULL DEFAULT 0,
        "guest_note" text,
        "internal_note" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_bookings_code" UNIQUE ("booking_code"),
        CONSTRAINT "chk_bookings_party_size" CHECK ("party_size" > 0)
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_bookings_entity" ON "bookings" ("entity_type","entity_id")`);
    await queryRunner.query(
      `CREATE INDEX "idx_bookings_customer" ON "bookings" ("customer_user_id","created_at")`,
    );
    await queryRunner.query(`CREATE INDEX "idx_bookings_place" ON "bookings" ("place_id")`);
    // Truy vấn quản trị/tương lai lọc theo trạng thái ("mọi booking đang pending") và theo mốc
    // dịch vụ sắp tới ("booking trong 7 ngày tới") — cả hai đều rẻ, thêm ngay từ đầu thay vì vá sau.
    await queryRunner.query(`CREATE INDEX "idx_bookings_status" ON "bookings" ("booking_status")`);
    await queryRunner.query(
      `CREATE INDEX "idx_bookings_service_start" ON "bookings" ("service_start_at") WHERE "service_start_at" IS NOT NULL`,
    );

    // ---- booking_items (line item trong MOT booking - vd "2x ve nguoi lon", "3 dem Deluxe") ----
    await queryRunner.query(`
      CREATE TABLE "booking_items" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "booking_id" uuid NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
        "label" varchar(200) NOT NULL,
        "quantity" int NOT NULL DEFAULT 1,
        "unit_price" numeric(12,2) NOT NULL DEFAULT 0,
        "subtotal" numeric(12,2) NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_booking_items_quantity" CHECK ("quantity" > 0)
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_booking_items_booking" ON "booking_items" ("booking_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "booking_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bookings"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "booking_fulfillment_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "booking_payment_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "booking_status"`);
  }
}
