import { MigrationInterface, QueryRunner } from 'typeorm';

// Evidence Field-Binding V2 (ADR-022 "Known limitation — evidence-to-link binding", follow-up).
// InitEvidenceReviews (1720005500000) approves an evidence_artifacts row's CONTENT — bound by its
// content hash, claim type, and source — as trustworthy for `opening_hours` claims IN GENERAL. It
// does not, and structurally cannot, approve a specific place_field_evidence_links row: that link's
// field_value_hash is set independently, at link time, by EvidenceService.linkEvidenceToPlaceField.
// So the SAME already-VERIFIED artifact could be re-linked to a DIFFERENT place, or the SAME place
// after its opening_hours changed to a DIFFERENT value, and clear the freshness gate without any
// new human review ever having looked at whether the evidence supports that new (place, value).
//
// This migration adds three nullable, immutable binding columns to evidence_reviews — place_id,
// field_name, field_value_hash — so a review can be persistently bound to the EXACT tuple
// (evidence_artifact_id, place_id, field_name, field_value_hash) it was actually submitted for,
// governed relational state, not metadata. All-three-or-none: a review either carries a complete
// binding or none at all, enforced by a CHECK constraint, never a partial one.
//
// Legacy V1 rows are untouched (all three columns start NULL on every existing row — no UPDATE
// statement here) and stay auditable exactly as they are; because NULL never equals NULL in a join
// predicate, an unbound V1 review can never satisfy a V2 tuple-match and therefore fails closed
// against the hardened opening_hours read gate (PlacesRepository) by construction, not by an
// explicit exclusion this migration would have to encode and could get wrong.
//
// Additive-only, same convention as AddFieldValueHashToPlaceFieldEvidenceLinks (1720005400000):
// editing InitEvidenceReviews in place is avoided rather than assuming any persistent environment's
// evidence_reviews table is still empty by the time this ships. Persistent environments MAY already
// contain legacy V1 (OPENING_HOURS_OFFICIAL_STABLE_V1, unbound) review rows from real use of
// EvidenceService.reviewEvidenceArtifact — this migration's own guarantees do not depend on that
// table being empty either way: the three new columns are added NULL on every existing row (no
// UPDATE/backfill anywhere in up()), so any pre-existing row — legacy or otherwise — is preserved
// byte-for-byte and stays fully auditable. It simply never satisfies the new V2 field-bound gate
// on its own (see the class doc above) until a real V2-bound review is submitted for it.
export class AddFieldBindingToEvidenceReviews1720005600000 implements MigrationInterface {
  name = 'AddFieldBindingToEvidenceReviews1720005600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "evidence_reviews" ADD COLUMN "place_id" UUID REFERENCES "places" ("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "evidence_reviews" ADD COLUMN "field_name" VARCHAR(60)`);
    await queryRunner.query(`ALTER TABLE "evidence_reviews" ADD COLUMN "field_value_hash" CHAR(64)`);

    // All-three-or-none: a review is either fully bound to a (place, field, value) tuple, or carries
    // no binding at all (a legacy-shaped V1 review) — a partial binding can never be persisted, so no
    // application code anywhere has to defend against reading a row with, say, a field_name but no
    // field_value_hash.
    await queryRunner.query(`
      ALTER TABLE "evidence_reviews" ADD CONSTRAINT "chk_evidence_review_binding_all_or_none"
        CHECK (
          ("place_id" IS NULL AND "field_name" IS NULL AND "field_value_hash" IS NULL)
          OR
          ("place_id" IS NOT NULL AND "field_name" IS NOT NULL AND "field_value_hash" IS NOT NULL)
        )
    `);
    await queryRunner.query(`
      ALTER TABLE "evidence_reviews" ADD CONSTRAINT "chk_evidence_review_field_name_not_blank"
        CHECK ("field_name" IS NULL OR btrim("field_name") <> '')
    `);
    await queryRunner.query(`
      ALTER TABLE "evidence_reviews" ADD CONSTRAINT "chk_evidence_review_field_value_hash_format"
        CHECK ("field_value_hash" IS NULL OR "field_value_hash" ~ '^[0-9a-f]{64}$')
    `);

    // Partial covering index for the hardened opening_hours read gate's per-tuple "latest review"
    // lookup (PlacesRepository — a LATERAL join keyed on evidence_artifact_id + this exact tuple,
    // ordered by reviewed_at DESC, created_at DESC, id DESC) and for EvidenceService's link-write
    // guard (the same lookup, single-row). WHERE place_id IS NOT NULL skips every legacy V1 row —
    // they can never match a tuple lookup, so indexing them would only waste space.
    await queryRunner.query(`
      CREATE INDEX "idx_evidence_reviews_field_binding_tuple"
        ON "evidence_reviews" ("evidence_artifact_id", "place_id", "field_name", "field_value_hash", "reviewed_at")
        WHERE "place_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [{ count: boundCount }]: Array<{ count: string }> = await queryRunner.query(`
      SELECT count(*)::int AS count FROM "evidence_reviews" WHERE "place_id" IS NOT NULL
    `);
    if (Number(boundCount) > 0) {
      throw new Error(
        `AddFieldBindingToEvidenceReviews1720005600000.down() refused: ${boundCount} evidence_reviews row(s) ` +
          `already carry a V2 field binding (place_id/field_name/field_value_hash). Dropping these columns ` +
          `would silently destroy that governance state. Resolve manually before reverting this migration.`,
      );
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_evidence_reviews_field_binding_tuple"`);
    await queryRunner.query(`ALTER TABLE "evidence_reviews" DROP CONSTRAINT IF EXISTS "chk_evidence_review_field_value_hash_format"`);
    await queryRunner.query(`ALTER TABLE "evidence_reviews" DROP CONSTRAINT IF EXISTS "chk_evidence_review_field_name_not_blank"`);
    await queryRunner.query(`ALTER TABLE "evidence_reviews" DROP CONSTRAINT IF EXISTS "chk_evidence_review_binding_all_or_none"`);
    await queryRunner.query(`ALTER TABLE "evidence_reviews" DROP COLUMN IF EXISTS "field_value_hash"`);
    await queryRunner.query(`ALTER TABLE "evidence_reviews" DROP COLUMN IF EXISTS "field_name"`);
    await queryRunner.query(`ALTER TABLE "evidence_reviews" DROP COLUMN IF EXISTS "place_id"`);
  }
}
