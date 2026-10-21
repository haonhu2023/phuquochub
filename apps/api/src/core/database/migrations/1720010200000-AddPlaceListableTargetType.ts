import { MigrationInterface, QueryRunner } from 'typeorm';

// Giai đoạn 1 (21/10/2026) — "Báo sai/trùng" + "Lưu tin" mở rộng từ chỉ job/BĐS sang CẢ địa điểm/
// khách sạn/nhà hàng/tour. Theo ADR-002 (Class-Table Inheritance), hotel/restaurant/tour KHÔNG có
// id riêng — chúng LÀ một dòng `places` (id = place_id) — nên chỉ cần MỘT giá trị enum mới ('place'),
// không phải bốn, để phủ cả bốn loại trang chi tiết công khai.
//
// Cùng hình dạng ADD VALUE thuần cộng thêm như AddGuideArticleRevisionEntityType1720005900000 —
// không ALTER/DROP gì trên dữ liệu đang có.
//
// down() KHÔNG xoá giá trị enum — Postgres không có `ALTER TYPE ... DROP VALUE`. Không có dữ liệu
// nào dùng giá trị này trước khi migration này chạy nên rollback không để lại dòng mồ côi nào
// (khác hẳn tình huống GuideArticleSchema cần xử lý thêm).
export class AddPlaceListableTargetType1720010200000 implements MigrationInterface {
  name = 'AddPlaceListableTargetType1720010200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "listable_target_type" ADD VALUE IF NOT EXISTS 'place'`);
  }

  public async down(): Promise<void> {
    // No-op theo thiết kế — xem ghi chú đầu file.
  }
}
