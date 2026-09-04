import { MigrationInterface, QueryRunner } from 'typeorm';

// New external-identifier registry for `places` (2026-09-02 data-SSOT remediation, Phase 5).
// Confirmed absent before this migration: `places` has no google_place_id/external_id/provider
// column anywhere (the only existing external_id+provider pair in the schema is on `media`, for
// upload/youtube/vimeo — an unrelated concept). Google Place ID (and any future provider identifier)
// is intentionally NOT a column on `places` and NOT its primary key — a place's identity inside this
// database is `places.id`; a provider identifier is external metadata that can change, be revoked,
// or be re-mapped without ever touching that primary key.
export class InitPlaceExternalIdentifiers1720004900000 implements MigrationInterface {
  name = 'InitPlaceExternalIdentifiers1720004900000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Single value today (Google Places) — new providers are added the same way
    // AddReleaseGateAndBatchLifecycle1720004800000 added batch-status values: ALTER TYPE ... ADD
    // VALUE in a later migration, never a redefinition of this one.
    await queryRunner.query(`
      CREATE TYPE "place_external_identifier_provider" AS ENUM ('GOOGLE_PLACES')
    `);

    await queryRunner.query(`
      CREATE TABLE "place_external_identifiers" (
        "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "place_id"     UUID NOT NULL REFERENCES "places" ("id") ON DELETE CASCADE,
        "provider"     "place_external_identifier_provider" NOT NULL,
        "external_id"  VARCHAR(200) NOT NULL,
        "is_primary"   BOOLEAN NOT NULL DEFAULT TRUE,
        "source_id"    UUID REFERENCES "sources" ("id") ON DELETE SET NULL,
        "evidence_id"  UUID,
        "verified_at"  TIMESTAMPTZ,
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // A given provider identifier must resolve to exactly one place — the actual constraint that
    // makes this a real identity registry instead of a free-text tag.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_place_ext_id_provider_external_id"
        ON "place_external_identifiers" ("provider", "external_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_place_ext_id_place"
        ON "place_external_identifiers" ("place_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_place_ext_id_provider"
        ON "place_external_identifiers" ("provider")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT COUNT(*) AS count FROM "place_external_identifiers"`,
    )) as Array<{ count: string }>;
    const count = rows[0]?.count ?? '0';
    if (parseInt(count, 10) > 0) {
      throw new Error(
        `InitPlaceExternalIdentifiers down() refused: ${count} identifier(s) exist. Dropping the ` +
          `table would permanently destroy that mapping.`,
      );
    }

    await queryRunner.query(`DROP TABLE IF EXISTS "place_external_identifiers"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "place_external_identifier_provider"`);
  }
}
