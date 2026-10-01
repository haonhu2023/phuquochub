import { MigrationInterface, QueryRunner } from 'typeorm';

// Owner Command Center category expansion (product spec, 2026-09-29) — Bãi biển đến nay chỉ là
// khung nhìn theo danh mục trên `places` (ADR-002, xem beaches.repository.ts), không có nơi lưu
// riêng. Sản phẩm giờ cần 6 trường chuyên biệt thật sự (đường vào, đặc điểm bãi, mùa tham khảo,
// dịch vụ, thông tin cứu hộ, lưu ý có nguồn) — đủ lớn để xứng một bảng vệ tinh 1:1 đúng khuôn mẫu
// place_hotel_details/place_restaurant_details/place_tour_details, thay vì phình `places` bằng 6
// cột chỉ một category dùng. Đây là MỞ RỘNG cùng khuôn ADR-002 cho category vốn chưa cần dữ liệu
// riêng, không phải vi phạm quyết định "không có bảng vệ tinh" — quyết định đó đúng tại thời điểm
// bãi biển chưa có trường riêng nào, nay đã có.
//
// mùa tham khảo / thông tin cứu hộ / lưu ý có nguồn là 3 trường "nhạy thời gian"/an toàn — brief
// cấm suy đoán ("Không tạo điểm 'an toàn' từ suy đoán"): mỗi trường có cặp
// (*_source_id → sources, *_verified_at) NGAY TRÊN HÀNG, cùng mẫu star_rating_source_id vừa thêm
// cho hotel (AddHotelStarRatingSource) — tái dùng `sources` đã có, KHÔNG dựng hệ nguồn thứ hai và
// KHÔNG kéo cỗ máy evidence_artifacts/evidence_reviews (được xây riêng cho opening_hours, có policy
// hết hạn/độ ổn định lịch không áp dụng ở đây) vào cho một cặp giá trị+nguồn đơn giản.
// đường vào / đặc điểm bãi / dịch vụ là mô tả tĩnh, không bắt buộc nguồn.
export class InitBeachDetails1720007700000 implements MigrationInterface {
  name = 'InitBeachDetails1720007700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "place_beach_details" (
        "place_id" uuid PRIMARY KEY REFERENCES "places"("id") ON DELETE CASCADE,
        "access_route" text,
        "characteristics" text,
        "services" text,
        "best_season" text,
        "best_season_source_id" uuid REFERENCES "sources"("id") ON DELETE SET NULL,
        "best_season_verified_at" timestamptz,
        "lifeguard_info" text,
        "lifeguard_info_source_id" uuid REFERENCES "sources"("id") ON DELETE SET NULL,
        "lifeguard_info_verified_at" timestamptz,
        "sourced_notes" text,
        "sourced_notes_source_id" uuid REFERENCES "sources"("id") ON DELETE SET NULL,
        "sourced_notes_verified_at" timestamptz
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "place_beach_details"`);
  }
}
