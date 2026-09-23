import { MigrationInterface, QueryRunner } from 'typeorm';

// Source-First Publish Pipeline (2026-09-18).
//
// Hai thay đổi schema:
//
// 1. source_attributions: 3 cột freshness — theo dõi tươi/cũ theo field, phục vụ freshness job
//    (recheck_date) và trạng thái xung đột (conflict_state). staleness_state='needs_check' là gắn
//    nhãn CẢNH BÁO, KHÔNG xóa profile — theo chính sách: dữ liệu cũ vẫn hiển thị, chỉ có badge.
//
// 2. owner_decision_queue: hàng chờ quyết định có cấu trúc — mỗi hàng là MỘT câu hỏi cụ thể
//    (place_id + field + question_type + hai nguồn xung đột + đề xuất + fail_safe). Pipeline tự
//    publish khi không có xung đột; HOLD chỉ khi cần quyết định thực sự. Business claim là luồng
//    xác nhận bổ sung, không phải điều kiện để listing.
export class SourceFirstPublishPipeline1720005300000 implements MigrationInterface {
  name = 'SourceFirstPublishPipeline1720005300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Freshness tracking on source_attributions ──────────────────────────
    await queryRunner.query(`
      ALTER TABLE source_attributions
        ADD COLUMN IF NOT EXISTS recheck_date date,
        ADD COLUMN IF NOT EXISTS staleness_state varchar(20) NOT NULL DEFAULT 'fresh',
        ADD COLUMN IF NOT EXISTS conflict_state  varchar(20) NOT NULL DEFAULT 'clean'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN source_attributions.recheck_date     IS 'When this fact should be re-verified; null = perpetual';
      COMMENT ON COLUMN source_attributions.staleness_state  IS 'fresh | needs_check | stale';
      COMMENT ON COLUMN source_attributions.conflict_state   IS 'clean | flagged | resolved'
    `);
    // Partial indexes — only rows that need action are indexed.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_source_attr_staleness
        ON source_attributions (staleness_state)
        WHERE staleness_state <> 'fresh'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_source_attr_recheck
        ON source_attributions (recheck_date)
        WHERE recheck_date IS NOT NULL
    `);

    // ── 2. Owner Decision Queue ───────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE owner_decision_queue (
        id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        place_id        uuid        REFERENCES places(id) ON DELETE SET NULL,
        candidate_key   varchar(200),
        field           varchar(60),
        question_type   varchar(40) NOT NULL,
        source_a_url    varchar(500),
        source_a_type   varchar(40),
        source_b_url    varchar(500),
        source_b_type   varchar(40),
        conflict_summary text,
        recommendation  text,
        fail_safe       varchar(80),
        status          varchar(20) NOT NULL DEFAULT 'pending',
        resolved_by     uuid,
        resolved_at     timestamptz,
        resolution      jsonb,
        actor_scope     varchar(200),
        expires_at      timestamptz,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now()
      )
    `);
    // Fixed 2026-09-22: `COMMENT ON TABLE ... IS <expr>` requires a single string LITERAL, not an
    // expression — Postgres' grammar for this statement does not accept `||` concatenation here
    // (confirmed by running this migration: "syntax error at or near '||'"). One literal string
    // instead of four concatenated ones; same text, just not split across lines with `||`.
    await queryRunner.query(`
      COMMENT ON TABLE owner_decision_queue
        IS 'Structured questions waiting for owner/moderator input — source-first publish pipeline. question_type: identity_conflict | address_conflict | hours_conflict | contact_conflict | insufficient_sources | photo_rights | primary_selection. status: pending | resolved | expired | withdrawn. fail_safe: hold_publish | use_source_a | use_source_b | skip_field | publish_anyway.'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_odq_place_pending
        ON owner_decision_queue (place_id)
        WHERE place_id IS NOT NULL AND status = 'pending'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_odq_candidate
        ON owner_decision_queue (candidate_key)
        WHERE candidate_key IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_odq_status
        ON owner_decision_queue (status, created_at)
        WHERE status = 'pending'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS owner_decision_queue`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_source_attr_staleness`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_source_attr_recheck`);
    await queryRunner.query(`
      ALTER TABLE source_attributions
        DROP COLUMN IF EXISTS recheck_date,
        DROP COLUMN IF EXISTS staleness_state,
        DROP COLUMN IF EXISTS conflict_state
    `);
  }
}
