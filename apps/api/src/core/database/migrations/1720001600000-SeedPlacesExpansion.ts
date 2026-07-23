import { MigrationInterface, QueryRunner } from 'typeorm';

// Data Slice 1 — mở rộng seed Places (~8 → ~49) để MVP Local Discovery có đủ dữ liệu
// duyệt/lọc/bản đồ. CHỈ DML (INSERT), KHÔNG đổi schema/contract/FE. Idempotent
// (ON CONFLICT (slug) DO NOTHING) — chạy lại không tạo trùng.
//
// NGUỒN & MỨC XÁC MINH (bắt buộc ghi rõ — dữ liệu CHƯA xác minh):
//  - Tên/mô tả: kiến thức phổ thông về các địa điểm CÓ THẬT ở Phú Quốc (không bịa nơi
//    không tồn tại). Mô tả mang tính giới thiệu, chưa đối chiếu nguồn chính thức.
//  - Toạ độ [lng, lat]: GẦN ĐÚNG ở mức khu vực (chưa đo/đối chiếu GPS chính xác).
//  - address: mức khu vực/địa danh (KHÔNG bịa số nhà cụ thể).
//  - price_range: phân hạng thô (free/low/mid/high), KHÔNG phải giá đã xác minh.
//  - opening_hours / phone / website / hình ảnh: BỎ TRỐNG có chủ đích — chưa có nguồn
//    xác minh, sẽ bổ sung ở vòng dữ liệu sau (tránh sinh dữ liệu giả).
//  => verification_status giữ mặc định 'pending' (= chưa xác minh). status='published'
//     để hiển thị trên /places (đúng như 8 seed gốc).
export class SeedPlacesExpansion1720001600000 implements MigrationInterface {
  name = 'SeedPlacesExpansion1720001600000';

  // Danh mục bổ sung (beach/attraction/market/restaurant/hotel đã có ở seed gốc).
  // [slug, name_vi, name_en, icon]
  private readonly categories: Array<[string, string, string, string]> = [
    ['cafe', 'Quán cà phê', 'Cafe', 'coffee'],
    ['resort', 'Resort', 'Resort', 'concierge-bell'],
    ['tour', 'Dịch vụ du lịch', 'Tour & Service', 'map-signs'],
  ];

