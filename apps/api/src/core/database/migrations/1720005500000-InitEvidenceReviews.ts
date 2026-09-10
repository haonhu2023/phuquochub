import { MigrationInterface, QueryRunner } from 'typeorm';

// Opening-Hours Evidence Governance v1 (OPENING_HOURS_OFFICIAL_STABLE_V1 policy). Closes the gap
// `evidence-trust.ts` and `evidence-artifact.entity.ts` both already flag explicitly: there is no
// real write path anywhere in this codebase that ever moves `evidence_artifacts.verification_status`
// to a gate-passing value through an actual human review — its meaning has been a pure convention
// trusted to whoever called `EvidenceService.ensureEvidenceArtifact` (i.e. bulk import/backfill
// scripts, never a reviewer). This migration adds the missing audit trail table plus the minimal
// denormalized "current state" columns on `evidence_artifacts` that let `PlacesRepository`'s Right
// Now / Trusted Nearby field-evidence gate enforce a time-boxed freshness window without an extra
// join on every read.
//
// Modeled on `verifications`/`verification_events` (InitVerifications, 1720004000000) — the closest
// existing append-only-audit + denormalized-current-state pair in this schema — but simpler: no CAS
// `lock_version` (evidence_reviews rows are never updated after insert, only ever appended; a second
// review of the same artifact is a NEW row, not a mutation of the first), and idempotency is by
// approval-receipt digest rather than optimistic concurrency, since the caller here is a single
// human-approval submission, not a contended multi-actor transition.
//
// `evidence_reviews` is PURELY append-only — every decision (APPROVE/NEEDS_CHANGES/REJECT) is
// recorded, never overwritten or deleted, even when it does not move `evidence_artifacts` to
// VERIFIED. Only an APPROVE that also clears the policy evaluator moves the parent row's state
// (`EvidenceService.reviewEvidenceArtifact`, application layer) — this migration only shapes the
// schema, it enforces no policy logic itself beyond "an APPROVE row must record an expiry."
//
// Existing `evidence_artifacts` rows are NOT touched by this migration (no UPDATE statement here at
// all) — the new columns are added NULL and stay NULL until a real review happens under this policy.
// This is deliberate, not an oversight: POLICY V1 rule 8 ("chỉ áp dụng cho evidence được review sau
// migration; không tự động nâng evidence hiện có") means the ~52 evidence_artifacts rows already
// carrying a bulk-import-asserted VERIFIED status get NO backfilled `verification_expires_at` — so
// they naturally stop clearing the (now expiry-gated) Right Now / Trusted Nearby query the moment
// this ships, without their `verification_status` column itself ever being rewritten. That is the
// intended effect of this feature, not a side effect to guard against.
export class InitEvidenceReviews1720005500000 implements MigrationInterface {
  name = 'InitEvidenceReviews1720005500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "evidence_reviews" (
        "id"                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "evidence_artifact_id"      UUID NOT NULL REFERENCES "evidence_artifacts" ("id") ON DELETE RESTRICT,
        "decision"                  VARCHAR(20) NOT NULL,
        "reviewer_name"             VARCHAR(150) NOT NULL,
        "reviewed_at"               TIMESTAMPTZ NOT NULL,
        "approval_artifact_sha256"  CHAR(64) NOT NULL,
        "claim_type"                VARCHAR(60) NOT NULL,
        "policy_key"                VARCHAR(80) NOT NULL,
        "policy_version"            VARCHAR(20) NOT NULL,
        "evidence_content_sha256"   CHAR(64) NOT NULL,
        "verification_expires_at"   TIMESTAMPTZ,
        "review_note"               VARCHAR(2000),
        "created_at"                TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "chk_evidence_review_decision" CHECK ("decision" IN ('APPROVE', 'NEEDS_CHANGES', 'REJECT')),
        CONSTRAINT "chk_evidence_review_reviewer_name_not_blank" CHECK (btrim("reviewer_name") <> ''),
        CONSTRAINT "chk_evidence_review_claim_type_not_blank" CHECK (btrim("claim_type") <> ''),
        CONSTRAINT "chk_evidence_review_policy_key_not_blank" CHECK (btrim("policy_key") <> ''),
        CONSTRAINT "chk_evidence_review_policy_version_not_blank" CHECK (btrim("policy_version") <> ''),
        CONSTRAINT "chk_evidence_review_approval_digest_format" CHECK ("approval_artifact_sha256" ~ '^[0-9a-f]{64}$'),
        CONSTRAINT "chk_evidence_review_content_digest_format" CHECK ("evidence_content_sha256" ~ '^[0-9a-f]{64}$'),
        -- An expiry may only ever appear on an APPROVE row — the converse is NOT required: a human
        -- can decide APPROVE and still have the policy evaluator reject it (hash mismatch, stale
        -- capture, non-first-party source, temporary schedule, already expired), and rule 7 requires
        -- that outcome be audited too, with verification_expires_at left NULL (nothing was actually
        -- verified). A stricter "APPROVE implies expiry" check was tried and reverted before merge —
        -- it would have made every ineligible-but-APPROVE review fail this INSERT outright, silently
        -- losing exactly the audit trail rule 7 exists to guarantee.
        CONSTRAINT "chk_evidence_review_expiry_requires_approve" CHECK ("verification_expires_at" IS NULL OR "decision" = 'APPROVE'),
        -- Idempotency key: the SAME approval receipt (its own content digest) replayed against the
        -- SAME evidence artifact is the SAME submission — the application layer treats a second call
        -- with an identical digest+payload as a no-op replay, and a digest reused with a DIFFERENT
        -- payload as a conflict (never a silent overwrite) — see EvidenceService.reviewEvidenceArtifact.
        CONSTRAINT "uq_evidence_review_receipt" UNIQUE ("evidence_artifact_id", "approval_artifact_sha256")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_evidence_reviews_evidence_artifact" ON "evidence_reviews" ("evidence_artifact_id")`);
    await queryRunner.query(`CREATE INDEX "idx_evidence_reviews_reviewed_at" ON "evidence_reviews" ("reviewed_at")`);

