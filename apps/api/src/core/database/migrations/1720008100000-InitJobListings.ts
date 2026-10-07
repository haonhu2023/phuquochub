import { MigrationInterface, QueryRunner } from 'typeorm';

// Tuyển dụng địa phương MVP (đợt 3, product spec 07/10/2026). Bảng mới — không module/bảng nào có sẵn
// biểu diễn đúng một tin tuyển dụng (place_edit_proposals là đề xuất sửa MỘT field của place, không phải
// một thực thể độc lập có vòng đời riêng). Trạng thái: draft → pending → published/rejected; published →
// closed; closed/rejected → pending (sửa rồi gửi lại, luôn qua duyệt lại — không có đường "mở lại" bỏ qua
// moderator). KHÔNG lưu "expired" như một giá trị status: hạn tuyển (`expires_at`) được xét tại thời điểm
// ĐỌC công khai (service), không đổi cột này — cùng nguyên tắc "cache không được làm tin hết hạn tiếp tục
// hiện như còn hoạt động" nhưng áp dụng ở tầng truy vấn, không chỉ cache.
export class InitJobListings1720008100000 implements MigrationInterface {
  name = 'InitJobListings1720008100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "job_listing_status" AS ENUM ('draft','pending','published','rejected','closed')`);
    await queryRunner.query(`CREATE TYPE "job_listing_employment_type" AS ENUM ('full_time','part_time','seasonal')`);
    // Kỳ tính lương — KHÔNG suy đoán từ số tiền; thiếu thì NULL ("chưa rõ"), không mặc định "tháng".
    await queryRunner.query(`CREATE TYPE "job_listing_salary_period" AS ENUM ('hour','day','month')`);

    await queryRunner.query(`
      CREATE TABLE "job_listings" (
        "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "created_by"         UUID NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
        -- Place liên quan là TÙY CHỌN (task requirement: "không bắt buộc có place"; liên kết KHÔNG
        -- cấp quyền đại diện/quản lý place đó — kiểm tại service, không phải ở đây).
        "place_id"           UUID REFERENCES "places" ("id") ON DELETE SET NULL,
        "employer_name"      VARCHAR(200) NOT NULL,
        "employer_role"      VARCHAR(100),
        "title"              VARCHAR(200) NOT NULL,
        -- Nhóm nghề: văn bản tự do (không có danh mục cố định cho MVP — khác cuisines/amenities vì
        -- chưa có nhu cầu lọc chuẩn hoá thực tế; xem lại khi có dữ liệu thật).
        "job_category"       VARCHAR(80) NOT NULL,
        "ward"                VARCHAR(80),
        "work_location"      VARCHAR(300) NOT NULL,
        "employment_type"    "job_listing_employment_type" NOT NULL,
        "salary_min"         NUMERIC(14,2),
        "salary_max"         NUMERIC(14,2),
        "salary_negotiable"  BOOLEAN NOT NULL DEFAULT false,
        "salary_currency"    VARCHAR(3),
        "salary_period"      "job_listing_salary_period",
        "shift_info"         VARCHAR(500),
        "requirements"       VARCHAR(2000),
        "benefits"           VARCHAR(2000),
        "description"        VARCHAR(4000),
        "contact_method"     VARCHAR(30) NOT NULL,
        "contact_value"      VARCHAR(200) NOT NULL,
        "status"             "job_listing_status" NOT NULL DEFAULT 'draft',
        "review_note"        VARCHAR(1000),
        "reviewer_id"        UUID REFERENCES "users" ("id") ON DELETE SET NULL,
        "reviewed_at"        TIMESTAMPTZ,
        "expires_at"         DATE,
        "published_at"       TIMESTAMPTZ,
        "created_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "chk_job_listing_title_not_blank" CHECK (btrim("title") <> ''),
        CONSTRAINT "chk_job_listing_employer_name_not_blank" CHECK (btrim("employer_name") <> ''),
        CONSTRAINT "chk_job_listing_contact_value_not_blank" CHECK (btrim("contact_value") <> ''),
        -- Khoảng lương hợp lệ khi có cả hai đầu.
        CONSTRAINT "chk_job_listing_salary_range" CHECK ("salary_min" IS NULL OR "salary_max" IS NULL OR "salary_max" >= "salary_min"),
        -- Có số tiền thì PHẢI có đơn vị tiền tệ — không mặc định VND cho giá trị đã nhập (đúng
        -- nguyên tắc "giá phải rõ tiền tệ"). Thoả thuận (salary_negotiable) không cần số tiền.
        CONSTRAINT "chk_job_listing_salary_needs_currency" CHECK (
          ("salary_min" IS NULL AND "salary_max" IS NULL) OR "salary_currency" IS NOT NULL
        ),
        -- draft/pending chưa từng qua quyết định của moderator — không được mang reviewer/reviewed_at.
        -- published/rejected/closed có thể mang (closed thường kế thừa từ published đã duyệt trước đó).
        CONSTRAINT "chk_job_listing_decision_consistency" CHECK (
          "status" NOT IN ('draft','pending') OR ("reviewer_id" IS NULL AND "reviewed_at" IS NULL)
        ),
        CONSTRAINT "chk_job_listing_published_at_consistency" CHECK (
          "status" NOT IN ('draft','pending','rejected') OR "published_at" IS NULL
        )
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_job_listings_status" ON "job_listings" ("status")`);
    await queryRunner.query(`CREATE INDEX "idx_job_listings_expires_at" ON "job_listings" ("expires_at")`);
    await queryRunner.query(`CREATE INDEX "idx_job_listings_ward" ON "job_listings" ("ward")`);
    await queryRunner.query(`CREATE INDEX "idx_job_listings_job_category" ON "job_listings" ("job_category")`);
    await queryRunner.query(`CREATE INDEX "idx_job_listings_employment_type" ON "job_listings" ("employment_type")`);
    await queryRunner.query(`CREATE INDEX "idx_job_listings_created_by" ON "job_listings" ("created_by")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "job_listings"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "job_listing_salary_period"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "job_listing_employment_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "job_listing_status"`);
  }
}
