import { MigrationInterface, QueryRunner } from 'typeorm';

// Moderation M7 — AI Shadow Mode. ONE new table, `ai_recommendations`. NO change to
// `moderation_cases`, `reports`, `media`, or `reviews` — shadow mode stores its own recommendations
// in a dedicated table rather than writing to `media.ai_moderation_score`/`ai_labels` (ADR-009),
// because a single-slot column can hold exactly one score and has no room for the moderator-outcome
// comparison this milestone requires (§EVENTS/§Decision comparison of the M7 spec) — a table keeps
// full history per case and lets multiple recommendations (re-runs, different providers/models) be
// compared over time without overwriting each other. See docs/99-decisions/ADR-018-moderation-
// foundation.md Addendum (M7) for the reasoning against the original D1/§13 sketch.
//
// `decision`/`moderator_decision` reuse the EXISTING `moderation_decision` enum type (created by
// InitModeration, 1720003200000) — no new enum, and the two columns stay directly comparable.
//
// `case_id` is a REAL FK + CASCADE to `moderation_cases` (same shape as `reports.case_id`) — a
// recommendation with no case is meaningless, and it is pure shadow-mode metadata, never a target
// of a public read path (INV-1 is untouched: nothing here is `media.status`/`reviews.status`).
export class AddAiRecommendations1720003500000 implements MigrationInterface {
  name = 'AddAiRecommendations1720003500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ai_recommendations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "case_id" uuid NOT NULL REFERENCES "moderation_cases"("id") ON DELETE CASCADE,
        "provider" varchar(100) NOT NULL,
        "model" varchar(100) NOT NULL,
        "decision" "moderation_decision" NOT NULL,
        "confidence" numeric(4,3) NOT NULL,
        "labels" jsonb,
        "reasoning" text,
        "prompt_version" varchar(50),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "evaluated_at" timestamptz,
        "moderator_decision" "moderation_decision",
        "matched" boolean,
        "latency_ms" int,
        "metadata" jsonb
      )
    `);

    // findLatestByCase() (ORDER BY created_at DESC LIMIT 1) + statistics GROUP BY case join.
    await queryRunner.query(
      `CREATE INDEX "idx_ai_recommendations_case" ON "ai_recommendations" ("case_id","created_at" DESC)`,
    );
    // Statistics queries filter "chưa evaluated" (WHERE evaluated_at IS NULL) and agreement-rate
    // aggregation (WHERE evaluated_at IS NOT NULL) — partial index keeps both scans cheap without
    // indexing the (small, mostly-non-null-eventually) full column twice.
    await queryRunner.query(
      `CREATE INDEX "idx_ai_recommendations_pending_eval" ON "ai_recommendations" ("case_id") WHERE "evaluated_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Shadow mode never mutates moderation_cases/media/reviews, so unlike InitModeration.down()
    // there is no decision history to protect here — recommendations are AI suggestions, not
    // moderator decisions. Dropping the table cannot destroy any real moderation outcome.
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_recommendations"`);
  }
}
