import { MigrationInterface, QueryRunner } from 'typeorm';

// Wave 1 — cluster Place: places (+PostGIS geography, GIST, FTS unaccent),
// place_faqs/seo/ai_summary, media (exclusive arc), contacts & price_history (polymorphic).
export class InitPlaces1720000400000 implements MigrationInterface {
  name = 'InitPlaces1720000400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- Enums ----
    await queryRunner.query(`CREATE TYPE "place_status" AS ENUM ('draft','pending','published','archived')`);
    await queryRunner.query(`CREATE TYPE "price_range" AS ENUM ('free','low','mid','high')`);
    await queryRunner.query(
      `CREATE TYPE "verification_status" AS ENUM ('pending','verified','official','community_verified','expired','rejected')`,
    );
    await queryRunner.query(`CREATE TYPE "faq_status" AS ENUM ('pending','published','hidden')`);
    await queryRunner.query(`CREATE TYPE "ai_summary_status" AS ENUM ('generating','ready','stale','rejected')`);
    await queryRunner.query(`CREATE TYPE "media_type" AS ENUM ('image','video')`);
    await queryRunner.query(`CREATE TYPE "media_provider" AS ENUM ('upload','youtube','vimeo')`);
    await queryRunner.query(`CREATE TYPE "media_status" AS ENUM ('pending','published','hidden','rejected')`);

    // ---- immutable_unaccent: unaccent gốc là STABLE → không dùng trực tiếp trong index.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text
        LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS
      $$ SELECT unaccent('unaccent', $1) $$
    `);

    // ---- places ----
    await queryRunner.query(`
      CREATE TABLE "places" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(200) NOT NULL,
        "slug" varchar(220) NOT NULL,
        "category_id" uuid NOT NULL REFERENCES "categories"("id") ON DELETE NO ACTION,
        "location" geography(Point,4326) NOT NULL,
        "address" varchar(300),
        "ward" varchar(120),
        "description" text,
        "short_description" varchar(300),
        "opening_hours" jsonb,
        "price_range" "price_range",
        "cover_image_id" uuid,
        "rating_avg" numeric(2,1),
        "rating_count" int NOT NULL DEFAULT 0,
        "view_count" bigint NOT NULL DEFAULT 0,
        "status" "place_status" NOT NULL,
        "verification_status" "verification_status" NOT NULL DEFAULT 'pending',
        "verified_at" timestamptz,
        "osm_id" bigint,
        "created_by" uuid REFERENCES "users"("id") ON DELETE NO ACTION,
        "updated_by" uuid REFERENCES "users"("id") ON DELETE NO ACTION,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_places_slug" ON "places" ("slug")`);
    await queryRunner.query(`CREATE INDEX "idx_places_category_status" ON "places" ("category_id","status")`);
    await queryRunner.query(`CREATE INDEX "idx_places_location" ON "places" USING GIST ("location")`);
    await queryRunner.query(`
      CREATE INDEX "idx_places_fts" ON "places"
      USING GIN (to_tsvector('simple', immutable_unaccent(coalesce("name",'') || ' ' || coalesce("description",''))))
    `);

    // ---- media (exclusive arc 5 nhánh; review_id/post_id/event_id chưa FK — bảng đích Wave sau) ----
    // ADR-009 + event_id (ADR-003/ADR-002) — database.md §3.5.
    await queryRunner.query(`
      CREATE TABLE "media" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "place_id" uuid REFERENCES "places"("id") ON DELETE CASCADE,
        "review_id" uuid,
        "post_id" uuid,
        "business_id" uuid REFERENCES "places"("id") ON DELETE CASCADE,
        "event_id" uuid,
        "type" "media_type" NOT NULL,
        "url" varchar(500) NOT NULL,
        "thumbnail_url" varchar(500),
        "provider" "media_provider" NOT NULL,
        "external_id" varchar(100),
        "width" int, "height" int, "duration" int,
        "caption" varchar(300), "alt_text" varchar(200), "sort_order" int,
        "status" "media_status" NOT NULL DEFAULT 'pending',
        "ai_moderation_score" numeric(4,3),
        "ai_labels" jsonb,
        "uploaded_by" uuid REFERENCES "users"("id") ON DELETE NO ACTION,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "chk_media_one_owner" CHECK (
          ("place_id" IS NOT NULL)::int + ("review_id" IS NOT NULL)::int
          + ("post_id" IS NOT NULL)::int + ("business_id" IS NOT NULL)::int
          + ("event_id" IS NOT NULL)::int = 1
        )
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_media_place" ON "media" ("place_id") WHERE "place_id" IS NOT NULL`);
    await queryRunner.query(
      `CREATE INDEX "idx_media_business" ON "media" ("business_id") WHERE "business_id" IS NOT NULL`,
    );
    // Gallery Sự kiện (database.md §3.5): partial + (event_id, sort_order).
    await queryRunner.query(`CREATE INDEX "idx_media_event" ON "media" ("event_id") WHERE "event_id" IS NOT NULL`);
    await queryRunner.query(
      `CREATE INDEX "idx_media_event_sort" ON "media" ("event_id","sort_order") WHERE "event_id" IS NOT NULL`,
    );
    await queryRunner.query(`CREATE INDEX "idx_media_status" ON "media" ("status")`);

