import { MigrationInterface, QueryRunner } from 'typeorm';

// Human Translation Review workflow (2026-09-04). Adds the ONE missing revision_status value a
// genuine review decision needs: 'needs_changes' — distinct from 'pending' (never reviewed) and
// 'rejected' (declined outright). Without it, TranslationReviewService.reviewTranslation() has no
// truthful value to write for a "needs changes" decision.
//
// Forward-safe, non-destructive: ADD VALUE only, no existing row touched, no column dropped.
// down() intentionally does NOT attempt to remove the enum value — Postgres has no
// `ALTER TYPE ... DROP VALUE`, and a real DROP TYPE/recreate here risks orphaning any row already
// written with this value by the time a rollback runs. Same precedent as
// AddReleaseGateAndBatchLifecycle's down() for `multilingual_import_batch_status`.
export class AddNeedsChangesRevisionStatus1720005100000 implements MigrationInterface {
  name = 'AddNeedsChangesRevisionStatus1720005100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ALTER TYPE ... ADD VALUE is safe as a standalone statement (not referenced by any other
    // statement in this same up()) — same pattern as AddReleaseGateAndBatchLifecycle.
    await queryRunner.query(`ALTER TYPE "revision_status" ADD VALUE IF NOT EXISTS 'needs_changes'`);
  }

  public async down(): Promise<void> {
    // No-op by design — see class comment. Removing an enum value safely requires recreating the
    // type and every dependent column/index, which is out of proportion to this additive change and
    // would risk data loss for any row already written with 'needs_changes'.
  }
}
