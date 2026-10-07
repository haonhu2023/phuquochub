import { MigrationInterface, QueryRunner } from 'typeorm';

// Cho thuê/mua bán bất động sản MVP (đợt 4, product spec 07/10/2026). Bảng mới, độc lập — cùng lý
// do job_listings không phải satellite của places (không có vòng đời duyệt/dịch/xác minh của
// place, một thực thể có vòng đời riêng). Xem docs/delivery/release-web-candidate-2026-10-04.md
// §13u cho bảng chuyển trạng thái đầy đủ và lý do thiết kế field theo giao dịch.
//
// HAI trạng thái tách biệt (mục VI "phân biệt kiểm duyệt với còn giao dịch"):
//   status: draft/pending/published/rejected/closed — vòng đời KIỂM DUYỆT, CÙNG bảng chuyển trạng
//     thái đã chốt cho job_listings (§13r): sửa khi published đẩy ngay về pending; đóng/mở lại
//     LUÔN qua duyệt lại.
//   deal_status: available/rented/sold — còn GIAO DỊCH hay không, ĐỘC LẬP với status, đổi qua hành
//     động riêng (mark-rented/mark-sold), KHÔNG kéo tin về pending (không phải sửa nội dung).
export class InitRealEstateListings1720008300000 implements MigrationInterface {
  name = 'InitRealEstateListings1720008300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "real_estate_listing_status" AS ENUM ('draft','pending','published','rejected','closed')`);
    await queryRunner.query(`CREATE TYPE "real_estate_deal_status" AS ENUM ('available','rented','sold')`);
    await queryRunner.query(`CREATE TYPE "real_estate_poster_role" AS ENUM ('owner','broker')`);
    await queryRunner.query(`CREATE TYPE "real_estate_transaction_type" AS ENUM ('rent','sale')`);
    // Taxonomy loại tài sản — enum cố định (task requirement: "theo taxonomy", không free text).
    await queryRunner.query(`CREATE TYPE "real_estate_property_type" AS ENUM ('room','apartment','house','land','retail')`);
    await queryRunner.query(`CREATE TYPE "real_estate_address_precision" AS ENUM ('area','exact')`);
    await queryRunner.query(`CREATE TYPE "real_estate_rent_period" AS ENUM ('month','year')`);
    await queryRunner.query(`CREATE TYPE "real_estate_sale_price_basis" AS ENUM ('total','per_sqm')`);
    await queryRunner.query(`CREATE TYPE "real_estate_furniture_status" AS ENUM ('unfurnished','semi_furnished','furnished')`);

