import { MigrationInterface, QueryRunner } from 'typeorm';

// Place Translation Foundation (ADR-020) — i18n schema, vi/en first, locale-extensible without
// further migrations. Purely additive: no column added to `places` or any existing table
// (docs/data/modules/places.md's own long-open question, and owner decision #1: normalized
// locale-scoped tables, never `name_vi`/`name_en` columns).
//
// FOUR NEW TABLES, ONE ENUM EXTENSION
// ------------------------------------
//   supported_locales        -- config-driven locale set (BCP-47); vi/en seeded ACTIVE, nothing
//                                else hardcoded to "only two locales" anywhere in this migration.
//   place_translations        -- one row per (place, field, locale) PER REVISION; only one row per
//                                (place_id, field_key, locale_code) may have is_current=true
//                                (partial unique index, not a plain composite unique -- full
//                                history is kept, RULE-LANG-014/owner decision #6: no overwrite).
//   place_translation_routes  -- per-locale slug + redirect history (MAP-031).
//   place_translation_seo     -- per-locale SEO/hreflang (MAP-032); CHECK enforces "no English SEO
//                                silently reusing Vietnamese text" at the schema level, not just in
//                                application code.
//   revision_entity_type      -- ADD VALUE 'place_translation' (existing enum, additive, per the
//                                entity's own header comment: "mở rộng = THÊM giá trị enum -- không
//                                đổi schema").
//
// Every FK/CHECK/index name below matches this repo's existing prefix convention (ck_/uq_/idx_)
// exactly as used in InitVerifications/InitPlaces/StrengthenPlaceInformationModel.
//
// Contract source: 03_Import_Queue.xlsx (03_TRANSLATION_QUEUE, 03_FIELD_MAPPING MAP-028..034),
// 11_Multilingual_Content.xlsx (11_LANGUAGES, 11_TRANSLATABLE_FIELDS, 11_CONTENT_TRANSLATIONS,
// 11_ROUTE_SLUGS, 11_SEO_METADATA, 11_FALLBACK_RULES, 11_TRANSLATION_RULES). Full column-by-column
// justification: docs/99-decisions/ADR-020-place-translation-model.md.
export class InitPlaceTranslations1720004600000 implements MigrationInterface {
  name = 'InitPlaceTranslations1720004600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- revision_entity_type: ADD VALUE only -- existing 'place' value and every existing
    // wiki_revisions row are untouched. Postgres requires ADD VALUE to run outside an explicit
    // multi-statement transaction block in older versions; TypeORM runs each migration inside its
    // own transaction by default, and PG 12+ (this repo's target, postgis/postgis:16-3.4 in
    // production) allows ADD VALUE inside a transaction as long as the new value is not used in the
    // SAME transaction -- which it is not: no row using 'place_translation' is written by this
    // migration. ----
    await queryRunner.query(`ALTER TYPE "revision_entity_type" ADD VALUE 'place_translation'`);

    // ---- supported_locales ----
    await queryRunner.query(`CREATE TYPE "locale_direction" AS ENUM ('ltr','rtl')`);
    await queryRunner.query(
      `CREATE TYPE "locale_role" AS ENUM ('source_default','target_primary','target_future')`,
    );
    await queryRunner.query(`CREATE TYPE "locale_status" AS ENUM ('active','planned','inactive')`);

