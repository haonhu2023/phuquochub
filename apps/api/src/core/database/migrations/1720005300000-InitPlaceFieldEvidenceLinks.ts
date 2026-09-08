import { MigrationInterface, QueryRunner } from 'typeorm';

// Place-field evidence linkage V0 (2026-09-08). Closes a real gap found while designing an
// `opening_hours` provenance chain: neither existing evidence-adjacent table can say "this specific
// captured evidence_artifact backs this specific scalar fact on this place."
//
//   - `source_attributions` (InitSources, 1720001700000) already has (entity_type='place_field',
//     entity_id=place_id, field=<name>) -> source_id — but it points at a SOURCE (the reusable
//     publisher/website), not at a specific EVIDENCE_ARTIFACT (a captured snapshot). A source can
//     have many evidence_artifacts over time (InitEvidenceArtifacts's own header comment), so
//     knowing "this field cites source X" does not tell you WHICH of source X's captures actually
//     supports the CURRENT value — exactly the ambiguity this table removes.
//   - `place_translation_evidence_links` (InitEvidenceArtifacts, 1720005000000) links evidence to a
//     `place_translations` ROW — a different entity than `places` itself. `opening_hours` (like
//     `address`, `price_range`) is a scalar column directly on `places`, not a translation, so that
//     join table cannot express it.
//
// This table is intentionally the SMALLEST possible bridge: place + a field name string (no closed
// enum — same ADR-020 vocabulary-is-evolving reasoning already applied to
// source_attributions.field/evidence_artifacts.verification_status: importer/product-defined, not a
// fixed Postgres enum) + the evidence_artifact that supports it. It does NOT duplicate source
// identity (that still lives on evidence_artifacts.source_id, one hop away) and does NOT add any
// verification/scoring column — deciding what this evidence PROVES is a future policy layer, not
// this migration.
export class InitPlaceFieldEvidenceLinks1720005300000 implements MigrationInterface {
  name = 'InitPlaceFieldEvidenceLinks1720005300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "place_field_evidence_links" (
        "id"                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "place_id"             UUID NOT NULL REFERENCES "places" ("id") ON DELETE CASCADE,
        "field_name"           VARCHAR(60) NOT NULL,
        "evidence_artifact_id" UUID NOT NULL REFERENCES "evidence_artifacts" ("id") ON DELETE RESTRICT,
        "created_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "chk_place_field_evidence_link_field_name_not_blank" CHECK (btrim("field_name") <> ''),
        CONSTRAINT "uq_place_field_evidence_link" UNIQUE ("place_id", "field_name", "evidence_artifact_id")
      )
    `);
    // uq_place_field_evidence_link's own index already covers a (place_id, field_name) prefix scan,
    // but an explicit index is added anyway for the same reason place_translation_evidence_links
    // has both a unique constraint AND separate named indexes: explicit lookup-shape intent, not
    // an incidental side effect of the uniqueness constraint.
    await queryRunner.query(
      `CREATE INDEX "idx_place_field_evidence_link_place_field" ON "place_field_evidence_links" ("place_id", "field_name")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_place_field_evidence_link_evidence" ON "place_field_evidence_links" ("evidence_artifact_id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(`SELECT COUNT(*) AS link_count FROM "place_field_evidence_links"`)) as Array<{
      link_count: string;
    }>;
    const linkCount = parseInt(rows[0]?.link_count ?? '0', 10);
    if (linkCount > 0) {
      throw new Error(
        `InitPlaceFieldEvidenceLinks down() refused: ${linkCount} field-evidence link(s) exist. ` +
          `Dropping the schema would permanently destroy field-level provenance history.`,
      );
    }

    await queryRunner.query(`DROP TABLE IF EXISTS "place_field_evidence_links"`);
  }
}
