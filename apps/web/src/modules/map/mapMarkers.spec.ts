/** @jest-environment jsdom */
import { isValidCoord, buildPopupCard, popupState } from './mapMarkers';
import type { PlaceDetail } from '@/modules/places/types';
import type { Category } from '@/modules/categories/api/categories.api';

// Map Audit Phase 3 — validation toạ độ phòng thủ ở FE (DB đã NOT NULL/published-only, nhưng
// một hàng lỗi trong tương lai không được phép làm rớt cả lô marker).
describe('isValidCoord', () => {
  it('chấp nhận toạ độ hợp lệ trong Phú Quốc', () => {
    expect(isValidCoord(103.98, 10.22)).toBe(true);
  });

  it('chấp nhận biên hợp lệ của Trái Đất', () => {
    expect(isValidCoord(180, 90)).toBe(true);
    expect(isValidCoord(-180, -90)).toBe(true);
  });

  it('từ chối NaN', () => {
    expect(isValidCoord(NaN, 10)).toBe(false);
    expect(isValidCoord(103, NaN)).toBe(false);
  });

  it('từ chối Infinity', () => {
    expect(isValidCoord(Infinity, 10)).toBe(false);
    expect(isValidCoord(103, -Infinity)).toBe(false);
  });

  it('từ chối toạ độ ngoài dải Trái Đất', () => {
    expect(isValidCoord(181, 10)).toBe(false);
    expect(isValidCoord(103, 91)).toBe(false);
  });

  // 0,0 (Null Island) nằm ngoài Vịnh Thái Lan/Phú Quốc — hợp lệ về mặt toán học (trong dải
  // Trái Đất) nhưng audit yêu cầu không render "marker lat=0 lng=0" nếu đó là placeholder lỗi.
  // isValidCoord chỉ đảm bảo AN TOÀN KỸ THUẬT (không NaN/Infinity/ngoài dải) — không đoán ý
  // nghĩa nghiệp vụ của 0,0, vì dữ liệu thật hợp lệ có thể (về lý thuyết) nằm ở biên dải số.
  it('0,0 hợp lệ về mặt kỹ thuật (không phải nguồn gây crash)', () => {
    expect(isValidCoord(0, 0)).toBe(true);
  });
});

function detail(overrides: Partial<PlaceDetail> = {}): PlaceDetail {
  return {
    id: 'p1',
    name: 'Bãi Sao',
    slug: 'bai-sao',
    category_id: 'c1',
    category_slug: 'beach',
    short_description: null,
    price_range: null,
    cover_image_url: null,
    rating_avg: null,
    rating_count: 0,
    verification_status: 'pending',
    status: 'published',
    location: { lat: 10.05, lng: 104.0 },
    address: null,
    ward: null,
    description: null,
    opening_hours: null,
    osm_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    contacts: [],
    prices: [],
    media: [],
    faqs: [],
    ...overrides,
  };
}

const CATEGORIES: Category[] = [{ id: 'c1', slug: 'beach', name_vi: 'Bãi biển', name_en: 'Beach', icon: null, parent_id: null }];

describe('buildPopupCard — nội dung popup marker (Phase 4.3)', () => {
  it('hiển thị tên và link "Xem chi tiết" trỏ đúng slug — tối thiểu bắt buộc', () => {
    const card = buildPopupCard(detail());
    expect(card.querySelector('p')?.textContent).toBe('Bãi Sao');
    const link = card.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/places/bai-sao');
    expect(link?.textContent).toContain('Xem chi tiết');
  });

  it('có categories map → dùng nhãn tiếng Việt thay vì category_slug', () => {
    const card = buildPopupCard(detail(), CATEGORIES);
    expect(card.textContent).toContain('Bãi biển');
    expect(card.textContent).not.toContain('beach');
  });

  it('không có categories map → lùi về category_slug (không invent dữ liệu)', () => {
    const card = buildPopupCard(detail());
    expect(card.textContent).toContain('beach');
  });

  it('không có cover_image_url → không render thẻ <img>', () => {
    const card = buildPopupCard(detail({ cover_image_url: null }));
    expect(card.querySelector('img')).toBeNull();
  });

  it('có cover_image_url → render <img> với src/alt đúng', () => {
    const card = buildPopupCard(detail({ cover_image_url: 'https://cdn.example/x.jpg' }));
    const img = card.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://cdn.example/x.jpg');
    expect(img?.getAttribute('alt')).toBe('Bãi Sao');
  });

  it('rating_avg null → không hiển thị dòng rating', () => {
    const card = buildPopupCard(detail({ rating_avg: null }));
    expect(card.textContent).not.toContain('★');
  });

  it('rating_avg có giá trị → hiển thị làm tròn 1 chữ số thập phân + số lượt', () => {
    const card = buildPopupCard(detail({ rating_avg: 4.567, rating_count: 12 }));
    expect(card.textContent).toContain('★ 4.6 (12)');
  });

  it('price_range hợp lệ → hiển thị nhãn tiếng Việt', () => {
    const card = buildPopupCard(detail({ price_range: 'high' }));
    expect(card.textContent).toContain('Cao cấp');
  });

  it('ward null → không hiển thị dòng khu vực trống', () => {
    const card = buildPopupCard(detail({ ward: null, category_slug: null }));
    expect(card.querySelector('.popupMeta')?.children.length ?? 0).toBe(0);
  });

  it('ward có giá trị → hiển thị đúng tên khu vực', () => {
    const card = buildPopupCard(detail({ ward: 'An Thới' }));
    expect(card.textContent).toContain('An Thới');
  });
});

describe('popupState', () => {
  it('hiển thị đúng nội dung trạng thái (loading/error)', () => {
    expect(popupState('Đang tải…').textContent).toBe('Đang tải…');
    expect(popupState('Không tải được thông tin địa điểm.').textContent).toBe(
      'Không tải được thông tin địa điểm.',
    );
  });
});
