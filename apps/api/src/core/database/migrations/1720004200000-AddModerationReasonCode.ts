import { MigrationInterface, QueryRunner } from 'typeorm';

// Controlled Rejection Reasons (2026-08-12) — MỘT cột cộng thêm: `moderation_cases.reason_code`.
// Không đụng `media`, `reviews`, `reports`, và KHÔNG đụng cột `reason` sẵn có.
//
// Vì sao một cột trên `moderation_cases` chứ không phải bảng vệ tinh: mã lý do là THUỘC TÍNH của
// đúng một quyết định (1-1 với `decision`/`resolved_at` trên cùng dòng), không phải quan hệ nhiều
// dòng như `reports`/`ai_recommendations`. Bảng riêng sẽ cần join chỉ để đọc một enum, và mở khả
// năng "nhiều mã lý do cho một quyết định" — một trạng thái vô nghĩa mà không ai muốn phải xử lý.
//
// Enum CSDL thật (`media_moderation_reason_code`), không phải varchar + enum ứng dụng: đúng tiền
// lệ `business_claim_reason_code` (InitBusinessClaims) và mọi enum khác của module này
// (`moderation_decision`, `report_reason` — InitModeration). Giá trị lạ bị CSDL từ chối kể cả khi
// một đường ghi tương lai quên validate.
//
// NULLABLE và KHÔNG CHECK — cố ý, để tương thích ngược với LỊCH SỬ:
//  • mọi case đã `resolved` trước milestone này có `reason != null` (INV-11) nhưng `reason_code`
//    sẽ là NULL. Đó là dữ liệu HỢP LỆ, không phải hỏng.
//  • KHÔNG backfill, KHÔNG suy đoán mã từ text tự do cũ: `reason` là câu chữ tự do của moderator,
//    mọi phép đoán đều có thể gán nhầm một lý do SAI rồi hiển thị nó cho chủ cơ sở như thể đó là
//    phán quyết thật. Thà không có lý do còn hơn có lý do sai.
//  • Ràng buộc "reject trên media BẮT BUỘC có reason_code" (KHÔNG áp dụng cho hide — xem
//    MediaModerationReasonCode ở moderation.enums.ts) sống ở TẦNG SERVICE
//    (ModerationService.decideMedia), đúng cùng chỗ và cùng lý do với INV-11 cho `reason` —
//    entity/migration cố ý không cưỡng chế (xem ghi chú trên `ModerationCase.reason`). Một CHECK
//    kiểu `ck_business_claims_rejected_reason` sẽ biến toàn bộ case lịch sử thành vi phạm.
export class AddModerationReasonCode1720004200000 implements MigrationInterface {
  name = 'AddModerationReasonCode1720004200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "media_moderation_reason_code" AS ENUM ('inappropriate_content','low_quality','unrelated_to_place','copyright','other')`,
    );
    // ADD COLUMN nullable, không DEFAULT: không viết gì vào dòng cũ (metadata-only trên PG 11+),
    // và không có giá trị mặc định nào giả vờ rằng một case lịch sử đã được phân loại.
    await queryRunner.query(
      `ALTER TABLE "moderation_cases" ADD COLUMN "reason_code" "media_moderation_reason_code"`,
    );
    // KHÔNG index: đường đọc duy nhất (chủ cơ sở xem ảnh của MỘT cơ sở) lọc theo
    // (target_type, target_id) — đã có `idx_moderation_cases_target` — rồi mới đọc cột này.
    // reason_code không bao giờ là vị từ lọc đứng một mình.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // MR-5 (tiền lệ InitModeration.down()/AddMediaUploadFoundation.down()): KHÔNG âm thầm huỷ lịch
    // sử quyết định. `reason_code` là phần PHÂN LOẠI của một quyết định kiểm duyệt thật — DROP
    // COLUMN xoá nó vĩnh viễn và KHÔNG khôi phục lại được từ `reason` (text tự do không suy ngược
    // ra enum). Rỗng thì revert vô hại; có dữ liệu thì dừng và nói rõ.
    const [{ count }]: Array<{ count: string }> = await queryRunner.query(
      `SELECT count(*)::int AS count FROM "moderation_cases" WHERE "reason_code" IS NOT NULL`,
    );
    if (Number(count) > 0) {
      throw new Error(
        `AddModerationReasonCode1720004200000.down() refused: ${count} moderation case(s) carry a ` +
          `controlled reason_code (real moderator classifications shown to content owners). ` +
          `Dropping the column would destroy them permanently — the free-text "reason" column is a ` +
          `different field and cannot be converted back into these codes. Resolve manually before ` +
          `reverting this migration.`,
      );
    }

    await queryRunner.query(`ALTER TABLE "moderation_cases" DROP COLUMN "reason_code"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "media_moderation_reason_code"`);
  }
}
