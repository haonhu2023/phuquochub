import { MigrationInterface, QueryRunner } from 'typeorm';

// Evidence-artifact model (2026-09-03 data-SSOT remediation, Phase 2). Closes a real gap: a
// "source" (`sources` table) is the reusable publisher/website; "evidence" is a specific CAPTURED
// SNAPSHOT of that source at a point in time (hash, license, capture timestamp, verification
// status) — a source can have many evidence captures over time. Neither `sources` nor
// `source_attributions` model this: `source_attributions` links a source to an entity with a
// confidence/note, but has no hash, no license, no capture-artifact reference, and is designed for
// a different purpose (attribution, not evidence capture) — reused where it fits (nothing here
// duplicates it), not stretched to cover a shape it was never built for.
//
// `place_translations.evidence_id` (InitPlaceTranslations, 1720004600000) stays exactly as it is —
// a bare, unconstrained uuid column, per its own documented reason ("no evidence table exists yet").
// This migration does NOT add a FK to that column: the real relationship this task specified is
// MANY-to-MANY (one evidence can support several translation fields; one translation can rest on
// several evidence captures), which a single nullable FK column cannot express honestly. The join
// table below is the actual relationship; `place_translations.evidence_id` remains an unused legacy
// column until/unless a future migration retires it — not touched here, additive-only.
//
// verification_status/evidence_type/license_status are VARCHAR, not enum — same convention
// `place_translations.translationStatus`/`humanReviewStatus`/`qualityGate` already use (ADR-020:
// vocabulary is importer/workbook-defined and evolving, deliberately not a closed Postgres enum).
export class InitEvidenceArtifacts1720005000000 implements MigrationInterface {
  name = 'InitEvidenceArtifacts1720005000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "evidence_artifacts" (
        "id"                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "source_id"            UUID NOT NULL REFERENCES "sources" ("id") ON DELETE RESTRICT,
        "business_key"         VARCHAR(150) NOT NULL,
        "evidence_type"        VARCHAR(60) NOT NULL,
        "source_url"           VARCHAR(500) NOT NULL,
        "captured_at"          TIMESTAMPTZ NOT NULL,
        "content_hash_sha256"  CHAR(64) NOT NULL,
        "storage_reference"    VARCHAR(500),
        "verification_status"  VARCHAR(40) NOT NULL,
        "license_status"       VARCHAR(40),
        "verified_by"          UUID REFERENCES "users" ("id") ON DELETE SET NULL,
        "verified_at"          TIMESTAMPTZ,
        "metadata"             JSONB,
        "created_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // business_key is the workbook's own evidence_id string (e.g. "EVD-VIN-OFFICIAL-VI-20260829")
    // — the natural idempotency key for re-running an import of the same workbook row.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_evidence_artifacts_business_key"
        ON "evidence_artifacts" ("business_key")
    `);
    await queryRunner.query(`CREATE INDEX "idx_evidence_artifacts_source" ON "evidence_artifacts" ("source_id")`);
    await queryRunner.query(`CREATE INDEX "idx_evidence_artifacts_verification_status" ON "evidence_artifacts" ("verification_status")`);
    await queryRunner.query(`CREATE INDEX "idx_evidence_artifacts_content_hash" ON "evidence_artifacts" ("content_hash_sha256")`);

    await queryRunner.query(`
      CREATE TABLE "place_translation_evidence_links" (
        "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "translation_id"    UUID NOT NULL REFERENCES "place_translations" ("id") ON DELETE CASCADE,
        "evidence_id"       UUID NOT NULL REFERENCES "evidence_artifacts" ("id") ON DELETE RESTRICT,
        "relationship_type" VARCHAR(40) NOT NULL DEFAULT 'SUPPORTS',
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_place_trans_evidence_link" UNIQUE ("translation_id", "evidence_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_place_trans_evidence_link_translation" ON "place_translation_evidence_links" ("translation_id")`);
    await queryRunner.query(`CREATE INDEX "idx_place_trans_evidence_link_evidence" ON "place_translation_evidence_links" ("evidence_id")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT
         (SELECT COUNT(*) FROM "evidence_artifacts") AS evidence_count,
         (SELECT COUNT(*) FROM "place_translation_evidence_links") AS link_count`,
    )) as Array<{ evidence_count: string; link_count: string }>;
    const evidenceCount = parseInt(rows[0]?.evidence_count ?? '0', 10);
    const linkCount = parseInt(rows[0]?.link_count ?? '0', 10);
    if (evidenceCount > 0 || linkCount > 0) {
      throw new Error(
        `InitEvidenceArtifacts down() refused: ${evidenceCount} evidence artifact(s) and ${linkCount} ` +
          `link(s) exist. Dropping the schema would permanently destroy provenance history.`,
      );
    }

    await queryRunner.query(`DROP TABLE IF EXISTS "place_translation_evidence_links"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "evidence_artifacts"`);
  }
}
