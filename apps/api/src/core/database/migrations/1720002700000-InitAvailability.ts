import { MigrationInterface, QueryRunner } from 'typeorm';

// Booking Availability & Inventory Foundation. 2 bang moi, hoan toan doc lap voi bookings/
// booking_items da phat hanh (khong sua migration cu nao).
//
// availability_slots: dung luong bookable cho MOT entity (hotel/restaurant/tour/event/transport)
// tai MOT khung thoi gian - entity_type/entity_id la tham chieu DA HINH (cung nguyen mau
// bookings.entity_type/entity_id, ban than cung nguyen mau price_history.entity_type, ADR-006 -
// mot ngoai le co kiem soat cua ADR-003). place_id la FK that (ON DELETE NO ACTION, cung ly do
// bookings.place_id: Place la thuc the loi ADR-001, availability slot la ban ghi van hanh khong
// duoc bien mat ngam neu Place bi xoa cung).
//
// inventory_holds: giu cho TAM THOI tren MOT slot, gan voi DUNG MOT booking (UNIQUE booking_id -
// mot booking chi co toi da mot hold o Foundation nay). FK CASCADE ve ca hai chieu (slot va
// booking) - mot hold khong co y nghia doc lap voi slot/booking cua no, khac bookings.place_id
// (NO ACTION) vi hold khong phai ban ghi tai chinh/audit doc lap.
export class InitAvailability1720002700000 implements MigrationInterface {
  name = 'InitAvailability1720002700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "inventory_hold_status" AS ENUM ('active','expired','released','confirmed')`,
    );

    // ---- availability_slots ----
    await queryRunner.query(`
      CREATE TABLE "availability_slots" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "entity_type" varchar(30) NOT NULL,
        "entity_id" uuid NOT NULL,
        "place_id" uuid NOT NULL REFERENCES "places"("id") ON DELETE NO ACTION,
        "slot_start" timestamptz NOT NULL,
        "slot_end" timestamptz,
        "total_capacity" int NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_availability_slots_entity_start" UNIQUE ("entity_type","entity_id","slot_start"),
        CONSTRAINT "chk_availability_slots_capacity" CHECK ("total_capacity" > 0)
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_availability_slots_entity" ON "availability_slots" ("entity_type","entity_id")`,
    );
    await queryRunner.query(`CREATE INDEX "idx_availability_slots_place" ON "availability_slots" ("place_id")`);
    // Truy vấn "còn chỗ trong khoảng ngày X-Y" (date-range filter, GET /availability-slots) —
    // cùng lý do idx_bookings_service_start đã có ở InitBooking.
    await queryRunner.query(`CREATE INDEX "idx_availability_slots_start" ON "availability_slots" ("slot_start")`);

    // ---- inventory_holds ----
    await queryRunner.query(`
      CREATE TABLE "inventory_holds" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "availability_slot_id" uuid NOT NULL REFERENCES "availability_slots"("id") ON DELETE CASCADE,
        "booking_id" uuid NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
        "quantity" int NOT NULL,
        "status" "inventory_hold_status" NOT NULL DEFAULT 'active',
        "expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_inventory_holds_booking" UNIQUE ("booking_id"),
        CONSTRAINT "chk_inventory_holds_quantity" CHECK ("quantity" > 0)
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_inventory_holds_slot" ON "inventory_holds" ("availability_slot_id")`);
    // Sweep định kỳ tương lai ("mọi hold active đã quá expires_at") — cùng nguyên tắc thêm index
    // ngay từ đầu cho truy vấn quản trị đã biết trước, thay vì vá sau (idx_bookings_status).
    await queryRunner.query(`CREATE INDEX "idx_inventory_holds_status" ON "inventory_holds" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_holds"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "availability_slots"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "inventory_hold_status"`);
  }
}
