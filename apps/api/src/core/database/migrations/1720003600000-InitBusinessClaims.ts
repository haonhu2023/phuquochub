import { MigrationInterface, QueryRunner } from 'typeorm';

// ADR-015 (Business Ownership Model, Model A — Place-centric) — bảng đầu tiên của ADR-015 được
// migrate trong repository này (§Milestone interpretation: KHÔNG có M1/M2 trước đó — đây là
// prerequisite schema cho Claim Decision Workflow). Hai bảng MỚI, KHÔNG đụng `places`: cache
// verification (`places.verification_status`/`verified_at`, ADR-008 §Decision mục 3) là cơ chế
// Official DUY NHẤT dùng ở milestone này — Owner Decision 1: ADR-008 (`verifications`/
// `verification_events`/`verification_votes`) VẪN HOÃN, không tạo ở đây.
//
// business_id ở toàn hệ = places.id (ADR-015 §Decision mục 3) — `business_claims`/
// `business_members` dùng thẳng `place_id`, không có cột `business_id` riêng.
export class InitBusinessClaims1720003600000 implements MigrationInterface {
  name = 'InitBusinessClaims1720003600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "business_claim_status" AS ENUM ('pending','approved','rejected','disputed','withdrawn')`,
    );
    await queryRunner.query(
      `CREATE TYPE "business_claim_reason_code" AS ENUM ('insufficient_evidence','duplicate','fraud','wrong_target','other')`,
    );
    await queryRunner.query(`CREATE TYPE "business_member_role" AS ENUM ('owner','manager')`);

    // ---- business_claims (ADR-015 §2) ----
    await queryRunner.query(`
      CREATE TABLE "business_claims" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "place_id" uuid NOT NULL REFERENCES "places"("id") ON DELETE CASCADE,
        "requester_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE NO ACTION,
        "evidence" jsonb NOT NULL,
        "status" "business_claim_status" NOT NULL DEFAULT 'pending',
        "reviewer_id" uuid REFERENCES "users"("id") ON DELETE NO ACTION,
        "reason_code" "business_claim_reason_code",
        "decision_note" varchar(300),
        "decided_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "ck_business_claims_rejected_reason" CHECK ("status" <> 'rejected' OR "reason_code" IS NOT NULL)
      )
    `);

    // Chống spam: một người chỉ một claim đang chờ / một cơ sở (ADR-015 §2).
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_claim_pending" ON "business_claims" ("place_id","requester_id")
      WHERE "status" = 'pending'
    `);
    // Hàng đợi moderator theo cơ sở + trạng thái (ADR-015 §2).
    await queryRunner.query(`CREATE INDEX "idx_claim_queue" ON "business_claims" ("place_id","status")`);

    // ---- business_members (ADR-015 §3) ----
    await queryRunner.query(`
      CREATE TABLE "business_members" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "place_id" uuid NOT NULL REFERENCES "places"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "role" "business_member_role" NOT NULL,
        "claim_id" uuid REFERENCES "business_claims"("id") ON DELETE NO ACTION,
        "granted_by" uuid REFERENCES "users"("id") ON DELETE NO ACTION,
        "granted_at" timestamptz NOT NULL DEFAULT now(),
        "revoked_at" timestamptz
      )
    `);

    // BR-B2: một Owner hiệu lực / cơ sở — cưỡng chế ở CSDL (ADR-015 §3).
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_member_owner" ON "business_members" ("place_id")
      WHERE "role" = 'owner' AND "revoked_at" IS NULL
    `);
    // Một người một vai trò hiệu lực / cơ sở (ADR-015 §3).
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_member_active" ON "business_members" ("place_id","user_id")
      WHERE "revoked_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_member_user" ON "business_members" ("user_id") WHERE "revoked_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Cùng nguyên tắc tự-chối InitModeration1720003200000.down(): nếu bất kỳ claim nào đã có
    // `decided_at` (một quyết định moderator THẬT đã xảy ra — approve/reject/dispute-resolution),
    // revert lúc này sẽ xoá bằng chứng quyết định đó vĩnh viễn (audit_logs giữ SỰ KIỆN, không giữ
    // lại được state `business_claims`/`business_members` đã mất). Từ chối, yêu cầu xử lý thủ công.
    const [{ count }]: Array<{ count: string }> = await queryRunner.query(
      `SELECT count(*)::int AS count FROM "business_claims" WHERE "decided_at" IS NOT NULL`,
    );
    if (Number(count) > 0) {
      throw new Error(
        `InitBusinessClaims1720003600000.down() refused: ${count} claim(s) already have a real ` +
          `decision (decided_at IS NOT NULL). Reverting would silently destroy that decision history ` +
          `and any business_members ownership it granted. Resolve manually before reverting this migration.`,
      );
    }

    await queryRunner.query(`DROP TABLE IF EXISTS "business_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "business_claims"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "business_member_role"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "business_claim_reason_code"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "business_claim_status"`);
  }
}
