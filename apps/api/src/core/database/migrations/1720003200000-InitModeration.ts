import { MigrationInterface, QueryRunner } from 'typeorm';

// Moderation Foundation, M1 (ADR-018, Accepted 2026-08-02 — docs/99-decisions/ADR-018-moderation-
// foundation.md; chi tiết schema đầy đủ ở docs/data/modules/moderation-design.md §6). Hai bảng
// MỚI, KHÔNG đụng media/reviews/users — trạng thái hiển thị nội dung tiếp tục sống trên
// media.status/reviews.status (INV-1/INV-2), bảng ở đây chỉ mô tả CÔNG VIỆC kiểm duyệt.
//
// target_type/target_id là tham chiếu ĐA HÌNH tới nội dung (review/media/place — ADR-018 D9),
// CỐ Ý KHÔNG FK cứng, KHÔNG cascade: một case phải sống sót khi target bị xoá để giữ nguyên bằng
// chứng đã từng xử lý (cùng ngoại lệ ADR-016 đã áp cho audit_logs). case_id (reports -> cases) thì
// NGƯỢC LẠI — FK thật + CASCADE, vì một report không gắn với case nào là vô nghĩa.
//
// uq_moderation_cases_open_target (partial unique index) là bất biến INV-3 ("tối đa một case
// open/claimed cho mỗi target") — cưỡng chế ở tầng CSDL, KHÔNG phải quy ước service, cùng cơ chế
// idx_places_status_active (AddPlacesStatusPartialIndex) đã diễn tập revert/reapply ở PLACE-042.
export class InitModeration1720003200000 implements MigrationInterface {
  name = 'InitModeration1720003200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "moderation_target_type" AS ENUM ('review','media','place')`,
    );
    await queryRunner.query(
      `CREATE TYPE "moderation_case_status" AS ENUM ('open','claimed','resolved','dismissed')`,
    );
    await queryRunner.query(
      `CREATE TYPE "moderation_case_source" AS ENUM ('new_content','report','ai_flag','manual')`,
    );
    await queryRunner.query(
      `CREATE TYPE "moderation_case_severity" AS ENUM ('low','normal','high','critical')`,
    );
    await queryRunner.query(
      `CREATE TYPE "moderation_decision" AS ENUM ('approve','reject','hide','restore','dismiss')`,
    );
    await queryRunner.query(
      `CREATE TYPE "report_reason" AS ENUM ('spam','misinformation','offensive','irrelevant','copyright','personal_info','other')`,
    );
    await queryRunner.query(`CREATE TYPE "report_status" AS ENUM ('open','upheld','dismissed')`);

    // ---- moderation_cases ----
    await queryRunner.query(`
      CREATE TABLE "moderation_cases" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "target_type" "moderation_target_type" NOT NULL,
        "target_id" uuid NOT NULL,
        "status" "moderation_case_status" NOT NULL DEFAULT 'open',
        "source" "moderation_case_source" NOT NULL,
        "severity" "moderation_case_severity" NOT NULL DEFAULT 'low',
        "priority" smallint NOT NULL DEFAULT 0,
        "report_count" int NOT NULL DEFAULT 0,
        "assigned_to" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "claimed_at" timestamptz,
        "decision" "moderation_decision",
        "reason" text,
        "resolved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "resolved_at" timestamptz,
        "ai_score" numeric(4,3),
        "ai_labels" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // INV-3: tối đa MỘT case open/claimed cho mỗi target — bất biến cưỡng chế ở CSDL.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_moderation_cases_open_target" ON "moderation_cases" ("target_type","target_id")
      WHERE "status" IN ('open','claimed')
    `);
    // Đường đọc hàng chờ (M2) — priority DESC, report_count DESC, created_at ASC, chỉ case còn mở.
    await queryRunner.query(`
      CREATE INDEX "idx_moderation_cases_queue" ON "moderation_cases" ("priority" DESC,"report_count" DESC,"created_at" ASC)
      WHERE "status" IN ('open','claimed')
    `);
    // Lịch sử mọi case (kể cả đã resolved) của một target cụ thể.
    await queryRunner.query(
      `CREATE INDEX "idx_moderation_cases_target" ON "moderation_cases" ("target_type","target_id")`,
    );
    await queryRunner.query(`
      CREATE INDEX "idx_moderation_cases_assigned" ON "moderation_cases" ("assigned_to") WHERE "status" = 'claimed'
    `);

    // ---- reports ----
    await queryRunner.query(`
      CREATE TABLE "reports" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "case_id" uuid NOT NULL REFERENCES "moderation_cases"("id") ON DELETE CASCADE,
        "target_type" "moderation_target_type" NOT NULL,
        "target_id" uuid NOT NULL,
        "reporter_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "reason" "report_reason" NOT NULL,
        "description" varchar(1000),
        "status" "report_status" NOT NULL DEFAULT 'open',
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // WF-12 "chống report trùng" — một người chỉ báo cáo một target đúng một lần.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_reports_one_per_reporter" ON "reports" ("target_type","target_id","reporter_id")`,
    );
    await queryRunner.query(`CREATE INDEX "idx_reports_case" ON "reports" ("case_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // MR-5: KHÔNG bao giờ âm thầm huỷ lịch sử quyết định. Nếu bất kỳ case nào đã `resolved`, một
    // quyết định kiểm duyệt THẬT đã xảy ra — revert lúc này sẽ xoá bằng chứng đó vĩnh viễn. Đúng
    // tiền lệ tự bảo vệ của AddMediaUploadFoundation.down().
    const [{ count }]: Array<{ count: string }> = await queryRunner.query(
      `SELECT count(*)::int AS count FROM "moderation_cases" WHERE "status" = 'resolved'`,
    );
    if (Number(count) > 0) {
      throw new Error(
        `InitModeration1720003200000.down() refused: ${count} case(s) are already 'resolved' ` +
          `(real moderation decisions were made). Reverting would silently destroy that decision ` +
          `history — audit_logs retains the event, not the case state. Resolve manually before ` +
          `reverting this migration.`,
      );
    }

    await queryRunner.query(`DROP TABLE IF EXISTS "reports"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "moderation_cases"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "report_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "report_reason"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "moderation_decision"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "moderation_case_severity"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "moderation_case_source"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "moderation_case_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "moderation_target_type"`);
  }
}
