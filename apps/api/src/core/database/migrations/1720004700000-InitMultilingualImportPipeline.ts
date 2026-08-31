import { MigrationInterface, QueryRunner } from 'typeorm';

// Creates audit tables for the multilingual import pipeline (contract phuquochub.multilingual-import.v1).
// Additive-only — down() refuses to drop tables if any import data has been written.
// Tables do NOT cascade-delete place_translations rows; audit history is permanent.
export class InitMultilingualImportPipeline1720004700000 implements MigrationInterface {
  name = 'InitMultilingualImportPipeline1720004700000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Enum: batch lifecycle
    await queryRunner.query(`
      CREATE TYPE "multilingual_import_batch_status" AS ENUM (
        'pending', 'running', 'succeeded', 'failed', 'rolled_back'
      )
    `);

    // Enum: per-row outcome
    await queryRunner.query(`
      CREATE TYPE "multilingual_import_row_outcome" AS ENUM (
        'inserted', 'already_current', 'held', 'failed'
      )
    `);

    // Batch audit table
    await queryRunner.query(`
      CREATE TABLE "multilingual_import_batches" (
        "id"                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "batch_id"                      UUID NOT NULL,
        "contract_version"              VARCHAR(60) NOT NULL,
        "source_checksum"               CHAR(64) NOT NULL,
        "approval_evidence_checksum"    CHAR(64) NOT NULL,
        "publish_manifest_checksum"     CHAR(64) NOT NULL,
        "total_rows"                    INTEGER NOT NULL,
        "status"                        "multilingual_import_batch_status" NOT NULL DEFAULT 'pending',
        "dry_run"                       BOOLEAN NOT NULL DEFAULT TRUE,
        "actor_id"                      UUID NOT NULL,
        "succeeded_rows"                INTEGER,
        "failed_rows"                   INTEGER,
        "held_rows"                     INTEGER,
        "already_current_rows"          INTEGER,
        "error_summary"                 TEXT,
        "started_at"                    TIMESTAMPTZ,
        "completed_at"                  TIMESTAMPTZ,
        "created_at"                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_import_batch_id"
        ON "multilingual_import_batches" ("batch_id")
    `);

    // Prevents re-submitting the exact same XLSX content under a different batchId
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_import_batch_source_checksum_succeeded"
        ON "multilingual_import_batches" ("source_checksum")
        WHERE "status" = 'succeeded'
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_import_batch_status"
        ON "multilingual_import_batches" ("status")
    `);

    // Per-row audit table
    await queryRunner.query(`
      CREATE TABLE "multilingual_import_rows" (
        "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "batch_record_id"  UUID NOT NULL REFERENCES "multilingual_import_batches" ("id"),
        "place_id"         UUID NOT NULL,
        "field_key"        VARCHAR(60) NOT NULL,
        "locale_code"      VARCHAR(35) NOT NULL,
        "row_hash"         CHAR(64) NOT NULL,
        "translation_id"   UUID,
        "outcome"          "multilingual_import_row_outcome" NOT NULL,
        "error_detail"     TEXT,
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_import_row_batch"
        ON "multilingual_import_rows" ("batch_record_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_import_row_place"
        ON "multilingual_import_rows" ("place_id", "locale_code")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Safety: refuse to drop if any import data exists — data loss is irreversible.
    const rows = await queryRunner.query(`SELECT COUNT(*) AS count FROM "multilingual_import_batches"`) as Array<{ count: string }>;
    const count = rows[0]?.count ?? '0';
    if (parseInt(count as string, 10) > 0) {
      throw new Error(
        `InitMultilingualImportPipeline down() refused: ${count} batch record(s) exist. ` +
          `Dropping the schema would permanently destroy import audit history. ` +
          `Roll back content by running a new import batch, not by dropping tables.`,
      );
    }

    await queryRunner.query(`DROP TABLE IF EXISTS "multilingual_import_rows"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "multilingual_import_batches"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "multilingual_import_row_outcome"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "multilingual_import_batch_status"`);
  }
}
