import { MigrationInterface, QueryRunner } from 'typeorm';

// Wave 1 (bổ sung S2) — `wiki_revisions`: thực thể phiên bản DUY NHẤT (ADR-014).
// Polymorphic (không FK entity_id), append-only, KHÔNG cascade (audit bất biến).
export class InitWikiRevisions1720000700000 implements MigrationInterface {
  name = 'InitWikiRevisions1720000700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- Enums (data-dictionary §4) ----
    await queryRunner.query(`CREATE TYPE "revision_entity_type" AS ENUM ('place')`);
    await queryRunner.query(
      `CREATE TYPE "revision_origin" AS ENUM ('community_edit','owner_update','moderator_edit','osm_sync','ai_generation','import')`,
    );
    await queryRunner.query(
      `CREATE TYPE "revision_status" AS ENUM ('pending','approved','rejected','reverted')`,
    );

    // ---- wiki_revisions ----
    await queryRunner.query(`
      CREATE TABLE "wiki_revisions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "entity_type" "revision_entity_type" NOT NULL,
        "entity_id" uuid NOT NULL,
        "revision_number" int NOT NULL,
        "parent_revision_id" uuid REFERENCES "wiki_revisions"("id") ON DELETE NO ACTION,
        "snapshot" jsonb NOT NULL,
        "diff" jsonb,
        "origin" "revision_origin" NOT NULL,
        "change_note" varchar(300),
        "editor_id" uuid REFERENCES "users"("id") ON DELETE NO ACTION,
        "status" "revision_status" NOT NULL,
        "reviewed_by" uuid REFERENCES "users"("id") ON DELETE NO ACTION,
        "reviewed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_wiki_rev_number" ON "wiki_revisions" ("entity_type","entity_id","revision_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_wiki_rev_entity_status" ON "wiki_revisions" ("entity_type","entity_id","status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "wiki_revisions"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "revision_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "revision_origin"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "revision_entity_type"`);
  }
}