  // [name, slug, categorySlug, lng, lat, ward, address, priceRange, shortDesc, description]
  private readonly places: Array<
    [string, string, string, number, number, string, string, string | null, string, string]
  > = [
    // ---------- Điểm tham quan (attraction) ----------
    ['Grand World Phú Quốc', 'grand-world-phu-quoc', 'attraction', 103.855, 10.328, 'Gành Dầu', 'Grand World, Gành Dầu, TP. Phú Quốc, Kiên Giang', 'mid', 'Khu phức hợp giải trí, mua sắm và biểu diễn không ngủ', "Grand World là tổ hợp vui chơi - mua sắm - trình diễn nghệ thuật ở phía bắc đảo, nổi bật với show 'Tinh hoa Việt Nam', sông Venice và phố đêm."],
    ['VinWonders Phú Quốc', 'vinwonders-phu-quoc', 'attraction', 103.8585, 10.3305, 'Gành Dầu', 'Bãi Dài, Gành Dầu, TP. Phú Quốc', 'high', 'Công viên chủ đề lớn với nhiều phân khu trò chơi', 'VinWonders Phú Quốc là công viên chủ đề quy mô lớn gồm khu trò chơi cảm giác mạnh, thủy cung và các phân khu văn hóa.'],
    ['Cầu Hôn (Kiss Bridge)', 'cau-hon', 'attraction', 104.015, 9.965, 'An Thới', 'Hòn Thơm, An Thới, TP. Phú Quốc', 'free', 'Cây cầu biểu tượng bên bờ biển An Thới', 'Cầu Hôn là công trình kiến trúc biểu tượng với hai nhịp cầu vươn ra biển, điểm ngắm hoàng hôn nổi tiếng ở nam đảo.'],
    ['Thiền viện Trúc Lâm Hộ Quốc', 'chua-ho-quoc', 'attraction', 104.035, 10.115, 'Dương Tơ', 'Bãi Vòng, Dương Tơ, TP. Phú Quốc', 'free', 'Thiền viện lớn tựa núi hướng biển', 'Thiền viện Trúc Lâm Hộ Quốc (Chùa Hộ Quốc) là ngôi chùa lớn nằm tựa núi nhìn ra biển Đông, kiến trúc gỗ truyền thống và tầm nhìn rộng.'],
    ['Làng chài Hàm Ninh', 'lang-chai-ham-ninh', 'attraction', 104.045, 10.17, 'Hàm Ninh', 'Hàm Ninh, TP. Phú Quốc', 'free', 'Làng chài cổ ven biển phía đông', 'Làng chài Hàm Ninh là làng chài lâu đời nổi tiếng với cầu cảng dài, hải sản tươi như ghẹ Hàm Ninh và cảnh bình minh.'],
    ['Suối Đá Bàn', 'suoi-da-ban', 'attraction', 103.985, 10.29, 'Cửa Dương', 'Cửa Dương, TP. Phú Quốc', 'low', 'Suối đá giữa rừng, tắm mát ngày hè', 'Suối Đá Bàn chảy qua những phiến đá granite lớn giữa rừng, là điểm dã ngoại và tắm suối được yêu thích.'],
    ['Nhà tù Phú Quốc', 'nha-tu-phu-quoc', 'attraction', 104.005, 10.045, 'An Thới', 'Đường 30/4, An Thới, TP. Phú Quốc', 'free', 'Di tích lịch sử nhà tù thời chiến', 'Nhà tù Phú Quốc (Nhà lao Cây Dừa) là di tích lịch sử tái hiện điều kiện giam giữ thời chiến, mở cửa cho khách tham quan.'],
    ['Bảo tàng Cội Nguồn', 'bao-tang-coi-nguon', 'attraction', 103.965, 10.19, 'Dương Đông', 'Đường Trần Hưng Đạo, Dương Đông, TP. Phú Quốc', 'low', 'Bảo tàng tư nhân về lịch sử - văn hóa đảo', 'Bảo tàng Cội Nguồn trưng bày cổ vật, hóa thạch và hiện vật văn hóa phản ánh lịch sử hình thành đảo Phú Quốc.'],

    // ---------- Bãi biển (beach) ----------
    ['Bãi Khem', 'bai-khem', 'beach', 104.02, 10.03, 'An Thới', 'Bãi Khem, An Thới, TP. Phú Quốc', 'free', 'Bãi biển cát trắng, nước trong ở nam đảo', 'Bãi Khem (Khem Beach) là một trong những bãi tắm đẹp nhất nam đảo với cát trắng mịn, nước trong và hàng dừa.'],
    ['Bãi Dài', 'bai-dai', 'beach', 103.845, 10.31, 'Gành Dầu', 'Bãi Dài, Gành Dầu, TP. Phú Quốc', 'free', 'Bãi biển dài phía tây bắc, ngắm hoàng hôn', 'Bãi Dài trải dài phía tây bắc đảo, cát vàng thoải, nhiều khu nghỉ dưỡng và điểm ngắm hoàng hôn.'],
    ['Bãi Ông Lang', 'bai-ong-lang', 'beach', 103.905, 10.26, 'Cửa Dương', 'Ông Lang, Cửa Dương, TP. Phú Quốc', 'free', 'Bãi biển yên tĩnh xen kẽ ghềnh đá', 'Bãi Ông Lang là bãi biển yên tĩnh với các vụng nhỏ xen ghềnh đá, phù hợp nghỉ dưỡng và ngắm hoàng hôn.'],
    ['Bãi Vòng', 'bai-vong', 'beach', 104.04, 10.13, 'Hàm Ninh', 'Bãi Vòng, Hàm Ninh, TP. Phú Quốc', 'free', 'Bãi biển gần cảng tàu phía đông', 'Bãi Vòng nằm phía đông đảo gần cảng Bãi Vòng, biển lặng và là cửa ngõ đi các đảo lân cận.'],
    ['Bãi Thơm', 'bai-thom', 'beach', 104.07, 10.365, 'Bãi Thơm', 'Bãi Thơm, TP. Phú Quốc', 'free', 'Bãi biển hoang sơ vùng đông bắc', 'Bãi Thơm ở đông bắc đảo còn hoang sơ, ít khai thác du lịch, thích hợp trải nghiệm yên tĩnh và hải sản làng chài.'],
    ['Bãi Cửa Cạn', 'bai-cua-can', 'beach', 103.88, 10.3, 'Cửa Cạn', 'Cửa Cạn, TP. Phú Quốc', 'free', 'Bãi biển nơi sông Cửa Cạn đổ ra biển', 'Bãi Cửa Cạn nằm nơi con sông Cửa Cạn gặp biển, khung cảnh làng quê sông nước hòa cùng bãi biển.'],
    ['Bãi Rạch Vẹm', 'bai-rach-vem', 'beach', 103.895, 10.385, 'Gành Dầu', 'Rạch Vẹm, Gành Dầu, TP. Phú Quốc', 'free', 'Bãi biển nổi tiếng với sao biển', 'Rạch Vẹm ở cực bắc đảo nổi tiếng có nhiều sao biển, nước cạn và làng bè hải sản.'],

    // ---------- Nhà hàng (restaurant) ----------
    ['Nhà hàng Ra Khơi', 'nha-hang-ra-khoi', 'restaurant', 103.96, 10.215, 'Dương Đông', 'Đường 30/4, Dương Đông, TP. Phú Quốc', 'mid', 'Nhà hàng hải sản nổi tiếng ở Dương Đông', 'Ra Khơi là nhà hàng hải sản lâu năm được nhiều du khách biết đến, phục vụ hải sản tươi theo phong cách địa phương.'],
    ['Crab House Phú Quốc', 'crab-house-phu-quoc', 'restaurant', 103.958, 10.22, 'Dương Đông', 'Đường Trần Hưng Đạo, Dương Đông, TP. Phú Quốc', 'mid', 'Chuyên cua, ghẹ và hải sản kiểu Mỹ', 'Crab House phục vụ các món cua, ghẹ, tôm hùm hấp và sốt kiểu hải sản phương Tây, được du khách quốc tế ưa chuộng.'],
    ['Nhà hàng Xin Chào', 'nha-hang-xin-chao', 'restaurant', 103.97, 10.18, 'Dương Tơ', 'Bãi Trường, Dương Tơ, TP. Phú Quốc', 'mid', 'Ẩm thực Việt trong không gian rộng', 'Xin Chào là nhà hàng ẩm thực Việt Nam với không gian rộng, thực đơn hải sản và món Việt đa dạng phục vụ nhóm đông.'],
    ['Bún quậy Kiến Xây', 'bun-quay-kien-xay', 'restaurant', 103.961, 10.213, 'Dương Đông', 'Đường Bạch Đằng, Dương Đông, TP. Phú Quốc', 'low', 'Quán bún quậy - đặc sản Phú Quốc', 'Bún quậy Kiến Xây là quán nổi tiếng với món bún quậy, đặc sản chỉ có ở Phú Quốc, nước dùng nấu từ hải sản tươi.'],
    ['Chuồn Chuồn Bistro', 'chuon-chuon-bistro', 'restaurant', 103.955, 10.205, 'Dương Đông', 'Đồi Dương Đông, TP. Phú Quốc', 'mid', 'Bistro trên đồi ngắm toàn cảnh thị trấn', 'Chuồn Chuồn Bistro nằm trên đồi cao, là điểm ngắm hoàng hôn và toàn cảnh Dương Đông với đồ uống và món Âu - Việt.'],
    ['Sailing Club Phú Quốc', 'sailing-club-phu-quoc', 'restaurant', 103.968, 10.165, 'Dương Tơ', 'Bãi Trường, Dương Tơ, TP. Phú Quốc', 'high', 'Beach club ăn uống bên bãi Trường', 'Sailing Club là beach club bên bãi Trường, kết hợp nhà hàng, bar và không gian ven biển cho buổi tối.'],
    ['Spice House at Cassia Cottage', 'spice-house-cassia-cottage', 'restaurant', 103.963, 10.2, 'Dương Đông', 'Bà Kèo, Trần Hưng Đạo, Dương Đông, TP. Phú Quốc', 'mid', 'Nhà hàng ven biển trong khu Cassia Cottage', 'Spice House at Cassia Cottage phục vụ ẩm thực Việt bên bờ biển trong khu nghỉ Cassia Cottage, khung cảnh vườn nhiệt đới.'],

    // ---------- Quán cà phê (cafe) ----------
    ['Buddy Ice Cream & Info Café', 'buddy-cafe', 'cafe', 103.96, 10.212, 'Dương Đông', 'Đường Nguyễn Trãi, Dương Đông, TP. Phú Quốc', 'low', 'Quán kem, cà phê kiêm điểm thông tin du lịch', 'Buddy Ice Cream & Info Café là quán kem, cà phê quen thuộc với du khách, đồng thời là nơi hỏi thông tin và thuê xe.'],
    ['Highlands Coffee Phú Quốc', 'highlands-coffee-phu-quoc', 'cafe', 103.959, 10.216, 'Dương Đông', 'Dương Đông, TP. Phú Quốc', 'low', 'Chuỗi cà phê Việt phổ biến', 'Highlands Coffee là chuỗi cà phê phổ biến, có mặt tại Phú Quốc với đồ uống cà phê, trà và không gian máy lạnh.'],
    ['Cộng Cà Phê Phú Quốc', 'cong-ca-phe-phu-quoc', 'cafe', 103.958, 10.214, 'Dương Đông', 'Dương Đông, TP. Phú Quốc', 'low', 'Cà phê phong cách hoài cổ', 'Cộng Cà Phê là thương hiệu cà phê phong cách hoài cổ, nổi tiếng với cà phê cốt dừa, có chi nhánh tại Phú Quốc.'],

    // ---------- Resort ----------
    ['JW Marriott Phú Quốc Emerald Bay', 'jw-marriott-phu-quoc', 'resort', 104.021, 10.028, 'An Thới', 'Bãi Khem, An Thới, TP. Phú Quốc', 'high', 'Khu nghỉ 5 sao concept đại học giả tưởng', "JW Marriott Phú Quốc Emerald Bay là khu nghỉ dưỡng 5 sao do Bill Bensley thiết kế theo concept 'đại học Lamarck', nằm bên Bãi Khem."],
    ['Premier Village Phú Quốc Resort', 'premier-village-phu-quoc', 'resort', 104.019, 10.018, 'An Thới', 'Mũi Ông Đội, An Thới, TP. Phú Quốc', 'high', 'Biệt thự nghỉ dưỡng trên mũi đất hai mặt biển', 'Premier Village Phú Quốc gồm các biệt thự hướng biển tại Mũi Ông Đội, nơi có thể ngắm cả bình minh và hoàng hôn.'],
    ['Vinpearl Resort & Spa Phú Quốc', 'vinpearl-resort-phu-quoc', 'resort', 103.848, 10.322, 'Gành Dầu', 'Bãi Dài, Gành Dầu, TP. Phú Quốc', 'high', 'Quần thể nghỉ dưỡng lớn phía bắc đảo', 'Vinpearl Resort & Spa Phú Quốc là khu nghỉ dưỡng quy mô lớn bên Bãi Dài, gần VinWonders và Vinpearl Safari.'],
    ['Salinda Resort Phú Quốc', 'salinda-resort-phu-quoc', 'resort', 103.968, 10.17, 'Dương Tơ', 'Bãi Trường, Dương Tơ, TP. Phú Quốc', 'high', 'Resort boutique 5 sao bên bãi Trường', 'Salinda Resort là khu nghỉ boutique 5 sao bên bãi Trường, kiến trúc tinh tế và dịch vụ spa.'],
    ['Sunset Sanato Resort', 'sunset-sanato-resort', 'resort', 103.966, 10.16, 'Dương Tơ', 'Bãi Trường, Dương Tơ, TP. Phú Quốc', 'mid', 'Khu nghỉ nổi tiếng với các tượng nghệ thuật', 'Sunset Sanato Resort bên bãi Trường nổi tiếng với công viên tượng nghệ thuật và bãi biển ngắm hoàng hôn.'],
    ['Fusion Resort Phú Quốc', 'fusion-resort-phu-quoc', 'resort', 103.85, 10.3, 'Cửa Dương', 'Vũng Bầu, Cửa Dương, TP. Phú Quốc', 'high', 'Resort all-spa-inclusive bên vịnh Vũng Bầu', "Fusion Resort Phú Quốc theo mô hình 'all-spa-inclusive' bên bãi Vũng Bầu yên tĩnh, kèm liệu trình spa mỗi ngày."],

    // ---------- Khách sạn (hotel) ----------
    ['Novotel Phú Quốc Resort', 'novotel-phu-quoc', 'hotel', 103.967, 10.155, 'Dương Tơ', 'Bãi Trường, Dương Tơ, TP. Phú Quốc', 'high', 'Khách sạn - resort ven bãi Trường', 'Novotel Phú Quốc Resort thuộc Accor, nằm ven bãi Trường với phòng khách sạn và bungalow, hồ bơi hướng biển.'],
    ['Mường Thanh Luxury Phú Quốc', 'muong-thanh-luxury-phu-quoc', 'hotel', 103.969, 10.175, 'Dương Tơ', 'Bãi Trường, Dương Tơ, TP. Phú Quốc', 'mid', 'Khách sạn cao tầng bên bãi Trường', 'Mường Thanh Luxury Phú Quốc là khách sạn cao tầng bên bãi Trường với hồ bơi lớn và tầm nhìn biển.'],
    ['La Veranda Resort (MGallery)', 'la-veranda-resort', 'hotel', 103.962, 10.203, 'Dương Đông', 'Đường Trần Hưng Đạo, Dương Đông, TP. Phú Quốc', 'high', 'Khách sạn boutique kiến trúc thuộc địa', 'La Veranda Resort mang kiến trúc thuộc địa Pháp bên bờ biển Dương Đông, thuộc dòng MGallery của Accor.'],
    ['Ocean Bay Phú Quốc Resort', 'ocean-bay-phu-quoc-resort', 'hotel', 103.962, 10.198, 'Dương Đông', 'Bà Kèo, Dương Đông, TP. Phú Quốc', 'mid', 'Resort tầm trung gần trung tâm', 'Ocean Bay Phú Quốc Resort nằm khu Bà Kèo gần trung tâm Dương Đông, phòng nghỉ và bungalow hướng vườn - biển.'],
    ['Sonasea Villas & Resort', 'sonasea-phu-quoc', 'hotel', 103.966, 10.15, 'Dương Tơ', 'Bãi Trường, Dương Tơ, TP. Phú Quốc', 'mid', 'Quần thể nghỉ dưỡng bên bãi Trường', 'Sonasea Villas & Resort là quần thể nghỉ dưỡng bên bãi Trường gồm khách sạn, villa và tiện ích hội nghị.'],

    // ---------- Chợ (market) ----------
    ['Chợ Dương Đông', 'cho-duong-dong', 'market', 103.959, 10.213, 'Dương Đông', 'Đường Nguyễn Trung Trực, Dương Đông, TP. Phú Quốc', 'free', 'Chợ truyền thống trung tâm thị trấn', 'Chợ Dương Đông là chợ truyền thống trung tâm đảo, bán hải sản, nước mắm, tiêu và đặc sản Phú Quốc.'],
    ['Chợ Hàm Ninh', 'cho-ham-ninh', 'market', 104.045, 10.168, 'Hàm Ninh', 'Hàm Ninh, TP. Phú Quốc', 'free', 'Chợ hải sản làng chài phía đông', 'Chợ Hàm Ninh gắn với làng chài Hàm Ninh, nổi tiếng ghẹ và hải sản tươi mua trực tiếp từ ngư dân.'],

    // ---------- Dịch vụ du lịch (tour) ----------
    ['Tour 3 đảo An Thới (cano)', 'tour-3-dao-an-thoi', 'tour', 104.008, 9.98, 'An Thới', 'Cảng An Thới, TP. Phú Quốc', 'mid', 'Tour cano tham quan cụm đảo phía nam', 'Tour 3 đảo An Thới đưa khách bằng cano tham quan, tắm biển và lặn ngắm san hô tại cụm đảo phía nam Phú Quốc.'],
    ['Lặn ngắm san hô Hòn Thơm', 'lan-ngam-san-ho-hon-thom', 'tour', 104.01, 9.955, 'An Thới', 'Hòn Thơm, An Thới, TP. Phú Quốc', 'mid', 'Trải nghiệm lặn ngắm rạn san hô', 'Dịch vụ lặn ống thở/bình hơi ngắm rạn san hô quanh Hòn Thơm và các đảo lân cận vùng biển An Thới.'],
    ['Du thuyền ngắm hoàng hôn', 'sunset-cruise-phu-quoc', 'tour', 103.96, 10.16, 'Dương Tơ', 'Bãi Trường, Dương Tơ, TP. Phú Quốc', 'mid', 'Tour du thuyền ngắm hoàng hôn trên biển', 'Tour du thuyền/thuyền buồm buổi chiều ngắm hoàng hôn ngoài khơi bãi Trường, thường kèm đồ uống và câu mực đêm.'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [slug, nameVi, nameEn, icon] of this.categories) {
      await queryRunner.query(
        `INSERT INTO "categories" ("slug","name_vi","name_en","icon")
         VALUES ($1,$2,$3,$4) ON CONFLICT ("slug") DO NOTHING`,
        [slug, nameVi, nameEn, icon],
      );
    }

    for (const [name, slug, categorySlug, lng, lat, ward, address, priceRange, shortDesc, description] of this
      .places) {
      await queryRunner.query(
        `INSERT INTO "places"
           ("name","slug","category_id","location","address","ward","short_description","description","price_range","status")
         SELECT $1,$2, c.id, ST_SetSRID(ST_MakePoint($3,$4),4326)::geography, $5,$6,$7,$8, $9::"price_range", 'published'
         FROM "categories" c WHERE c.slug = $10
         ON CONFLICT ("slug") DO NOTHING`,
        [name, slug, lng, lat, address, ward, shortDesc, description, priceRange, categorySlug],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const placeSlugs = this.places.map((p) => p[1]);
    const categorySlugs = this.categories.map((c) => c[0]);
    // Xóa places trước (giải phóng FK), rồi các danh mục MỚI của slice này. Không đụng
    // danh mục có sẵn (beach/attraction/market/restaurant/hotel) hay dữ liệu seed gốc.
    await queryRunner.query(`DELETE FROM "places" WHERE "slug" = ANY($1)`, [placeSlugs]);
    await queryRunner.query(`DELETE FROM "categories" WHERE "slug" = ANY($1)`, [categorySlugs]);
  }
}
