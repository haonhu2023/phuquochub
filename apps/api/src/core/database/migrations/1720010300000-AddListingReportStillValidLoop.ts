import { MigrationInterface, QueryRunner } from 'typeorm';

// Giai đoạn 2 (21/10/2026) — vòng lặp "còn đúng không?": người xem báo "không liên hệ được"/"đã
// hết/đã tuyển đủ" → người đăng tự xác nhận "vẫn còn" → admin xử lý phần còn tồn đọng. Áp dụng
// TRƯỚC cho tin tuyển dụng (owner yêu cầu rõ — real-estate/place để sau).
//
// 2 lý do mới + 1 trạng thái mới, CÙNG hình dạng ADD VALUE thuần cộng thêm như
// AddPlaceListableTargetType1720010200000/AddGuideArticleRevisionEntityType1720005900000 — không
// ALTER/DROP dữ liệu đang có.
//
// `self_confirmed` TÁCH RIÊNG khỏi `resolved` có chủ đích: một report do MODERATOR xử lý
// (resolved/dismissed, qua xét duyệt độc lập) mang trọng lượng khác hẳn một report do CHÍNH người
// đăng tự xác nhận (self_confirmed, chỉ là lời khẳng định một phía) — không gộp chung một trạng
// thái để tránh hiểu nhầm "đã được bên thứ ba xác minh" khi thực ra chỉ là tự khai.
export class AddListingReportStillValidLoop1720010300000 implements MigrationInterface {
  name = 'AddListingReportStillValidLoop1720010300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "listing_report_reason" ADD VALUE IF NOT EXISTS 'not_reachable'`);
    await queryRunner.query(`ALTER TYPE "listing_report_reason" ADD VALUE IF NOT EXISTS 'no_longer_available'`);
    await queryRunner.query(`ALTER TYPE "listing_report_status" ADD VALUE IF NOT EXISTS 'self_confirmed'`);
  }

  public async down(): Promise<void> {
    // No-op theo thiết kế — Postgres không có `ALTER TYPE ... DROP VALUE` (cùng lý do các migration
    // ADD VALUE khác trong repo này).
  }
}
