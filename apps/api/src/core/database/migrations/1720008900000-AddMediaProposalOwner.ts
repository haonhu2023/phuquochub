import { MigrationInterface, QueryRunner } from 'typeorm';

// "Ảnh góp ý qua media moderation" (mục V đợt 2 — còn thiếu duy nhất sau sender_message, xem status
// doc §13q). `media` đã có "exclusive arc" 5 nhánh chủ sở hữu (place/review/post/business/event,
// xem media.entity.ts) — thêm nhánh THỨ 6 (`proposal_id`), ĐÚNG theo tiền lệ đã có (event_id được
// thêm sau khi events tồn tại: FK thêm sau, CHECK constraint SỬA LẠI để cộng thêm điều kiện, không
// tạo bảng/kiến trúc song song mới). KHÔNG tái dùng place_id/review_id cho mục đích này — ảnh góp ý
// không "thuộc" một place hay review, nó thuộc về CHÍNH đề xuất đang chờ duyệt.
//
// Constraint tên GIỮ NGUYÊN `chk_media_at_most_one_owner` (từ AddMediaUploadFoundation,
// 1720002900000) — ngữ nghĩa "tối đa một chủ" không đổi, chỉ thêm một nhánh vào tổng.
export class AddMediaProposalOwner1720008900000 implements MigrationInterface {
  name = 'AddMediaProposalOwner1720008900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media" ADD COLUMN "proposal_id" uuid REFERENCES "place_edit_proposals"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(`ALTER TABLE "media" DROP CONSTRAINT "chk_media_at_most_one_owner"`);
    await queryRunner.query(`
      ALTER TABLE "media" ADD CONSTRAINT "chk_media_at_most_one_owner" CHECK (
        ("place_id" IS NOT NULL)::int + ("review_id" IS NOT NULL)::int
        + ("post_id" IS NOT NULL)::int + ("business_id" IS NOT NULL)::int
        + ("event_id" IS NOT NULL)::int + ("proposal_id" IS NOT NULL)::int <= 1
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Giữ đúng kỷ luật "throwing down()" đã có ở AddMediaUploadFoundation: revert mà ÂM THẦM xoá
    // dữ liệu thật (ảnh góp ý đã có người tải lên) là một dạng mất dữ liệu, không phải rollback an
    // toàn — xem mục VIII "không mặc định chạy down migration làm mất dữ liệu mới".
    const rows: Array<{ count: string }> = await queryRunner.query(
      `SELECT count(*)::text AS count FROM "media" WHERE "proposal_id" IS NOT NULL`,
    );
    if (Number(rows[0]?.count ?? '0') > 0) {
      throw new Error(
        'AddMediaProposalOwner.down() refused: media rows with proposal_id exist — ' +
          'reverting would either drop that column (data loss) or violate the restored 5-branch ' +
          'constraint. Resolve those rows (delete/reassign) before rolling back.',
      );
    }
    await queryRunner.query(`ALTER TABLE "media" DROP CONSTRAINT "chk_media_at_most_one_owner"`);
    await queryRunner.query(`
      ALTER TABLE "media" ADD CONSTRAINT "chk_media_at_most_one_owner" CHECK (
        ("place_id" IS NOT NULL)::int + ("review_id" IS NOT NULL)::int
        + ("post_id" IS NOT NULL)::int + ("business_id" IS NOT NULL)::int
        + ("event_id" IS NOT NULL)::int <= 1
      )
    `);
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN IF EXISTS "proposal_id"`);
  }
}