    // Denormalized current-state columns on evidence_artifacts — mirrors the existing verifiedBy/
    // verifiedAt pair (already on this table, set by nothing today) with the three fields the
    // freshness gate and the recapture/re-review workflow actually need to read without a join:
    // when this evidence's current APPROVE expires, what digest backed it, and under which policy
    // version. All four added columns start NULL for every existing row (see class doc above) and
    // are only ever written together, in the same transaction as the evidence_reviews row that
    // justifies them (EvidenceService.reviewEvidenceArtifact) — never independently.
    await queryRunner.query(`ALTER TABLE "evidence_artifacts" ADD COLUMN "verification_expires_at" TIMESTAMPTZ`);
    await queryRunner.query(`ALTER TABLE "evidence_artifacts" ADD COLUMN "approval_artifact_sha256" CHAR(64)`);
    await queryRunner.query(`ALTER TABLE "evidence_artifacts" ADD COLUMN "freshness_policy_key" VARCHAR(80)`);
    await queryRunner.query(`ALTER TABLE "evidence_artifacts" ADD COLUMN "freshness_policy_version" VARCHAR(20)`);
    await queryRunner.query(`
      ALTER TABLE "evidence_artifacts" ADD CONSTRAINT "chk_evidence_artifacts_approval_digest_format"
        CHECK ("approval_artifact_sha256" IS NULL OR "approval_artifact_sha256" ~ '^[0-9a-f]{64}$')
    `);
    // Partial index — only rows a real review has actually set are worth scanning; supports the
    // "evidence nearing/at expiry" operational query (docs/99-decisions, Opening-Hours Evidence
    // Governance v1) without touching the (far larger) set of never-reviewed rows.
    await queryRunner.query(`
      CREATE INDEX "idx_evidence_artifacts_verification_expires_at" ON "evidence_artifacts" ("verification_expires_at")
      WHERE "verification_expires_at" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [{ count: reviewCount }]: Array<{ count: string }> = await queryRunner.query(
      `SELECT count(*)::int AS count FROM "evidence_reviews"`,
    );
    if (Number(reviewCount) > 0) {
      throw new Error(
        `InitEvidenceReviews1720005500000.down() refused: ${reviewCount} evidence_reviews row(s) ` +
          `already exist (a real human review has happened). Reverting would silently destroy that ` +
          `audit trail. Resolve manually before reverting this migration.`,
      );
    }

    const [{ count: governedCount }]: Array<{ count: string }> = await queryRunner.query(`
      SELECT count(*)::int AS count FROM "evidence_artifacts"
      WHERE "verification_expires_at" IS NOT NULL
         OR "approval_artifact_sha256" IS NOT NULL
         OR "freshness_policy_key" IS NOT NULL
    `);
    if (Number(governedCount) > 0) {
      throw new Error(
        `InitEvidenceReviews1720005500000.down() refused: ${governedCount} evidence_artifacts row(s) ` +
          `carry governance state (verification_expires_at/approval_artifact_sha256/freshness_policy_key). ` +
          `Dropping these columns would silently destroy that state. Resolve manually before reverting.`,
      );
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_evidence_artifacts_verification_expires_at"`);
    await queryRunner.query(`ALTER TABLE "evidence_artifacts" DROP CONSTRAINT IF EXISTS "chk_evidence_artifacts_approval_digest_format"`);
    await queryRunner.query(`ALTER TABLE "evidence_artifacts" DROP COLUMN IF EXISTS "freshness_policy_version"`);
    await queryRunner.query(`ALTER TABLE "evidence_artifacts" DROP COLUMN IF EXISTS "freshness_policy_key"`);
    await queryRunner.query(`ALTER TABLE "evidence_artifacts" DROP COLUMN IF EXISTS "approval_artifact_sha256"`);
    await queryRunner.query(`ALTER TABLE "evidence_artifacts" DROP COLUMN IF EXISTS "verification_expires_at"`);

    await queryRunner.query(`DROP TABLE IF EXISTS "evidence_reviews"`);
  }
}
