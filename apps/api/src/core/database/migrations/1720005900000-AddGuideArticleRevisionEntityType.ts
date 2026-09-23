import { MigrationInterface, QueryRunner } from 'typeorm';

// Phú Quốc Guide CMS candidate (2026-09-18). Adds the ONE missing revision_entity_type value a
// guide article draft/publish needs to record a revision: 'guide_article'. Same additive,
// non-destructive shape as AddNeedsChangesRevisionStatus1720005100000 — ADD VALUE only, no
// existing row touched.
//
// down() intentionally does NOT attempt to remove the enum value — Postgres has no
// `ALTER TYPE ... DROP VALUE`, and GuideArticleSchema's own down() (run first on rollback) already
// deletes every guide_articles/guide_blocks row before this value could ever be referenced again.
export class AddGuideArticleRevisionEntityType1720005900000 implements MigrationInterface {
  name = 'AddGuideArticleRevisionEntityType1720005900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "revision_entity_type" ADD VALUE IF NOT EXISTS 'guide_article'`);
  }

  public async down(): Promise<void> {
    // No-op by design — see class comment.
  }
}
