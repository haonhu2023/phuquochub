import { MigrationInterface, QueryRunner } from 'typeorm';

// Gói D — mở rộng rich-text sang mô tả DÀI của place/hotel/restaurant/tour (đúng owner yêu cầu:
// "theo mô hình lưu chung thực tế", KHÔNG tạo cột/bảng riêng per loại trang). Mô tả của một place
// ĐÃ TỒN TẠI đi qua `place_translations` (field_key='description'), không phải `places.description`
// (cột đó chỉ còn dùng ở đường TẠO MỚI — xem PlacesService.create()) — nên rich text thuộc về CHÍNH
// bảng này, một cột DÙNG CHUNG cho mọi field_key, dù trong thực tế hiện tại chỉ 'description' có
// giá trị khác NULL ('display_name'/'short_description' luôn plain).
//
// Cột MỚI, NULLABLE, SONG SONG với `translated_text` hiện có — không đổi/xoá cột cũ, không backfill
// hàng loạt. Không có cột hash đi kèm như job_listings/real_estate_listings: xem ghi chú đầy đủ ở
// PlaceTranslation entity (place-translation.entity.ts) về lý do bảng này vốn đã an toàn khi rollback
// nhờ chính kiến trúc insert-only + supersede-theo-is_current, không cần cơ chế phát hiện lệch thêm.
export class AddPlaceTranslationRichDoc1720010100000 implements MigrationInterface {
  name = 'AddPlaceTranslationRichDoc1720010100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "place_translations" ADD COLUMN "rich_doc" JSONB`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "place_translations" DROP COLUMN "rich_doc"`);
  }
}
