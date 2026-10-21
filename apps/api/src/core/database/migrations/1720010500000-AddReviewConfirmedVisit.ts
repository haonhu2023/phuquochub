import { MigrationInterface, QueryRunner } from 'typeorm';

// Giai đoạn 4 (chiến lược data-hub, strategy-data-hub-2026-10-21.md §Giai đoạn 4) — gắn quyền viết
// đánh giá với bằng chứng đã từng đặt/ở thật. "Không bắt buộc ngay" (nguyên văn chiến lược): KHÔNG
// chặn tạo review khi không có booking — chỉ đánh dấu KHÁC review ẩn danh khi CÓ.
//
// `verified_booking_id` nullable, FK tới `bookings(id)` ON DELETE SET NULL (không CASCADE xoá
// review — booking không bao giờ bị xoá cứng trong hệ thống hiện tại, chỉ chuyển trạng thái, nên
// nhánh này chủ yếu phòng thủ; mất liên kết bằng chứng không nên kéo mất cả đánh giá). Lưu THẲNG id
// booking cụ thể (không phải cờ boolean đơn thuần) để giữ khả năng truy vết "xác nhận qua booking
// nào" sau này — cùng tinh thần giữ real FK thay vì cờ rời rạc đã thấy ở Booking.placeId.
//
// Ghi MỘT LẦN lúc tạo review (bất biến, cùng thiết kế "review không có updated_at" ở InitReviews) —
// không tự cập nhật lại nếu booking sau đó đổi trạng thái (vd bị huỷ sau khi đã review — hiếm, và
// việc đã CÓ booking confirmed tại thời điểm review là bằng chứng đã xảy ra, không mất giá trị dù
// booking đó sau này đổi trạng thái).
export class AddReviewConfirmedVisit1720010500000 implements MigrationInterface {
  name = 'AddReviewConfirmedVisit1720010500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD COLUMN "verified_booking_id" uuid REFERENCES "bookings"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Cùng kỷ luật "throwing down()" đã có ở AddMediaProposalOwner: âm thầm xoá bằng chứng đã-từng-
    // đến của review thật là mất dữ liệu, không phải rollback an toàn.
    const rows: Array<{ count: string }> = await queryRunner.query(
      `SELECT count(*)::text AS count FROM "reviews" WHERE "verified_booking_id" IS NOT NULL`,
    );
    if (Number(rows[0]?.count ?? '0') > 0) {
      throw new Error(
        'AddReviewConfirmedVisit.down() refused: reviews with verified_booking_id exist — ' +
          'dropping the column would silently discard real "confirmed visited" evidence. ' +
          'Resolve those rows before rolling back.',
      );
    }
    await queryRunner.query(`ALTER TABLE "reviews" DROP COLUMN IF EXISTS "verified_booking_id"`);
  }
}
