import { MigrationInterface, QueryRunner } from 'typeorm';

// Closes two governance gaps found in the 2026-09-02 data-SSOT audit:
//
// 1. `multilingual_import_batches` had no link back to a release-level approval/policy/preflight
//    decision — a batch could reach `succeeded` with `approval_evidence_checksum` populated but
//    never independently checked against anything. This migration adds the columns a release gate
//    (apps/api/src/modules/admin-data/release-manifest.contract.ts) writes onto a batch once it
//    allows a non-dry-run: `release_item_id`, `release_manifest_digest`, `evidence_digest`,
//    `policy_status`, `preflight_status`, `idempotency_key`. All nullable — existing/dry-run/
//    facts-only batches are not required to carry a release manifest.
//
// 2. `multilingual_import_batch_status` had no way to mark a `pending` batch as deliberately
//    abandoned. The existing convention (entity comment, multilingual-import.enums.ts) is correct
//    for *completed* batches — "rollback is expressed as a new succeeded batch", never mutate
//    history — but a batch that never started running (`pending`, `started_at IS NULL`) has no
//    history to preserve by leaving it alone forever; it is just an orphaned intent. `cancelled`
//    covers that case. `superseded` covers a `pending` batch that a newer, corrected batch replaces
//    before either ever ran. Neither value is ever applied by this migration itself — it only makes
//    the vocabulary available; apps/api/src/modules/multilingual-import/repositories/
//    multilingual-import-batch.repository.ts (`cancelPending()`) is the only code path allowed to
//    write them, and only when the row's CURRENT status is `pending`.
export class AddReleaseGateAndBatchLifecycle1720004800000 implements MigrationInterface {
  name = 'AddReleaseGateAndBatchLifecycle1720004800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ALTER TYPE ... ADD VALUE must run outside the value's own transaction in older Postgres, but
    // is safe as a standalone statement (not referenced by any other statement in this same up()).
    await queryRunner.query(`ALTER TYPE "multilingual_import_batch_status" ADD VALUE IF NOT EXISTS 'cancelled'`);
    await queryRunner.query(`ALTER TYPE "multilingual_import_batch_status" ADD VALUE IF NOT EXISTS 'superseded'`);

    await queryRunner.query(`
      ALTER TABLE "multilingual_import_batches"
        ADD COLUMN "release_item_id" UUID,
        ADD COLUMN "release_manifest_digest" CHAR(64),
        ADD COLUMN "evidence_digest" CHAR(64),
        ADD COLUMN "policy_status" VARCHAR(20),
        ADD COLUMN "preflight_status" VARCHAR(20),
        ADD COLUMN "idempotency_key" VARCHAR(150),
        ADD COLUMN "cancellation_reason" VARCHAR(300),
        ADD COLUMN "superseded_by_batch_id" UUID REFERENCES "multilingual_import_batches" ("id")
    `);

    // Partial unique: only non-null idempotency keys are constrained, and only one batch may ever
    // hold a given key — this is what makes "idempotency key thiếu → từ chối" enforceable at the DB
    // layer too, not just in application code (defense in depth, same pattern as
    // uq_import_batch_source_checksum_succeeded in the parent migration).
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_import_batch_idempotency_key"
        ON "multilingual_import_batches" ("idempotency_key")
        WHERE "idempotency_key" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_import_batch_release_item"
        ON "multilingual_import_batches" ("release_item_id")
        WHERE "release_item_id" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Refuse if any batch has actually used the new lifecycle/gate columns — dropping them would
    // silently discard governance history for those batches (same irreversible-history posture as
    // every other migration in this cluster).
    const rows = (await queryRunner.query(
      `SELECT COUNT(*) AS count FROM "multilingual_import_batches" WHERE "release_item_id" IS NOT NULL OR "status" IN ('cancelled', 'superseded')`,
    )) as Array<{ count: string }>;
    const count = rows[0]?.count ?? '0';
    if (parseInt(count, 10) > 0) {
      throw new Error(
        `AddReleaseGateAndBatchLifecycle down() refused: ${count} batch record(s) already use the ` +
          `release gate or the cancelled/superseded lifecycle. Reverting would destroy that governance ` +
          `history irreversibly.`,
      );
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_import_batch_release_item"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_import_batch_idempotency_key"`);
    await queryRunner.query(`
      ALTER TABLE "multilingual_import_batches"
        DROP COLUMN IF EXISTS "superseded_by_batch_id",
        DROP COLUMN IF EXISTS "cancellation_reason",
        DROP COLUMN IF EXISTS "idempotency_key",
        DROP COLUMN IF EXISTS "preflight_status",
        DROP COLUMN IF EXISTS "policy_status",
        DROP COLUMN IF EXISTS "evidence_digest",
        DROP COLUMN IF EXISTS "release_manifest_digest",
        DROP COLUMN IF EXISTS "release_item_id"
    `);
    // Postgres cannot DROP VALUE from an enum — 'cancelled'/'superseded' remain defined but unused
    // after down(); this is a documented, unavoidable Postgres limitation (same reason no migration
    // in this repo ever removes an enum value), not an oversight.
  }
}
