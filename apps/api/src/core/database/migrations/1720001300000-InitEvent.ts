import { MigrationInterface, QueryRunner } from 'typeorm';

// Sprint 3 · B4 — Event (ADR-002 PEER/Hybrid, KHÔNG phải Place extension). data-dictionary §12:
// events + event_occurrences(1:N CASCADE). Đồng thời gắn FK media.event_id → events (arc thứ 5,
// ADR-009/003) giờ đã có bảng đích. time_status suy diễn (không lưu).
export class InitEvent1720001300000 implements MigrationInterface {
  name = 'InitEvent1720001300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "event_status" AS ENUM ('draft','pending','published','archived')`);
    await queryRunner.query(`CREATE TYPE "event_status_override" AS ENUM ('cancelled','postponed')`);

    await queryRunner.query(`
      CREATE TABLE "events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "title" varchar(200) NOT NULL,
        "slug" varchar(220) NOT NULL,
        "description" text,
        "cover_media_id" uuid REFERENCES "media"("id") ON DELETE SET NULL,
        "start_at" timestamptz NOT NULL,
        "end_at" timestamptz NOT NULL,
        "timezone" varchar(40) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
        "place_id" uuid REFERENCES "places"("id") ON DELETE NO ACTION,
        "organizer_id" uuid REFERENCES "places"("id") ON DELETE NO ACTION,
        "event_category" varchar(60),
        "status" "event_status" NOT NULL DEFAULT 'draft',
        "status_override" "event_status_override",
        "recurrence_rule" varchar(300),
        "created_by" uuid REFERENCES "users"("id") ON DELETE NO ACTION,
        "updated_by" uuid REFERENCES "users"("id") ON DELETE NO ACTION,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "chk_events_time" CHECK ("start_at" < "end_at")
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_events_slug" ON "events" ("slug")`);
    await queryRunner.query(`CREATE INDEX "idx_events_time" ON "events" ("start_at","end_at")`);
    await queryRunner.query(`CREATE INDEX "idx_events_place" ON "events" ("place_id")`);
    await queryRunner.query(`CREATE INDEX "idx_events_organizer" ON "events" ("organizer_id")`);
    await queryRunner.query(
      `CREATE INDEX "idx_events_status" ON "events" ("status") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(`
      CREATE INDEX "idx_events_fts" ON "events"
      USING GIN (to_tsvector('simple', immutable_unaccent(coalesce("title",'') || ' ' || coalesce("description",''))))
    `);

    await queryRunner.query(`
      CREATE TABLE "event_occurrences" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
        "start_at" timestamptz NOT NULL,
        "end_at" timestamptz NOT NULL,
        "status_override" "event_status_override",
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_event_occ_time" CHECK ("start_at" < "end_at")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_event_occ_event" ON "event_occurrences" ("event_id","start_at")`,
    );

    // media.event_id → events (arc thứ 5; bảng đích giờ đã tồn tại).
    await queryRunner.query(
      `ALTER TABLE "media" ADD CONSTRAINT "fk_media_event" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "media" DROP CONSTRAINT IF EXISTS "fk_media_event"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "event_occurrences"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "events"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "event_status_override"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "event_status"`);
  }
}