    await queryRunner.query(`
      CREATE TABLE "real_estate_listings" (
        "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_by"         UUID NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
        "poster_role"        "real_estate_poster_role" NOT NULL,
        "transaction_type"   "real_estate_transaction_type" NOT NULL,
        "property_type"      "real_estate_property_type" NOT NULL,
        "title"              VARCHAR(200) NOT NULL,
        "ward"                VARCHAR(80),
        -- Người đăng tự chọn mức công khai vị trí — 'area' mặc định (an toàn hơn). API public CHỈ
        -- trả address_text/lat/lng khi 'exact' (mapper, không phải chỉ ẩn ở UI — xem §13u).
        "address_precision"  "real_estate_address_precision" NOT NULL DEFAULT 'area',
        "address_text"       VARCHAR(300),
        "lat"                NUMERIC(9,6),
        "lng"                NUMERIC(9,6),
        "area_sqm"           NUMERIC(10,2),
        "price"              NUMERIC(16,2),
        "price_currency"     VARCHAR(3),
        -- Chỉ MỘT trong hai cột dưới có giá trị, theo đúng transaction_type (CHECK bên dưới).
        "rent_period"        "real_estate_rent_period",
        "sale_price_basis"   "real_estate_sale_price_basis",
        "deposit_amount"     NUMERIC(16,2),
        "utilities_note"     VARCHAR(500),
        "furniture_status"   "real_estate_furniture_status",
        "move_in_date"       DATE,
        "lease_term_months"  INTEGER,
        -- Văn bản TỰ DO do người đăng khai — KHÔNG BAO GIỜ một nhãn hệ thống "đã xác minh"/"pháp lý
        -- sạch" (task requirement: "diễn đạt theo bằng chứng", không tự gắn bảo đảm).
        "legal_status_note"  VARCHAR(500),
        "description"        VARCHAR(4000),
        "contact_method"     VARCHAR(30) NOT NULL,
        "contact_value"      VARCHAR(200) NOT NULL,
        "status"             "real_estate_listing_status" NOT NULL DEFAULT 'draft',
        "deal_status"        "real_estate_deal_status" NOT NULL DEFAULT 'available',
        "review_note"        VARCHAR(1000),
        "reviewer_id"        UUID REFERENCES "users" ("id") ON DELETE SET NULL,
        "reviewed_at"        TIMESTAMPTZ,
        "expires_at"         DATE,
        "published_at"       TIMESTAMPTZ,
        "created_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "chk_rel_title_not_blank" CHECK (btrim("title") <> ''),
        CONSTRAINT "chk_rel_contact_value_not_blank" CHECK (btrim("contact_value") <> ''),
        CONSTRAINT "chk_rel_price_needs_currency" CHECK ("price" IS NULL OR "price_currency" IS NOT NULL),
        -- Field thuê chỉ hợp lệ khi transaction_type='rent'; field bán chỉ hợp lệ khi 'sale' — chặn
        -- NGAY ở DB, không chỉ ở DTO (cùng mức nghiêm ở CHECK job_listings's salary constraints).
        CONSTRAINT "chk_rel_rent_fields_scope" CHECK (
          "transaction_type" = 'rent' OR (
            "rent_period" IS NULL AND "deposit_amount" IS NULL AND
            "move_in_date" IS NULL AND "lease_term_months" IS NULL
          )
        ),
        CONSTRAINT "chk_rel_sale_fields_scope" CHECK (
          "transaction_type" = 'sale' OR ("sale_price_basis" IS NULL AND "legal_status_note" IS NULL)
        ),
        CONSTRAINT "chk_rel_decision_consistency" CHECK (
          "status" NOT IN ('draft','pending') OR ("reviewer_id" IS NULL AND "reviewed_at" IS NULL)
        ),
        CONSTRAINT "chk_rel_published_at_consistency" CHECK (
          "status" NOT IN ('draft','pending','rejected') OR "published_at" IS NULL
        ),
        -- deal_status khác 'available' chỉ có ý nghĩa cho một tin ĐÃ TỪNG công khai.
        CONSTRAINT "chk_rel_deal_status_scope" CHECK (
          "deal_status" = 'available' OR "status" IN ('published','closed')
        ),
        CONSTRAINT "chk_rel_address_exact_has_location" CHECK (
          "address_precision" <> 'exact' OR "address_text" IS NOT NULL OR ("lat" IS NOT NULL AND "lng" IS NOT NULL)
        )
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_real_estate_listings_status" ON "real_estate_listings" ("status")`);
    await queryRunner.query(`CREATE INDEX "idx_real_estate_listings_deal_status" ON "real_estate_listings" ("deal_status")`);
    await queryRunner.query(`CREATE INDEX "idx_real_estate_listings_expires_at" ON "real_estate_listings" ("expires_at")`);
    await queryRunner.query(`CREATE INDEX "idx_real_estate_listings_ward" ON "real_estate_listings" ("ward")`);
    await queryRunner.query(`CREATE INDEX "idx_real_estate_listings_property_type" ON "real_estate_listings" ("property_type")`);
    await queryRunner.query(`CREATE INDEX "idx_real_estate_listings_transaction_type" ON "real_estate_listings" ("transaction_type")`);
    await queryRunner.query(`CREATE INDEX "idx_real_estate_listings_created_by" ON "real_estate_listings" ("created_by")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "real_estate_listings"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "real_estate_furniture_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "real_estate_sale_price_basis"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "real_estate_rent_period"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "real_estate_address_precision"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "real_estate_property_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "real_estate_transaction_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "real_estate_poster_role"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "real_estate_deal_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "real_estate_listing_status"`);
  }
}
