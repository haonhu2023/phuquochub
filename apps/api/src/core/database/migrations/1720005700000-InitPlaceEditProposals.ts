import { MigrationInterface, QueryRunner } from 'typeorm';

// Place Edit Proposals MVP — "Đề xuất chỉnh sửa địa điểm". Closes a real gap: `PlacesService.update()`
// already labels every PATCH with `RevisionOrigin.COMMUNITY_EDIT` by default, but `wiki_revisions`
// is a POST-HOC AUDIT LOG of a change that has ALREADY been applied to `places` — `updateScalars()`
// runs BEFORE the revision is even recorded (places.service.ts), and that revision is written with
// `status: RevisionStatus.APPROVED` unconditionally. There is no existing mechanism anywhere in this
// schema that stores an UNAPPLIED, pending correction for review before it touches `places` — this
// table is that mechanism, deliberately separate from `wiki_revisions`, not a repurposing of it.
//
// Scope: a SMALL, closed set of base `places` scalar columns (opening_hours/address/
// short_description) — the MVP fields this feature targets. `field_key` is a real Postgres ENUM
// here (not the free-varchar "evolving vocabulary" idiom used by `source_attributions.field` /
// `place_field_evidence_links.field_name`), because this is a deliberately CLOSED, anti-abuse
// allowlist for what an anonymous-ish community member may propose — the opposite intent from
// those tables' open-ended future extensibility.
//
// `base_value_hash` (not a base revision id): reuses the exact same idiom
// `evidence/field-value-hash.ts` already established for `place_field_evidence_links` — "was this
// captured against the value that is still current, or has it since drifted?" is structurally the
// identical problem here (conflict detection at approval time), and that file's own comment already
// explains why a revision-id binding would under-cover values written by any of the bulk-import/
// administrative-backfill paths that bypass `PlacesService.update()`'s revision recording entirely.
//
// Approving a proposal does NOT create/alter this table's own "verified" concept — there is none.
// Approval is expected to apply via the EXISTING `PlacesService.update()` (a separate service-layer
// concern, not encoded in this schema) — this migration only shapes the proposal's own lifecycle
// (pending/approved/rejected/needs_changes/conflict), never `places.verification_status` or
// `evidence_artifacts`/`evidence_reviews` — a proposal approval is not, and must never become, a
// backdoor into the opening_hours evidence-gate governance those tables enforce independently.
export class InitPlaceEditProposals1720005700000 implements MigrationInterface {
  name = 'InitPlaceEditProposals1720005700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "place_edit_proposal_field_key" AS ENUM ('opening_hours','address','short_description')`,
    );
    await queryRunner.query(
      `CREATE TYPE "place_edit_proposal_status" AS ENUM ('pending','approved','rejected','needs_changes','conflict')`,
    );

    await queryRunner.query(`
      CREATE TABLE "place_edit_proposals" (
        "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "place_id"         UUID NOT NULL REFERENCES "places" ("id") ON DELETE RESTRICT,
        "field_key"        "place_edit_proposal_field_key" NOT NULL,
        -- Informational only for MVP — which locale the proposer was viewing when they noticed the
        -- discrepancy. The actual write target is always the base places column (canonical VI
        -- data); this feature does not touch place_translations. Nullable: opening_hours/address
        -- are not locale-scoped at all.
        "locale_code"      VARCHAR(35) REFERENCES "supported_locales" ("locale_code") ON DELETE NO ACTION,
        "proposed_value"   JSONB NOT NULL,
        "base_value_hash"  CHAR(64) NOT NULL,
        "reason"           VARCHAR(1000) NOT NULL,
        "source_url"       VARCHAR(500),
        "status"           "place_edit_proposal_status" NOT NULL DEFAULT 'pending',
        "proposer_id"      UUID NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
        "reviewer_id"      UUID REFERENCES "users" ("id") ON DELETE SET NULL,
        "reviewed_at"      TIMESTAMPTZ,
        "review_note"      VARCHAR(1000),
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "chk_place_edit_proposal_reason_not_blank" CHECK (btrim("reason") <> ''),
        CONSTRAINT "chk_place_edit_proposal_base_value_hash_format" CHECK ("base_value_hash" ~ '^[0-9a-f]{64}$'),
        -- A decision (reviewer/reviewed_at) may only exist together with a terminal-ish status —
        -- mirrors evidence_reviews' own "an expiry may only appear on APPROVE" all-or-nothing idiom.
        -- 'pending' may never carry reviewer/reviewed_at; every other status must.
        CONSTRAINT "chk_place_edit_proposal_decision_consistency" CHECK (
          ("status" = 'pending' AND "reviewer_id" IS NULL AND "reviewed_at" IS NULL)
          OR
          ("status" != 'pending' AND "reviewer_id" IS NOT NULL AND "reviewed_at" IS NOT NULL)
        )
      )
    `);

    // Anti-duplicate (task requirement: "ngăn gửi trùng"): one PENDING proposal per
    // (place, field, proposer) at a time. Does not block a NEW proposal once the prior one is
    // decided (approved/rejected/needs_changes/conflict) — re-submission after a decision is a
    // legitimate new attempt, not a duplicate.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_place_edit_proposal_pending_per_proposer_field"
        ON "place_edit_proposals" ("place_id", "field_key", "proposer_id")
        WHERE "status" = 'pending'
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_place_edit_proposals_place" ON "place_edit_proposals" ("place_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_place_edit_proposals_status" ON "place_edit_proposals" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT COUNT(*) AS proposal_count FROM "place_edit_proposals"`,
    )) as Array<{ proposal_count: string }>;
    const proposalCount = parseInt(rows[0]?.proposal_count ?? '0', 10);
    if (proposalCount > 0) {
      throw new Error(
        `InitPlaceEditProposals down() refused: ${proposalCount} proposal(s) exist. ` +
          `Dropping the schema would permanently destroy that history.`,
      );
    }

    await queryRunner.query(`DROP TABLE IF EXISTS "place_edit_proposals"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "place_edit_proposal_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "place_edit_proposal_field_key"`);
  }
}
