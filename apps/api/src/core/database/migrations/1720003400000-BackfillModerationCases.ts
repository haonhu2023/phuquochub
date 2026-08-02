import { MigrationInterface, QueryRunner } from 'typeorm';

// Moderation Foundation, M3 (ADR-018 D14/O7, moderation-design.md T4). Media tạo TRƯỚC M3 không
// được T1's auto-publish-on-attach phủ (T1 chỉ áp cho review VỪA ĐƯỢC TẠO từ nay trở đi) — đây là
// đường XỬ LÝ MỘT LẦN cho phần còn lại đó, chạy Ở MIGRATION-TIME (không phải runtime service —
// O7 chốt tường minh: một lần, không có cơ chế thứ hai).
//
// Điều kiện (ĐỦ CẢ 3, đúng D14 — CHỈ media ĐÃ GẮN review, KHÔNG đụng media mồ côi vốn đã có chủ
// thể xử lý riêng là `media:cleanup`):
//   status = 'pending' AND review_id IS NOT NULL AND deleted_at IS NULL
//
// Hành động: MỘT case `open`/`new_content`/`normal` (=> priority 10) cho mỗi dòng đủ điều kiện.
// TUYỆT ĐỐI KHÔNG UPDATE `media` — không publish hàng loạt, không bulk publish, không đổi
// media.status (O7). Idempotent theo CẤU TRÚC: `ON CONFLICT DO NOTHING` khớp
// `uq_moderation_cases_open_target` (partial unique index D8) — chạy migration này hai lần cho
// kết quả y hệt chạy một lần, giữ nguyên bất biến INV-3 (một case mở mỗi target) theo cấu trúc,
// không theo quy ước.
export class BackfillModerationCases1720003400000 implements MigrationInterface {
  name = 'BackfillModerationCases1720003400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // MR-1: đếm và BÁO CÁO TRƯỚC khi ghi, không phải sau — chạy ngoài NestJS DI (migration CLI)
    // nên không có AppLoggerService; console.log là kênh duy nhất operator nhìn thấy khi chạy
    // `migration:run` (cùng tiền lệ console.error trong clean-orphan-media.ts, script cũng chạy
    // ngoài DI).
    const [{ count: candidateCount }]: Array<{ count: string }> = await queryRunner.query(
      `SELECT count(*)::int AS count FROM "media"
       WHERE "status" = 'pending' AND "review_id" IS NOT NULL AND "deleted_at" IS NULL`,
    );
    // eslint-disable-next-line no-console -- báo cáo bắt buộc trước-khi-ghi (MR-1), không phải log runtime.
    console.log(
      `BackfillModerationCases1720003400000: ${candidateCount} media row(s) eligible ` +
        `(status=pending, review_id IS NOT NULL, deleted_at IS NULL). Creating up to ` +
        `${candidateCount} moderation_cases row(s) (source=new_content, severity=normal, ` +
        `priority=10). media.status is NOT changed by this migration (O7).`,
    );

    const created: Array<{ id: string }> = await queryRunner.query(`
      INSERT INTO "moderation_cases"
             ("target_type","target_id","status","source","severity","priority","report_count")
      SELECT 'media', m."id", 'open', 'new_content', 'normal', 10, 0
        FROM "media" m
       WHERE m."status" = 'pending'
         AND m."review_id" IS NOT NULL
         AND m."deleted_at" IS NULL
      ON CONFLICT DO NOTHING
      RETURNING "id"
    `);

    // eslint-disable-next-line no-console
    console.log(`BackfillModerationCases1720003400000: created ${created.length} moderation_cases row(s).`);

    // T4 bước 2 — một dòng audit tổng hợp (KHÔNG dùng AuditService — migration chạy ngoài DI).
    // entity_id để NULL: bản ghi này bao phủ NHIỀU media, không phải một entity đơn lẻ.
    await queryRunner.query(
      `INSERT INTO "audit_logs"
             ("event","entity_type","is_service_account","result","context")
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        'moderation.backfilled',
        'media',
        true,
        'success',
        JSON.stringify({ candidate_count: Number(candidateCount), created_count: created.length }),
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // MR-5: KHÔNG âm thầm huỷ lịch sử quyết định. Nếu bất kỳ case do CHÍNH backfill này tạo
    // (source='new_content') đã được resolved/dismissed, một quyết định kiểm duyệt THẬT đã xảy
    // ra trên nó — từ chối revert thay vì xoá bằng chứng đó.
    const [{ count: decidedCount }]: Array<{ count: string }> = await queryRunner.query(
      `SELECT count(*)::int AS count FROM "moderation_cases"
       WHERE "source" = 'new_content' AND "status" IN ('resolved','dismissed')`,
    );
    if (Number(decidedCount) > 0) {
      throw new Error(
        `BackfillModerationCases1720003400000.down() refused: ${decidedCount} backfilled case(s) ` +
          `(source='new_content') have already been resolved/dismissed — a real moderation decision ` +
          `was made. Reverting would silently destroy that decision history. Resolve manually before ` +
          `reverting this migration.`,
      );
    }

    // Chỉ xoá ĐÚNG các dòng migration này có thể đã tạo — vẫn 'open', report_count=0 (chưa từng
    // nhận report nào kể từ khi backfill, vì M5 chưa triển khai — điều kiện này chỉ để phòng thủ
    // thêm một lớp nếu M5 ra đời trước khi ai đó revert migration cũ này).
    await queryRunner.query(
      `DELETE FROM "moderation_cases"
       WHERE "source" = 'new_content' AND "status" = 'open' AND "report_count" = 0`,
    );
    await queryRunner.query(`DELETE FROM "audit_logs" WHERE "event" = 'moderation.backfilled'`);
  }
}
