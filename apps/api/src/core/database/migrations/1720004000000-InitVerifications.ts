import { MigrationInterface, QueryRunner } from 'typeorm';

// ADR-008 Verification Foundation (verification.md §3-§5C, database.md §3.16-3.18). Exclusive arc
// (Place/Contact/PriceHistory) — real FK + CHECK, NOT polymorphic (ADR-003 exception granted the
// same as InitBusinessClaims/InitModeration precedent, for the same "must cascade correctly"
// reason). Reuses the EXISTING `verification_status` enum type (created by InitPlaces for the
// `places`/`contacts`/`price_history` cache columns) for `verifications.status` — the cache and the
// new state-machine entity share literally the same 6-value type, by design (ADR-008 §Decision
// mục 3-4).
//
// Owner Decision (2026-08-06, ADR-008 kickoff): BusinessClaimsService.decide() is explicitly LEFT
// UNCHANGED by this milestone — it continues writing places.verificationStatus/verifiedAt directly
// on claim approval, WITHOUT creating a verifications/verification_events row. This table is
// therefore NOT yet the sole source of truth for the ADR-015 claim path; that integration
// (business_claims -> Source -> Verification) is explicit future work requiring its own Source-
// model decision. See docs/99-decisions/ADR-008-verification-model.md Implementation Status.
export class InitVerifications1720004000000 implements MigrationInterface {
  name = 'InitVerifications1720004000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "verification_method" AS ENUM ('moderator','owner_claim','source_match','community_vote','system_auto')`,
    );
    await queryRunner.query(
      `CREATE TYPE "verification_reason_code" AS ENUM ('duplicate','fabricated','outdated','insufficient_evidence','policy_violation','wrong_target','other')`,
    );
    await queryRunner.query(`CREATE TYPE "verification_vote_choice" AS ENUM ('confirm','dispute')`);

    // ---- verifications (verification.md §4) ----
    await queryRunner.query(`
      CREATE TABLE "verifications" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "place_id" uuid REFERENCES "places"("id") ON DELETE CASCADE,
        "contact_id" uuid REFERENCES "contacts"("id") ON DELETE CASCADE,
        "price_history_id" uuid REFERENCES "price_history"("id") ON DELETE CASCADE,
        "status" "verification_status" NOT NULL DEFAULT 'pending',
        "method" "verification_method" NOT NULL,
        "source_id" uuid REFERENCES "sources"("id") ON DELETE NO ACTION,
        "confidence" smallint,
        "confirm_count" int NOT NULL DEFAULT 0,
        "dispute_count" int NOT NULL DEFAULT 0,
        "reason_code" "verification_reason_code",
        "verified_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "assigned_to" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "assigned_at" timestamptz,
        "sla_due_at" timestamptz,
        "priority" smallint NOT NULL DEFAULT 0,
        "note" varchar(300),
        "rejected_reason" varchar(300),
        "valid_from" timestamptz,
        "expires_at" timestamptz,
        "lock_version" int NOT NULL DEFAULT 0,
        "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_verif_one_target" CHECK (
          (("place_id" IS NOT NULL)::int + ("contact_id" IS NOT NULL)::int + ("price_history_id" IS NOT NULL)::int) = 1
        ),
        CONSTRAINT "ck_verif_official_source" CHECK ("status" <> 'official' OR "source_id" IS NOT NULL),
        CONSTRAINT "ck_verif_rejected_reason" CHECK ("status" <> 'rejected' OR "reason_code" IS NOT NULL),
        CONSTRAINT "ck_verif_confidence_range" CHECK ("confidence" IS NULL OR ("confidence" BETWEEN 0 AND 100))
      )
    `);

    // Mỗi mẩu dữ liệu chỉ MỘT xác minh (đúng MỘT dòng, tái sử dụng xuyên suốt vòng đời — verification.md §4).
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_verif_place" ON "verifications" ("place_id") WHERE "place_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_verif_contact" ON "verifications" ("contact_id") WHERE "contact_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_verif_price" ON "verifications" ("price_history_id") WHERE "price_history_id" IS NOT NULL`,
    );
    await queryRunner.query(`CREATE INDEX "idx_verif_status" ON "verifications" ("status")`);
    await queryRunner.query(`
      CREATE INDEX "idx_verif_expires" ON "verifications" ("expires_at")
      WHERE "status" IN ('verified','official','community_verified')
    `);
    await queryRunner.query(`CREATE INDEX "idx_verif_source" ON "verifications" ("source_id")`);
    await queryRunner.query(`
      CREATE INDEX "idx_verif_queue" ON "verifications" ("assigned_to","sla_due_at") WHERE "status" = 'pending'
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_verif_sla" ON "verifications" ("sla_due_at") WHERE "status" = 'pending'
    `);

    // ---- verification_events (verification.md §5) — append-only, bất biến ----
    await queryRunner.query(`
      CREATE TABLE "verification_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "verification_id" uuid NOT NULL REFERENCES "verifications"("id") ON DELETE CASCADE,
        "from_status" "verification_status",
        "to_status" "verification_status" NOT NULL,
        "method" "verification_method" NOT NULL,
        "source_id" uuid REFERENCES "sources"("id") ON DELETE SET NULL,
        "actor_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "note" varchar(300),
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_verif_event_verif" ON "verification_events" ("verification_id","created_at")`,
    );

    // ---- verification_votes (verification.md §5B) — sổ phiếu, một người một phiếu ----
    await queryRunner.query(`
      CREATE TABLE "verification_votes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "verification_id" uuid NOT NULL REFERENCES "verifications"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "vote" "verification_vote_choice" NOT NULL,
        "weight" smallint NOT NULL DEFAULT 1,
        "note" varchar(300),
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_vote_user" ON "verification_votes" ("verification_id","user_id")`,
    );
    await queryRunner.query(`CREATE INDEX "idx_vote_verif" ON "verification_votes" ("verification_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Cùng nguyên tắc tự-chối InitBusinessClaims1720003600000.down()/InitModeration.down(): nếu đã
    // có bất kỳ verification_events nào (một transition THẬT đã xảy ra), revert sẽ xoá vĩnh viễn
    // audit trail đó — audit_logs (platform-wide) không giữ lại được chi tiết domain-level
    // (from_status/to_status/method/source_id) của verification_events. Từ chối, yêu cầu xử lý thủ công.
    const [{ count }]: Array<{ count: string }> = await queryRunner.query(
      `SELECT count(*)::int AS count FROM "verification_events"`,
    );
    if (Number(count) > 0) {
      throw new Error(
        `InitVerifications1720004000000.down() refused: ${count} verification_events row(s) already ` +
          `exist (a real transition has happened). Reverting would silently destroy that audit trail. ` +
          `Resolve manually before reverting this migration.`,
      );
    }

    await queryRunner.query(`DROP TABLE IF EXISTS "verification_votes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "verification_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "verifications"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "verification_vote_choice"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "verification_reason_code"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "verification_method"`);
  }
}
