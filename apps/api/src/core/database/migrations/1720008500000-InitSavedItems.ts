import { MigrationInterface, QueryRunner } from 'typeorm';

// "Lưu tin" — mục VII ("Tái sử dụng uploader, saved items, báo sai, liên hệ...") VÀ mục V đợt 3/4
// đều liệt kê "lưu tin" là field bắt buộc, nhưng KHÔNG tồn tại cho bất kỳ entity nào trên toàn nền
// tảng (xác nhận bằng grep `SavedItem`/`Favorite`/`Bookmark` trên apps/api/src/modules — không có
// kết quả nào, xem docs/delivery/release-web-candidate-2026-10-04.md §13v). Đây là hạ tầng DÙNG
// CHUNG mới, xây MỘT LẦN cho mọi loại entity có thể lưu — không một bảng riêng cho job_listings,
// một bảng riêng khác cho real_estate_listings.
//
// Đa hình qua target_type/target_id — CÙNG quy ước `reports`/`moderation_cases` (ADR-018 §D9):
// target_id KHÔNG có FK cứng (loại entity đa dạng, một FK không thể trỏ nhiều bảng), target_type
// là enum ĐÓNG (khác text tự do) để tránh giá trị rác. enum NÀY không bị khoá bởi ADR-018 (nó
// không phải `moderation_target_type`) — mở rộng thêm loại entity sau này chỉ cần ALTER TYPE
// thêm giá trị, không đụng tới quyết định kiểm duyệt nào.
//
// UNIQUE (user_id, target_type, target_id): lưu hai lần cùng một tin không tạo hai dòng — gọi
// lại "lưu" trên một tin đã lưu là vô hại (ON CONFLICT DO NOTHING ở tầng service), không phải một
// lỗi người dùng cần thấy.
export class InitSavedItems1720008500000 implements MigrationInterface {
  name = 'InitSavedItems1720008500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "saved_item_target_type" AS ENUM ('job_listing', 'real_estate_listing')`);

    await queryRunner.query(`
      CREATE TABLE "saved_items" (
        "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"     UUID NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
        "target_type" "saved_item_target_type" NOT NULL,
        "target_id"   UUID NOT NULL,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_saved_items_user_target" UNIQUE ("user_id", "target_type", "target_id")
      )
    `);

    // Truy vấn chính: "tin của tôi đã lưu" (lọc theo user_id, sắp theo created_at) — UNIQUE ở trên
    // đã tự tạo index cho (user_id, target_type, target_id) nhưng KHÔNG phủ truy vấn chỉ theo
    // user_id một mình hiệu quả bằng (thứ tự cột UNIQUE đặt target_type trước), nên thêm riêng.
    await queryRunner.query(`CREATE INDEX "idx_saved_items_user_id" ON "saved_items" ("user_id")`);
    // Truy vấn ngược: "tin này đã được bao nhiêu người lưu" / dọn khi một tin bị xoá hẳn.
    await queryRunner.query(`CREATE INDEX "idx_saved_items_target" ON "saved_items" ("target_type", "target_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "saved_items"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "saved_item_target_type"`);
  }
}
