import { MigrationInterface, QueryRunner } from 'typeorm';

// "Ảnh cho bất động sản" — mục V đợt 4 liệt kê ảnh như một field bắt buộc, cộng yêu cầu riêng
// "Không chỉ ẩn marker; kiểm metadata ảnh khi có nguy cơ lộ vị trí" khi address_precision='area'.
//
// KHÔNG tái dùng bảng `media` (place-coupled: cột `place_id`, hàng chờ kiểm duyệt riêng cho ảnh
// cơ sở — xem media.entity.ts) — chỉ tái dùng phần THẬT SỰ dùng chung (`StorageService`, đã xác
// nhận entity-agnostic qua đọc toàn văn storage.service.ts), xây bảng MỚI, hẹp, CHUYÊN BIỆT cho
// real_estate_listings. Khác saved_items/listing_reports: bảng này chỉ nhắm một loại entity duy
// nhất nên có FK cứng thật (không đa hình target_type/target_id).
//
// Không có cột `status`/hàng chờ kiểm duyệt riêng cho ảnh: tin bất động sản đã có vòng đời duyệt
// của CHÍNH nó (RealEstateListingStatus) — ảnh hiển thị công khai theo đúng trạng thái của tin nó
// thuộc về (xem RealEstateListingPhotosService.listPublic/getPublicById), không cần một lớp duyệt
// ảnh thứ hai.
export class InitRealEstateListingPhotos1720008700000 implements MigrationInterface {
  name = 'InitRealEstateListingPhotos1720008700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "real_estate_listing_photos" (
        "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "listing_id"       UUID NOT NULL REFERENCES "real_estate_listings" ("id") ON DELETE CASCADE,
        "object_key"       VARCHAR(300) NOT NULL,
        "bucket"           VARCHAR(100) NOT NULL,
        "content_type"     VARCHAR(100) NOT NULL,
        "size_bytes"       INT NOT NULL,
        "checksum_sha256"  CHAR(64) NOT NULL,
        "sort_order"       INT NOT NULL,
        "uploaded_by"      UUID NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
        "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "uq_real_estate_listing_photos_object_key" UNIQUE ("object_key")
      )
    `);

    // Truy vấn chính: "ảnh của tin này, theo thứ tự hiển thị".
    await queryRunner.query(
      `CREATE INDEX "idx_real_estate_listing_photos_listing" ON "real_estate_listing_photos" ("listing_id", "sort_order")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "real_estate_listing_photos"`);
  }
}
