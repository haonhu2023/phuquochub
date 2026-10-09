import { MigrationInterface, QueryRunner } from 'typeorm';

// "Tách phản hồi public khỏi note nội bộ" (mục V đợt 2) — `review_note` (đã có) là ghi chú NỘI BỘ
// giữa các moderator, KHÔNG BAO GIỜ lộ cho người gửi (xem toPlaceEditProposalSenderView() và spec
// riêng khẳng định điều đó). Người gửi trước nay chỉ thấy trạng thái (duyệt/từ chối/xung đột), chưa
// có cách nào đọc được LÝ DO bằng lời — cột này là đúng "phản hồi public" còn thiếu, một cột HOÀN
// TOÀN khác `review_note`, không thay thế hay dùng chung.
//
// Chỉ thêm cột NULLABLE; không backfill — mọi đề xuất đã quyết định trước đây "chưa có phản hồi",
// không suy đoán ngược một nội dung nào cho chúng.
export class AddPlaceEditProposalSenderMessage1720008800000 implements MigrationInterface {
  name = 'AddPlaceEditProposalSenderMessage1720008800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "place_edit_proposals" ADD COLUMN "sender_message" varchar(1000) NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "place_edit_proposals" DROP COLUMN IF EXISTS "sender_message"`);
  }
}
