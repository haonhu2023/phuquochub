import { MigrationInterface, QueryRunner } from 'typeorm';

// Closes a real current-value binding gap found in PR #21 review, before place_field_evidence_links
// was ever populated in any environment (confirmed: zero rows in staging, table does not exist on
// production, no evidence-linking has ever been executed against a shared DB). Follow-up ADDITIVE
// migration rather than editing 1720005300000-InitPlaceFieldEvidenceLinks.ts in place, because that
// migration is already merged to main — rewriting a merged migration's history is avoided on
// principle even though no persistent environment has actually applied it yet.
//
// Without this column, a link only proves "this evidence has supported this field at some point,"
// never "this evidence supports the field's CURRENT value" — the exact ambiguity described in the
// review: if opening_hours changes from A to B and a new artifact is linked for B, a lookup by
// (place, field) alone cannot tell A's link from B's, so stale evidence could be mistaken for
// current-value evidence.
//
// field_value_hash = sha256(canonicalJson(value)) at link time (see field-value-hash.ts) — same
// idiom as place_translations.source_text_hash (ADR-020 §Decision 2), a proven pattern for the
// structurally identical "is this still current" question. NOT a revision-id binding: every
// bulk-import/administrative-backfill/raw-SQL path this codebase actually uses to seed place facts
// bypasses PlacesService's revision-recording entirely, so a revision-id binding would silently
// under-cover exactly the places this feature exists for.
//
// The UNIQUE constraint gains field_value_hash: the same (place, field, evidence_artifact) triple
// may legitimately recur with a DIFFERENT hash if the artifact is re-linked after the field's value
// changed (the artifact still supports SOME value, just not the same one as before) — that must be
// a new row, not a silently-ignored duplicate, and the old row stays as real, undeleted history.
export class AddFieldValueHashToPlaceFieldEvidenceLinks1720005400000 implements MigrationInterface {
  name = 'AddFieldValueHashToPlaceFieldEvidenceLinks1720005400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(`SELECT COUNT(*) AS link_count FROM "place_field_evidence_links"`)) as Array<{
      link_count: string;
    }>;
    const linkCount = parseInt(rows[0]?.link_count ?? '0', 10);
    if (linkCount > 0) {
      throw new Error(
        `AddFieldValueHashToPlaceFieldEvidenceLinks up() refused: ${linkCount} existing field-evidence ` +
          `link(s) have no field_value_hash to backfill. This migration only ever expected an empty table ` +
          `(confirmed empty in every environment at authoring time) — a backfill strategy must be designed ` +
          `explicitly before adding a NOT NULL column here.`,
      );
    }

    await queryRunner.query(`ALTER TABLE "place_field_evidence_links" ADD COLUMN "field_value_hash" CHAR(64) NOT NULL`);

    await queryRunner.query(`ALTER TABLE "place_field_evidence_links" DROP CONSTRAINT "uq_place_field_evidence_link"`);
    await queryRunner.query(
      `ALTER TABLE "place_field_evidence_links" ADD CONSTRAINT "uq_place_field_evidence_link"
         UNIQUE ("place_id", "field_name", "evidence_artifact_id", "field_value_hash")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(`SELECT COUNT(*) AS link_count FROM "place_field_evidence_links"`)) as Array<{
      link_count: string;
    }>;
    const linkCount = parseInt(rows[0]?.link_count ?? '0', 10);
    if (linkCount > 0) {
      throw new Error(
        `AddFieldValueHashToPlaceFieldEvidenceLinks down() refused: ${linkCount} field-evidence link(s) ` +
          `exist. Dropping field_value_hash would silently destroy current-value provenance.`,
      );
    }

    await queryRunner.query(`ALTER TABLE "place_field_evidence_links" DROP CONSTRAINT "uq_place_field_evidence_link"`);
    await queryRunner.query(
      `ALTER TABLE "place_field_evidence_links" ADD CONSTRAINT "uq_place_field_evidence_link"
         UNIQUE ("place_id", "field_name", "evidence_artifact_id")`,
    );
    await queryRunner.query(`ALTER TABLE "place_field_evidence_links" DROP COLUMN "field_value_hash"`);
  }
}
