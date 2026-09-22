import { MigrationInterface, QueryRunner } from 'typeorm';

// Launch-readiness pass (2026-09-22) — optimistic concurrency for Place writes.
//
// WHY: `PATCH /places/:id` had no conflict detection at all — two owners editing the same place
// around the same time silently last-write-wins, unlike guide_articles (content_version + CAS,
// SeedGuideEditPermission era) which already solved exactly this problem. Same fix, same shape:
// an integer that increments on every successful write, checked with a conditional
// `UPDATE ... WHERE id = $1 AND content_version = $2` in PlacesService.update().
//
// `ADD COLUMN ... DEFAULT 1` is catalog-only on PG11+ (a constant default is stored in the
// catalog, not backfilled row-by-row) — release-readiness-findings precedent (M43) confirms this
// class of migration is cheap regardless of table size.
export class AddPlaceContentVersion1720006300000 implements MigrationInterface {
  name = 'AddPlaceContentVersion1720006300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "places" ADD COLUMN "content_version" integer NOT NULL DEFAULT 1`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "places" DROP COLUMN "content_version"`);
  }
}
