import { MigrationInterface, QueryRunner } from 'typeorm';

// Sprint 2 · B7 — seed dữ liệu khởi tạo Phú Quốc (danh mục + địa điểm published) để
// demo list/detail/map/search và làm fixture test. Idempotent (ON CONFLICT DO NOTHING).
// Toạ độ [lng, lat] gần đúng, status 'published' (hiển thị public + FTS + bản đồ).
export class SeedInitialPlaces1720000900000 implements MigrationInterface {
  name = 'SeedInitialPlaces1720000900000';

  private readonly categories: Array<[string, string, string, string]> = [
    // [slug, name_vi, name_en, icon]
    ['beach', 'Bãi biển', 'Beach', 'umbrella-beach'],
    ['attraction', 'Điểm tham quan', 'Attraction', 'camera'],
    ['market', 'Chợ', 'Market', 'store'],
    ['restaurant', 'Nhà hàng', 'Restaurant', 'utensils'],
    ['hotel', 'Khách sạn', 'Hotel', 'bed'],
  ];

  // [name, slug, categorySlug, lng, lat, ward, short_description, description]
  private readonly places: Array<[string, string, string, number, number, string, string, string]> = [
    ['Bãi Sao', 'bai-sao', 'beach', 104.0281, 10.0466, 'An Thới', 'Bãi biển cát trắng nổi tiếng phía nam đảo', 'Bãi Sao là một trong những bãi biển đẹp nhất Phú Quốc với cát trắng mịn và nước biển trong xanh.'],
    ['Bãi Trường', 'bai-truong', 'beach', 103.9660, 10.1720, 'Dương Tơ', 'Bãi biển dài nhất Phú Quốc, ngắm hoàng hôn', 'Bãi Trường (Long Beach) trải dài nhiều km, tập trung resort và điểm ngắm hoàng hôn.'],
    ['Mũi Gành Dầu', 'mui-ganh-dau', 'beach', 103.8330, 10.3560, 'Gành Dầu', 'Mũi biển cực bắc, giáp Campuchia', 'Gành Dầu là làng chài yên bình ở cực bắc đảo, biển lặng và hải sản tươi.'],
    ['Dinh Cậu', 'dinh-cau', 'attraction', 103.9576, 10.2158, 'Dương Đông', 'Miếu thờ linh thiêng bên cửa biển', 'Dinh Cậu là điểm tâm linh biểu tượng của Phú Quốc, ngắm hoàng hôn ngay trung tâm Dương Đông.'],
    ['Suối Tranh', 'suoi-tranh', 'attraction', 104.0090, 10.1930, 'Dương Tơ', 'Thác suối giữa rừng nguyên sinh', 'Suối Tranh là khu du lịch sinh thái với thác nước và đường mòn rừng.'],
    ['Vinpearl Safari', 'vinpearl-safari', 'attraction', 103.8620, 10.3350, 'Gành Dầu', 'Vườn thú bán hoang dã lớn', 'Vinpearl Safari là công viên chăm sóc và bảo tồn động vật bán hoang dã.'],
    ['Sun World Hòn Thơm', 'sun-world-hon-thom', 'attraction', 104.0170, 9.9660, 'An Thới', 'Cáp treo vượt biển dài nhất thế giới', 'Hòn Thơm nổi tiếng với tuyến cáp treo vượt biển và công viên nước.'],
    ['Chợ đêm Phú Quốc', 'cho-dem-phu-quoc', 'market', 103.9603, 10.2145, 'Dương Đông', 'Chợ đêm hải sản và đặc sản', 'Chợ đêm Dinh Cậu (Bạch Đằng) sầm uất với hải sản tươi và đặc sản địa phương.'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [slug, nameVi, nameEn, icon] of this.categories) {
      await queryRunner.query(
        `INSERT INTO "categories" ("slug","name_vi","name_en","icon")
         VALUES ($1,$2,$3,$4) ON CONFLICT ("slug") DO NOTHING`,
        [slug, nameVi, nameEn, icon],
      );
    }

    for (const [name, slug, categorySlug, lng, lat, ward, shortDesc, description] of this.places) {
      await queryRunner.query(
        `INSERT INTO "places"
           ("name","slug","category_id","location","ward","short_description","description","status")
         SELECT $1,$2, c.id, ST_SetSRID(ST_MakePoint($3,$4),4326)::geography, $5,$6,$7,'published'
         FROM "categories" c WHERE c.slug = $8
         ON CONFLICT ("slug") DO NOTHING`,
        [name, slug, lng, lat, ward, shortDesc, description, categorySlug],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const placeSlugs = this.places.map((p) => p[1]);
    const categorySlugs = this.categories.map((c) => c[0]);
    await queryRunner.query(`DELETE FROM "places" WHERE "slug" = ANY($1)`, [placeSlugs]);
    await queryRunner.query(`DELETE FROM "categories" WHERE "slug" = ANY($1)`, [categorySlugs]);
  }
}
