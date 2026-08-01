import { MigrationInterface, QueryRunner } from 'typeorm';

// Media Upload Foundation (design review, 2026-07-30). Adds the object-metadata columns needed to
// persist ONLY key/bucket/content_type/size/checksum (never absolute or signed URLs — those are
// generated dynamically at read time, see docs/data/modules/media.md). Also relaxes the
// exclusive-owner CHECK from exactly-one to at-most-one: MediaRepository.attachToReview() already
// queries for rows with ALL FIVE owner columns NULL (a "pending, not-yet-attached" orphan upload),
// but the ORIGINAL `chk_media_one_owner` (=1) made such a row impossible to ever INSERT — this
// migration fixes that latent, previously-unreachable-in-practice gap.
export class AddMediaUploadFoundation1720002900000 implements MigrationInterface {
  name = 'AddMediaUploadFoundation1720002900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // `url` was NOT NULL — new upload rows are pending and never get a persisted absolute/signed
    // URL (per design review §A), so it must become nullable. Relaxing NOT NULL is always safe
    // regardless of existing row count (never fails, never requires a backfill).
    await queryRunner.query(`ALTER TABLE "media" ALTER COLUMN "url" DROP NOT NULL`);

    await queryRunner.query(`ALTER TABLE "media" ADD COLUMN "object_key" varchar(300)`);
    await queryRunner.query(`ALTER TABLE "media" ADD COLUMN "bucket" varchar(100)`);
    await queryRunner.query(`ALTER TABLE "media" ADD COLUMN "content_type" varchar(100)`);
    await queryRunner.query(`ALTER TABLE "media" ADD COLUMN "size_bytes" int`);
    await queryRunner.query(`ALTER TABLE "media" ADD COLUMN "checksum_sha256" char(64)`);

    await queryRunner.query(`ALTER TABLE "media" DROP CONSTRAINT "chk_media_one_owner"`);
    await queryRunner.query(`
      ALTER TABLE "media" ADD CONSTRAINT "chk_media_at_most_one_owner" CHECK (
        ("place_id" IS NOT NULL)::int + ("review_id" IS NOT NULL)::int
        + ("post_id" IS NOT NULL)::int + ("business_id" IS NOT NULL)::int
        + ("event_id" IS NOT NULL)::int <= 1
      )
    `);

    // Per-uploader duplicate prevention (design review §8) — partial (only rows that actually
    // have a checksum, i.e. new-format upload rows; legacy externally-embedded rows are
    // unaffected) and excludes soft-deleted rows so a deleted+re-uploaded duplicate isn't blocked.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_media_uploader_checksum" ON "media" ("uploaded_by", "checksum_sha256")
      WHERE "deleted_at" IS NULL AND "checksum_sha256" IS NOT NULL
    `);
    // uploaded_by had no index before this migration (existing indexes: place/business/event/
    // event_sort/status only) — required for the duplicate-check query and for the review-
    // attachment ownership check (attachToReview) to stay index-backed as upload volume grows.
    await queryRunner.query(
      `CREATE INDEX "idx_media_uploaded_by" ON "media" ("uploaded_by") WHERE "uploaded_by" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [{ count: newFormatRows }]: Array<{ count: string }> = await queryRunner.query(
      `SELECT count(*)::int AS count FROM "media" WHERE "object_key" IS NOT NULL`,
    );
    if (Number(newFormatRows) > 0) {
      throw new Error(
        `AddMediaUploadFoundation1720002900000.down() refused: ${newFormatRows} row(s) have ` +
          `object_key populated (real uploads via this foundation). Reverting would silently ` +
          `destroy their only persisted storage-location metadata. Resolve manually (migrate the ` +
          `data forward, or delete those rows deliberately) before reverting this migration.`,
      );
    }

    const [{ count: nullUrlRows }]: Array<{ count: string }> = await queryRunner.query(
      `SELECT count(*)::int AS count FROM "media" WHERE "url" IS NULL`,
    );
    if (Number(nullUrlRows) > 0) {
      throw new Error(
        `AddMediaUploadFoundation1720002900000.down() refused: ${nullUrlRows} row(s) have a NULL ` +
          `"url", which would violate the restored NOT NULL constraint. Resolve manually before reverting.`,
      );
    }

    const [{ count: orphanRows }]: Array<{ count: string }> = await queryRunner.query(`
      SELECT count(*)::int AS count FROM "media"
      WHERE "place_id" IS NULL AND "review_id" IS NULL AND "post_id" IS NULL
        AND "business_id" IS NULL AND "event_id" IS NULL
    `);
    if (Number(orphanRows) > 0) {
      throw new Error(
        `AddMediaUploadFoundation1720002900000.down() refused: ${orphanRows} row(s) have ZERO ` +
          `owners set, which would violate the restored exactly-one-owner CHECK. Resolve manually ` +
          `(attach or delete those rows) before reverting.`,
      );
    }

    await queryRunner.query(`DROP INDEX "idx_media_uploaded_by"`);
    await queryRunner.query(`DROP INDEX "idx_media_uploader_checksum"`);
    await queryRunner.query(`ALTER TABLE "media" DROP CONSTRAINT "chk_media_at_most_one_owner"`);
    await queryRunner.query(`
      ALTER TABLE "media" ADD CONSTRAINT "chk_media_one_owner" CHECK (
        ("place_id" IS NOT NULL)::int + ("review_id" IS NOT NULL)::int
        + ("post_id" IS NOT NULL)::int + ("business_id" IS NOT NULL)::int
        + ("event_id" IS NOT NULL)::int = 1
      )
    `);
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "checksum_sha256"`);
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "size_bytes"`);
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "content_type"`);
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "bucket"`);
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "object_key"`);
    await queryRunner.query(`ALTER TABLE "media" ALTER COLUMN "url" SET NOT NULL`);
  }
}