    await queryRunner.query(`
      CREATE TABLE "supported_locales" (
        "locale_code" varchar(35) PRIMARY KEY,
        "language_name_en" varchar(100) NOT NULL,
        "native_name" varchar(100) NOT NULL,
        "direction" "locale_direction" NOT NULL DEFAULT 'ltr',
        "role" "locale_role" NOT NULL,
        "status" "locale_status" NOT NULL DEFAULT 'planned',
        "is_default" boolean NOT NULL DEFAULT false,
        "is_public" boolean NOT NULL DEFAULT false,
        "is_production_data" boolean NOT NULL DEFAULT false,
        "fallback_locale_code" varchar(35) REFERENCES "supported_locales"("locale_code") ON DELETE NO ACTION,
        "effective_from" timestamptz,
        "effective_to" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_locale_fallback_not_self" CHECK ("fallback_locale_code" IS NULL OR "fallback_locale_code" <> "locale_code"),
        -- MAP-033: "Ngôn ngữ PLANNED không được coi là bắt buộc hoặc production" -- enforced here,
        -- not only in application code, so a future direct SQL write cannot silently violate it.
        CONSTRAINT "ck_locale_planned_not_public" CHECK (
          "status" <> 'planned' OR ("is_public" = false AND "is_production_data" = false)
        )
      )
    `);
    // Exactly one default locale, enforced by the database (partial unique index over a boolean
    // that is only ever true for one row).
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_locale_default" ON "supported_locales" ("is_default") WHERE "is_default"`,
    );
    await queryRunner.query(`CREATE INDEX "idx_locale_status" ON "supported_locales" ("status")`);

    // Seed exactly the two locales the contract (11_LANGUAGES) marks ACTIVE today. The seven
    // PLANNED locales already present as DATA ROWS in 11_LANGUAGES (fr/de/ru/ko/ja/zh-Hans/th) are
    // deliberately NOT seeded here -- no evidence any of them needs to exist in this database yet,
    // and adding one later is a data change, not a migration (owner decision #3).
    await queryRunner.query(`
      INSERT INTO "supported_locales"
        ("locale_code","language_name_en","native_name","direction","role","status","is_default","is_public","is_production_data","fallback_locale_code")
      VALUES
        ('vi','Vietnamese','Tiếng Việt','ltr','source_default','active',true,true,true,NULL),
        ('en','English','English','ltr','target_primary','active',false,true,true,'vi')
    `);

    // ---- place_translations (MAP-028/029/030) ----
    await queryRunner.query(
      `CREATE TYPE "translation_method" AS ENUM ('original','human','ai_plus_human','official_or_human')`,
    );
    await queryRunner.query(`CREATE TYPE "text_format" AS ENUM ('plain_text','markdown')`);

    await queryRunner.query(`
      CREATE TABLE "place_translations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "place_id" uuid NOT NULL REFERENCES "places"("id") ON DELETE CASCADE,
        "field_key" varchar(60) NOT NULL,
        "locale_code" varchar(35) NOT NULL REFERENCES "supported_locales"("locale_code") ON DELETE NO ACTION,
        "source_locale_code" varchar(35) NOT NULL REFERENCES "supported_locales"("locale_code") ON DELETE NO ACTION,
        "translated_text" text NOT NULL,
        "text_format" "text_format" NOT NULL DEFAULT 'plain_text',
        "source_text_hash" char(64) NOT NULL,
        "translation_method" "translation_method" NOT NULL,
        "translation_status" varchar(40) NOT NULL,
        "human_review_status" varchar(40) NOT NULL,
        "quality_gate" varchar(40) NOT NULL,
        "revision_id" uuid NOT NULL REFERENCES "wiki_revisions"("id") ON DELETE NO ACTION,
        "supersedes_translation_id" uuid REFERENCES "place_translations"("id") ON DELETE NO ACTION,
        "is_current" boolean NOT NULL DEFAULT false,
        "is_public" boolean NOT NULL DEFAULT false,
        "is_production_data" boolean NOT NULL DEFAULT false,
        "production_eligible" boolean NOT NULL DEFAULT false,
        "source_id" uuid REFERENCES "sources"("id") ON DELETE SET NULL,
        "evidence_id" uuid,
        "import_batch_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        -- RULE-LANG-003 (AI requires human review): an AI-authored row may exist (dry-run/pending
        -- review), but it cannot ALSO be marked publish-ready. This is a floor, not the full gate
        -- logic (which belongs in the service layer) -- the database refuses the one combination
        -- that must never reach production regardless of what the application intended to check.
        CONSTRAINT "ck_place_trans_ai_needs_review" CHECK (
          "translation_method" <> 'ai_plus_human' OR "human_review_status" = 'APPROVED' OR "is_production_data" = false
        )
      )
    `);
    // MAP-028: "unique per entity/field/language" -- scoped to the CURRENT row, since full revision
    // history is retained (the same composite key legitimately repeats once per revision).
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_place_trans_current" ON "place_translations" ("place_id","field_key","locale_code")
      WHERE "is_current"
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_place_trans_read" ON "place_translations" ("place_id","locale_code") WHERE "is_current"`,
    );
    await queryRunner.query(`CREATE INDEX "idx_place_trans_revision" ON "place_translations" ("revision_id")`);
    await queryRunner.query(
      `CREATE INDEX "idx_place_trans_batch" ON "place_translations" ("import_batch_id") WHERE "import_batch_id" IS NOT NULL`,
    );

    // ---- place_translation_routes (MAP-031) ----
    await queryRunner.query(`
      CREATE TABLE "place_translation_routes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "place_id" uuid NOT NULL REFERENCES "places"("id") ON DELETE CASCADE,
        "locale_code" varchar(35) NOT NULL REFERENCES "supported_locales"("locale_code") ON DELETE NO ACTION,
        "localized_slug" varchar(220) NOT NULL,
        "full_path" varchar(300) NOT NULL,
        "canonical_url" varchar(300) NOT NULL,
        "is_canonical" boolean NOT NULL DEFAULT true,
        "redirect_from_slug" varchar(220),
        "is_redirect" boolean NOT NULL DEFAULT false,
        "revision_id" uuid NOT NULL REFERENCES "wiki_revisions"("id") ON DELETE NO ACTION,
        "is_current" boolean NOT NULL DEFAULT false,
        "is_public" boolean NOT NULL DEFAULT false,
        "is_production_data" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    // Slug uniqueness is scoped PER LOCALE (MAP-031) -- vi and en may share a slug string.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_place_route_slug_current" ON "place_translation_routes" ("locale_code","localized_slug")
      WHERE "is_current"
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_place_route_place" ON "place_translation_routes" ("place_id","locale_code") WHERE "is_current"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_place_route_redirect" ON "place_translation_routes" ("locale_code","redirect_from_slug") WHERE "is_redirect"`,
    );

    // ---- place_translation_seo (MAP-032) ----
    await queryRunner.query(`
      CREATE TABLE "place_translation_seo" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "place_id" uuid NOT NULL REFERENCES "places"("id") ON DELETE CASCADE,
        "locale_code" varchar(35) NOT NULL REFERENCES "supported_locales"("locale_code") ON DELETE NO ACTION,
        "seo_title" varchar(160),
        "seo_description" varchar(320),
        "canonical_url" varchar(300) NOT NULL,
        "hreflang_group_id" uuid NOT NULL,
        "robots_index" boolean NOT NULL DEFAULT false,
        "robots_follow" boolean NOT NULL DEFAULT true,
        "og_title" varchar(160),
        "og_description" varchar(320),
        "translation_id_title" uuid REFERENCES "place_translations"("id") ON DELETE SET NULL,
        "translation_id_description" uuid REFERENCES "place_translations"("id") ON DELETE SET NULL,
        "revision_id" uuid NOT NULL REFERENCES "wiki_revisions"("id") ON DELETE NO ACTION,
        "is_current" boolean NOT NULL DEFAULT false,
        "is_public" boolean NOT NULL DEFAULT false,
        "is_production_data" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        -- MAP-032: "Không fallback SEO tiếng Anh sang tiếng Việt" -- schema-level floor: a row may
        -- not be marked indexable unless it is backed by its OWN locale's approved translation.
        CONSTRAINT "ck_place_seo_index_needs_translation" CHECK (
          "robots_index" = false OR "translation_id_title" IS NOT NULL
        )
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_place_seo_current" ON "place_translation_seo" ("place_id","locale_code") WHERE "is_current"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_place_seo_hreflang" ON "place_translation_seo" ("hreflang_group_id") WHERE "is_current"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Same self-refusal precedent as InitVerifications1720004000000.down(): if any real translation
    // has ever been written, dropping these tables destroys revision history that cannot be
    // reconstructed from any other table (audit_logs does not carry translated_text/source_text_hash
    // detail). Resolve manually before reverting.
    const [{ count }]: Array<{ count: string }> = await queryRunner.query(
      `SELECT count(*)::int AS count FROM "place_translations"`,
    );
    if (Number(count) > 0) {
      throw new Error(
        `InitPlaceTranslations1720004600000.down() refused: ${count} place_translations row(s) ` +
          `already exist. Reverting would permanently destroy translation content and revision ` +
          `history that cannot be reconstructed from any other table. Resolve manually before ` +
          `reverting this migration.`,
      );
    }

    await queryRunner.query(`DROP TABLE IF EXISTS "place_translation_seo"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "place_translation_routes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "place_translations"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "text_format"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "translation_method"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "supported_locales"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "locale_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "locale_role"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "locale_direction"`);

    // NOTE: Postgres cannot DROP a single enum VALUE ('place_translation' from
    // revision_entity_type) without recreating the whole type. Left in place on down() -- an
    // unused enum value is harmless (no row references it once place_translations is gone above),
    // and forcibly stripping it would require rewriting wiki_revisions' column type, touching a
    // table this migration does not own and must not risk locking/rewriting.
  }
}