    // Cover image FK (đặt sau vì vòng places↔media).
    await queryRunner.query(
      `ALTER TABLE "places" ADD CONSTRAINT "fk_places_cover_image" FOREIGN KEY ("cover_image_id") REFERENCES "media"("id") ON DELETE SET NULL`,
    );

    // ---- place_faqs / place_seo / place_ai_summary ----
    await queryRunner.query(`
      CREATE TABLE "place_faqs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "place_id" uuid NOT NULL REFERENCES "places"("id") ON DELETE CASCADE,
        "question" varchar(300) NOT NULL,
        "answer" text NOT NULL,
        "sort_order" int,
        "is_ai_generated" boolean NOT NULL DEFAULT false,
        "status" "faq_status" NOT NULL DEFAULT 'pending',
        "created_by" uuid REFERENCES "users"("id") ON DELETE NO ACTION,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_place_faqs_place" ON "place_faqs" ("place_id")`);

    await queryRunner.query(`
      CREATE TABLE "place_seo" (
        "place_id" uuid PRIMARY KEY REFERENCES "places"("id") ON DELETE CASCADE,
        "meta_title" varchar(160), "meta_description" varchar(320), "meta_keywords" varchar(300),
        "canonical_url" varchar(300), "og_title" varchar(160), "og_description" varchar(320),
        "og_image_url" varchar(500),
        "no_index" boolean NOT NULL DEFAULT false,
        "structured_data" jsonb,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "place_ai_summary" (
        "place_id" uuid PRIMARY KEY REFERENCES "places"("id") ON DELETE CASCADE,
        "summary" text, "highlights" jsonb, "model" varchar(80), "prompt_version" varchar(40),
        "source_hash" varchar(64), "language" char(2),
        "status" "ai_summary_status" NOT NULL DEFAULT 'generating',
        "is_approved" boolean NOT NULL DEFAULT false,
        "generated_at" timestamptz,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // ---- contacts (polymorphic) ----
    await queryRunner.query(`
      CREATE TABLE "contacts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "owner_type" varchar(30) NOT NULL,
        "owner_id" uuid NOT NULL,
        "contact_type" varchar(30) NOT NULL,
        "value" varchar(300) NOT NULL,
        "label" varchar(120),
        "is_primary" boolean NOT NULL DEFAULT false,
        "verification_status" "verification_status" NOT NULL DEFAULT 'pending',
        "verified_at" timestamptz,
        "display_order" int NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_contacts_owner" ON "contacts" ("owner_type","owner_id")`);
    await queryRunner.query(
      `CREATE INDEX "idx_contacts_owner_type" ON "contacts" ("owner_type","owner_id","contact_type")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_contacts_primary" ON "contacts" ("owner_type","owner_id","contact_type") WHERE "is_primary" AND "deleted_at" IS NULL`,
    );

    // ---- price_history (polymorphic, append-only) ----
    await queryRunner.query(`
      CREATE TABLE "price_history" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "entity_type" varchar(30) NOT NULL,
        "entity_id" uuid NOT NULL,
        "service_name" varchar(120) NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "currency" char(3) NOT NULL DEFAULT 'VND',
        "unit" varchar(40),
        "is_free" boolean NOT NULL DEFAULT false,
        "description" varchar(300),
        "display_order" int NOT NULL DEFAULT 0,
        "valid_from" timestamptz, "valid_to" timestamptz,
        "source_id" uuid,
        "verification_status" "verification_status" NOT NULL DEFAULT 'pending',
        "verified_at" timestamptz,
        "updated_by" uuid REFERENCES "users"("id") ON DELETE NO ACTION,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "chk_price_amount_nonneg" CHECK ("amount" >= 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_price_entity" ON "price_history" ("entity_type","entity_id")`);
    await queryRunner.query(
      `CREATE INDEX "idx_price_entity_service" ON "price_history" ("entity_type","entity_id","service_name")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_price_entity_validto" ON "price_history" ("entity_type","entity_id","valid_to")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "places" DROP CONSTRAINT IF EXISTS "fk_places_cover_image"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "price_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "contacts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "place_ai_summary"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "place_seo"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "place_faqs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "media"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "places"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS immutable_unaccent(text)`);
    await queryRunner.query(`DROP TYPE IF EXISTS "media_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "media_provider"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "media_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "ai_summary_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "faq_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "verification_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "price_range"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "place_status"`);
  }
}
