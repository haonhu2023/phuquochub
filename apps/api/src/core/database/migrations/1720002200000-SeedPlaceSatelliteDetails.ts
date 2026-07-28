import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Vá lỗ hổng seed của ADR-002: các Place đã seed KHÔNG có hàng vệ tinh nào.
 *
 * `SeedInitialPlaces`/`SeedPlacesExpansion` chỉ chèn vào `places`; không migration nào từng chèn
 * `place_hotel_details`/`place_restaurant_details`/`place_tour_details`. Ba endpoint duyệt
 * (`GET /hotels`, `/restaurants`, `/tours`) đều INNER JOIN đúng ba bảng đó, nên trên một database
 * đã migrate đầy đủ cả ba đều trả về `total=0` — ba trang browse đã hoàn thiện nhưng không hiển
 * thị gì. Đây là defect đã kiểm chứng trực tiếp trên PostgreSQL thật, không phải suy đoán.
 *
 * NGUYÊN TẮC của migration này: chỉ điền những cột BẮT BUỘC (NOT NULL) và chỉ bằng giá trị SUY RA
 * ĐƯỢC từ dữ liệu đã có trong repo. Mọi trường tuỳ chọn để NULL.
 *   · `hotel_type`  ← suy từ `categories.slug` ('resort' → resort, 'hotel' → hotel).
 *   · `tour_type`   ← suy từ chính tên/mô tả đã seed của từng tour (xem bảng bên dưới).
 *   · `star_rating`, `check_in/out`, `duration_minutes`, `difficulty`, `dietary` → để NULL.
 *
 * CỐ Ý KHÔNG làm: gán hạng sao cho khách sạn có thật, đoán thời lượng/độ khó tour, suy `cuisines`
 * từ tên nhà hàng, hay dựng menu/tiện nghi. Đó là những khẳng định về cơ sở kinh doanh có thật —
 * phải đến từ nguồn kiểm chứng được, không phải từ việc đọc chuỗi marketing trong seed.
 */
export class SeedPlaceSatelliteDetails1720002200000 implements MigrationInterface {
  name = 'SeedPlaceSatelliteDetails1720002200000';

  /** Suy `tour_type` từ chính tên/mô tả tiếng Việt đã seed — không phải phân loại tự nghĩ ra. */
  private readonly tourTypes: Array<[slug: string, tourType: string, evidence: string]> = [
    ['lan-ngam-san-ho-hon-thom', 'diving', '"Lặn ngắm san hô" → diving'],
    ['sunset-cruise-phu-quoc', 'cruise', '"Du thuyền ngắm hoàng hôn" → cruise'],
    ['tour-3-dao-an-thoi', 'sightseeing', '"Tour cano tham quan cụm đảo" → sightseeing'],
  ];

  private readonly lodgingCategories = ['hotel', 'resort'];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------- Hotel (category 'hotel' + 'resort') ----------
    // `hotel_type` NOT NULL: lấy thẳng từ danh mục của Place. Enum hotel_type có sẵn cả 'resort'
    // lẫn 'hotel' nên ánh xạ này là 1-1, không mất thông tin.
    await queryRunner.query(
      `INSERT INTO "place_hotel_details" ("place_id", "hotel_type")
       SELECT p."id", (CASE c."slug" WHEN 'resort' THEN 'resort' ELSE 'hotel' END)::"hotel_type"
       FROM "places" p JOIN "categories" c ON c."id" = p."category_id"
       WHERE c."slug" = ANY($1) AND p."deleted_at" IS NULL
       ON CONFLICT ("place_id") DO NOTHING`,
      [this.lodgingCategories],
    );

    // ---------- Restaurant ----------
    // Không cột NOT NULL nào cần giá trị: `is_local_specialty` có DEFAULT false, `dietary` NULL.
    // false ở đây nghĩa là "chưa được phân loại là đặc sản", không phải "đã xác định là không".
    await queryRunner.query(
      `INSERT INTO "place_restaurant_details" ("place_id")
       SELECT p."id" FROM "places" p JOIN "categories" c ON c."id" = p."category_id"
       WHERE c."slug" = 'restaurant' AND p."deleted_at" IS NULL
       ON CONFLICT ("place_id") DO NOTHING`,
    );

    // ---------- Tour ----------
    for (const [slug, tourType] of this.tourTypes) {
      await queryRunner.query(
        `INSERT INTO "place_tour_details" ("place_id", "tour_type")
         SELECT p."id", $2::"tour_type" FROM "places" p
         WHERE p."slug" = $1 AND p."deleted_at" IS NULL
         ON CONFLICT ("place_id") DO NOTHING`,
        [slug, tourType],
      );
    }

    // Tour nào chưa được ánh xạ ở trên (seed thêm sau này) vẫn phải có hàng vệ tinh để xuất hiện
    // trong `GET /tours` — dùng 'other', đúng ô "chưa phân loại" mà enum đã dành sẵn, thay vì gán
    // bừa một loại cụ thể.
    await queryRunner.query(
      `INSERT INTO "place_tour_details" ("place_id", "tour_type")
       SELECT p."id", 'other'::"tour_type"
       FROM "places" p JOIN "categories" c ON c."id" = p."category_id"
       WHERE c."slug" = 'tour' AND p."deleted_at" IS NULL
       ON CONFLICT ("place_id") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Xoá đúng phạm vi mà up() đã tạo (theo danh mục). Cùng quy ước với các seed migration sẵn có
    // (SeedPlacesExpansion.down xoá theo slug): nếu sau này có người bổ sung dữ liệu thật vào
    // chính những hàng này thì revert sẽ mất phần đó — đánh đổi cố hữu của seed migration.
    await queryRunner.query(
      `DELETE FROM "place_hotel_details" hd USING "places" p, "categories" c
       WHERE hd."place_id" = p."id" AND c."id" = p."category_id" AND c."slug" = ANY($1)`,
      [this.lodgingCategories],
    );
    await queryRunner.query(
      `DELETE FROM "place_restaurant_details" rd USING "places" p, "categories" c
       WHERE rd."place_id" = p."id" AND c."id" = p."category_id" AND c."slug" = 'restaurant'`,
    );
    await queryRunner.query(
      `DELETE FROM "place_tour_details" td USING "places" p, "categories" c
       WHERE td."place_id" = p."id" AND c."id" = p."category_id" AND c."slug" = 'tour'`,
    );
  }
}
