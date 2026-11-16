import {
  buildDetailSocialMetadata,
  buildDetailTitle,
  buildMetaDescription,
  isEnDetailIndexable,
} from './seo';

describe('buildDetailTitle', () => {
  it('thêm loại + "Phú Quốc" khi tên chưa có địa danh', () => {
    expect(buildDetailTitle('Dinh Cậu', 'attraction', 'vi')).toBe('Dinh Cậu · Điểm tham quan Phú Quốc · PhuQuocHub');
    expect(buildDetailTitle('Dinh Cau', 'attraction', 'en')).toBe('Dinh Cau · Attraction in Phu Quoc · PhuQuocHub');
  });

  it('không lặp "Phú Quốc" khi tên đã có (kể cả viết không dấu)', () => {
    expect(buildDetailTitle('Sailing Club Phú Quốc', 'restaurant', 'vi')).toBe('Sailing Club Phú Quốc · Nhà hàng · PhuQuocHub');
    expect(buildDetailTitle('Novotel Phu Quoc Resort', 'hotel', 'vi')).toBe('Novotel Phu Quoc Resort · Khách sạn · PhuQuocHub');
  });

  it('danh mục lạ/thiếu → nhãn chung "Địa điểm"/"Place"', () => {
    expect(buildDetailTitle('Chùa Hộ Quốc', null, 'vi')).toBe('Chùa Hộ Quốc · Địa điểm Phú Quốc · PhuQuocHub');
    expect(buildDetailTitle('X', 'unknown', 'en')).toBe('X · Place in Phu Quoc · PhuQuocHub');
  });
});

describe('buildMetaDescription', () => {
  const long = 'Sailing Club Phú Quốc là nhà hàng, bar và beach club ven biển tại Khu phức hợp Bãi Trường, Phú Quốc. Thực đơn kết hợp món Việt, hải sản, món nướng, pizza, burger, salad, món tráng miệng và đồ uống.';

  it('giữ nguyên mô tả ngắn có độ dài hợp lý', () => {
    const s = 'Mũi đá ven biển và điểm tín ngưỡng tại khu vực Dương Đông, có lối lên bằng 29 bậc đá.';
    expect(buildMetaDescription(s, long)).toBe(s);
  });

  it('cắt mô tả quá dài ở ranh giới từ, tối đa 160 ký tự, kết thúc bằng "…"', () => {
    const out = buildMetaDescription(long, null)!;
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith('…')).toBe(true);
    expect(long.startsWith(out.slice(0, -1))).toBe(true);
  });

  it('mô tả ngắn quá ngắn → dùng mô tả dài (đã cắt gọn)', () => {
    const out = buildMetaDescription('Resort all-spa-inclusive bên vịnh Vũng Bầu', long)!;
    expect(out.startsWith('Sailing Club Phú Quốc là nhà hàng')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(160);
  });

  it('chỉ có mô tả ngắn quá ngắn, không có mô tả dài → vẫn dùng mô tả ngắn', () => {
    expect(buildMetaDescription('Resort bên vịnh', null)).toBe('Resort bên vịnh');
    expect(buildMetaDescription(null, null)).toBeUndefined();
  });
});

describe('buildDetailSocialMetadata', () => {
  it('có ảnh → openGraph + twitter summary_large_image dùng ảnh đó', () => {
    const m = buildDetailSocialMetadata({ title: 'T', description: 'D', image: 'https://x/img.webp', imageAlt: 'A' });
    expect(m.openGraph).toMatchObject({ title: 'T', images: [{ url: 'https://x/img.webp', alt: 'A' }] });
    expect(m.twitter).toMatchObject({ card: 'summary_large_image', images: ['https://x/img.webp'] });
  });

  it('không có ảnh → {} để trang kế thừa ảnh chia sẻ mặc định của site', () => {
    expect(buildDetailSocialMetadata({ title: 'T', image: null, imageAlt: 'A' })).toEqual({});
  });
});

// EN indexation gate v2 (entity-aware) — trước bản này, `isEnDetailIndexable` khoá cứng `false`
// toàn cục bất kể slug. Giờ đây quyết định index dựa THẲNG vào hai cờ công khai thật của bản dịch
// EN (`display_name`/`short_description`, mỗi cờ chỉ `true` khi translation đang `is_current` +
// `is_public` + `is_production_data` — tức đã qua kiểm duyệt người thật, không phải chỉ TỒN TẠI
// một hàng translation). Test theo đúng ma trận A-E của tác vụ EN indexation gate.
describe('isEnDetailIndexable (EN indexation gate v2)', () => {
  it('A: cả display_name và short_description tiếng Anh đều đã duyệt/công khai → indexable', () => {
    expect(
      isEnDetailIndexable({ displayNameEnApproved: true, shortDescriptionEnApproved: true }),
    ).toBe(true);
  });

  it('B: tên đã duyệt nhưng mô tả còn PENDING (chưa duyệt) → không index', () => {
    expect(
      isEnDetailIndexable({ displayNameEnApproved: true, shortDescriptionEnApproved: false }),
    ).toBe(false);
  });

  it('C: mô tả đã duyệt nhưng tên còn PENDING (chưa duyệt) → không index', () => {
    expect(
      isEnDetailIndexable({ displayNameEnApproved: false, shortDescriptionEnApproved: true }),
    ).toBe(false);
  });

  it('D: có bản dịch EN nhưng cả hai còn PENDING → không index (input false/false)', () => {
    expect(
      isEnDetailIndexable({ displayNameEnApproved: false, shortDescriptionEnApproved: false }),
    ).toBe(false);
  });

  it('E: REJECTED/NEEDS_CHANGES tự nhiên rơi về false ở nguồn (API chỉ trả true cho APPROVED+public) — input false/false → không index', () => {
    // API không có trạng thái riêng "rejected" cho hàm này — REJECTED/NEEDS_CHANGES đều khiến
    // `en_*_approved` là false ngay từ API (không current+public), nên bài test này khoá đúng
    // hành vi khi cả hai cờ đều false, dùng chung với case D — không có nhánh code riêng nào để
    // phân biệt "PENDING" với "REJECTED" ở tầng web, đúng như thiết kế (chỉ có approved/không).
    expect(
      isEnDetailIndexable({ displayNameEnApproved: false, shortDescriptionEnApproved: false }),
    ).toBe(false);
  });

  it('không có input (undefined) → không index, không throw', () => {
    expect(isEnDetailIndexable(undefined)).toBe(false);
  });

  it('input null → không index, không throw', () => {
    expect(isEnDetailIndexable(null)).toBe(false);
  });
});
