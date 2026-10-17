import { MigrationInterface, QueryRunner } from 'typeorm';

// Gói D, luồng rich-text ĐẦU TIÊN (ADR-DELIVERY-002) — mô tả tuyển dụng (`job_listings.description`).
// Cột MỚI, NULLABLE, SONG SONG với `description` (varchar) hiện có — KHÔNG đổi/xoá cột cũ, KHÔNG
// backfill hàng loạt (owner yêu cầu rõ: "không tự chuyển đổi hàng loạt nội dung production"). Dữ
// liệu cũ (mọi hàng hiện có) giữ `description_rich = NULL` và tiếp tục hiển thị ĐÚNG như trước —
// renderer coi NULL là "chưa có rich text, dùng cột plain text cũ", xem RichDescriptionRenderer.
//
// Quy tắc nguồn-sự-thật (JobListingsService.applyDescription(), xem ghi chú ở đó): khi
// `description_rich` KHÔNG NULL, nó là ĐÚNG MỘT nguồn — `description` (plain) luôn được ghi ĐỒNG
// THỜI làm một PROJECTION phẳng dẫn xuất từ nó (flattenRichDocToPlainText) — KHÔNG BAO GIỜ để hai
// cột lệch nhau. Nhờ vậy mọi chỗ đọc `description` plain sẵn có (JSON-LD, meta, thẻ danh sách, hash
// lỗi thời) tiếp tục đúng mà không cần sửa gì thêm.
export class AddJobListingDescriptionRich1720009500000 implements MigrationInterface {
  name = 'AddJobListingDescriptionRich1720009500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "job_listings" ADD COLUMN "description_rich" JSONB`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "job_listings" DROP COLUMN "description_rich"`);
  }
}
