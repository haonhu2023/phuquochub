import { toPlaceDetail } from './places.mapper';
import { PlaceStatus } from './place.enums';
import type { PlaceDetailRow } from './repositories/places.repository';

describe('toPlaceDetail', () => {
  const baseRow: PlaceDetailRow = {
    id: 'p1',
    name: 'Bãi Sao',
    slug: 'bai-sao',
    category_id: 'c1',
    category_slug: 'beach',
    short_description: 'Bãi biển',
    price_range: null,
    cover_image_url: null,
    rating_avg: '4.5',
    rating_count: 10,
    verification_status: 'pending',
    status: PlaceStatus.PUBLISHED,
    lat: 10.0466,
    lng: 104.0281,
    address: 'An Thới',
    ward: 'An Thới',
    province: 'An Giang',
    admin_area: 'Đặc khu Phú Quốc',
    description: 'Cát trắng',
    opening_hours: null,
    osm_id: '123456789',
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-02T00:00:00Z'),
  };

  it('mở rộng card + scalar chi tiết; osm_id string → number', () => {
    const d = toPlaceDetail(baseRow);
    expect(d.slug).toBe('bai-sao');
    expect(d.location).toEqual({ lat: 10.0466, lng: 104.0281 });
    expect(d.address).toBe('An Thới');
    expect(d.osm_id).toBe(123456789);
    expect(d.opening_hours).toBeNull();
  });

  it('category_slug được đưa ra hợp đồng chi tiết (điều hướng về đúng trang duyệt)', () => {
    expect(toPlaceDetail(baseRow).category_slug).toBe('beach');
  });

  // Place Information Foundation (2026-08-18) — ADDRESS_MODEL.
  //
  // `ward` và `admin_area` là HAI trường khác nhau và phải ra hợp đồng riêng biệt: `ward` là nhãn
  // khu vực cho người đọc (`Dương Đông`), `admin_area` là đơn vị hành chính theo pháp luật
  // (`Đặc khu Phú Quốc`). Gộp chúng lại chính là lỗi mà mô hình này sinh ra để chặn.
  it('province/admin_area ra hợp đồng TÁCH BIỆT khỏi ward (nhãn khu vực ≠ đơn vị hành chính)', () => {
    const d = toPlaceDetail(baseRow);
    expect(d.ward).toBe('An Thới');
    expect(d.province).toBe('An Giang');
    expect(d.admin_area).toBe('Đặc khu Phú Quốc');
  });

  // Cùng lý do `category_slug`: cột mới nên row cũ/mock (dựng trước migration) không mang khoá.
  // `undefined` lọt ra thì JSON.stringify nuốt mất khoá — client không phân biệt được "chưa xác
  // minh đơn vị hành chính" với "API không có trường này".
  it('province/admin_area vắng mặt → null, không rơi khỏi payload', () => {
    const row = { ...baseRow } as Partial<PlaceDetailRow>;
    delete row.province;
    delete row.admin_area;

    const d = toPlaceDetail(row as PlaceDetailRow);
    expect(d.province).toBeNull();
    expect(d.admin_area).toBeNull();
    expect(Object.keys(d)).toEqual(expect.arrayContaining(['province', 'admin_area']));
  });

  it('category_slug vắng mặt/undefined → null, không rơi khỏi payload', () => {
    // Row từ driver có thể không mang khoá này (query cũ/mock) — mapper phải phát `null`
    // thay vì `undefined` (JSON.stringify nuốt undefined, làm khoá biến mất khỏi hợp đồng).
    const withoutCategorySlug: Record<string, unknown> = { ...baseRow };
    delete withoutCategorySlug.category_slug;
    const mapped = toPlaceDetail(withoutCategorySlug as unknown as PlaceDetailRow);
    expect(mapped.category_slug).toBeNull();
    expect('category_slug' in mapped).toBe(true);
  });

  it('osm_id null giữ null', () => {
    expect(toPlaceDetail({ ...baseRow, osm_id: null }).osm_id).toBeNull();
  });
});
