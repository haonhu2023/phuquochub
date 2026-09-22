import { MigrationInterface, QueryRunner } from 'typeorm';

// Phú Quốc Guide CMS candidate (2026-09-18). Creates guide_articles + guide_blocks — a
// structured (no free-HTML) long-form content type: one row per (slug, locale) article, an
// ordered set of typed blocks underneath. Idempotent via IF NOT EXISTS / DO $$ ... EXCEPTION WHEN
// duplicate_object, same idiom as ContactImportBatch1720005500000.
//
// content_version (guide_articles) is the CAS counter GuideArticlesService.saveDraft()/publish()
// gate their conditional UPDATE on — same optimistic-concurrency idea as
// PlaceTranslationsRepository.updateReviewState()'s conditional UPDATE, expressed as an integer
// counter instead of a state-transition check because arbitrary content edits (not just
// draft→published) need the same protection here.
export class GuideArticleSchema1720006000000 implements MigrationInterface {
  name = 'GuideArticleSchema1720006000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "guide_article_status" AS ENUM ('draft','published');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "guide_block_type" AS ENUM (
          'section_heading','rich_text','place_collection','callout','faq','image_with_rights'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "guide_articles" (
        "id"               UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
        "slug"             VARCHAR(160)      NOT NULL,
        "locale"           VARCHAR(5)        NOT NULL,
        "title"            VARCHAR(200)      NOT NULL,
        "intro"            VARCHAR(500),
        "hero_media_id"    UUID              REFERENCES "media"("id") ON DELETE SET NULL,
        "status"           "guide_article_status" NOT NULL DEFAULT 'draft',
        "content_version"  INTEGER           NOT NULL DEFAULT 1,
        "author_id"        UUID              NOT NULL REFERENCES "users"("id"),
        "created_at"       TIMESTAMPTZ       NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMPTZ       NOT NULL DEFAULT now(),
        "published_at"     TIMESTAMPTZ,
        "published_by"     UUID,
        UNIQUE ("slug", "locale")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "guide_blocks" (
        "id"               UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
        "article_id"       UUID              NOT NULL
                            REFERENCES "guide_articles"("id") ON DELETE CASCADE,
        "position"         INTEGER           NOT NULL,
        "block_type"       "guide_block_type" NOT NULL,
        "content"          JSONB             NOT NULL,
        "needs_decision"   BOOLEAN           NOT NULL DEFAULT false,
        "decision_note"    VARCHAR(300),
        "created_at"       TIMESTAMPTZ       NOT NULL DEFAULT now(),
        "updated_at"       TIMESTAMPTZ       NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_guide_articles_status"
        ON "guide_articles"("status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_guide_blocks_article_position"
        ON "guide_blocks"("article_id","position")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "guide_blocks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "guide_articles"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "guide_block_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "guide_article_status"`);
  }
}
