/** @jest-environment jsdom */
import {
  isValidCoord,
  buildPopupCard,
  popupState,
  clusterElement,
  placeElement,
  setMarkerSelected,
} from './mapMarkers';
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

// Map Audit (2026-08-10) — marker được maplibre gắn thẳng vào DOM ngoài cây React, nên
// `role="button"` một mình không đủ cho bàn phím/trình đọc màn hình; phải tự cấp tabIndex + xử lý
// Enter/Space (div không tự làm điều này như <button> thật).
describe('clusterElement — kích hoạt bằng chuột/bàn phím', () => {
  it('có role="button", aria-label mô tả số lượng, và tabIndex=0 (focus được bằng bàn phím)', () => {
    const el = clusterElement(5, jest.fn());
    expect(el.getAttribute('role')).toBe('button');
    expect(el.getAttribute('aria-label')).toContain('5');
    expect(el.tabIndex).toBe(0);
  });

  it('click kích hoạt onActivate', () => {
    const onActivate = jest.fn();
    clusterElement(3, onActivate).click();
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('Enter kích hoạt onActivate', () => {
    const onActivate = jest.fn();
    const el = clusterElement(3, onActivate);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('Space (" ") kích hoạt onActivate', () => {
    const onActivate = jest.fn();
    const el = clusterElement(3, onActivate);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('phím khác (vd Tab) KHÔNG kích hoạt onActivate', () => {
    const onActivate = jest.fn();
    const el = clusterElement(3, onActivate);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(onActivate).not.toHaveBeenCalled();
  });
});

describe('placeElement — kích hoạt bằng chuột/bàn phím', () => {
  it('có role="button", aria-label = tên địa điểm, và tabIndex=0', () => {
    const el = placeElement('Bãi Sao', jest.fn());
    expect(el.getAttribute('role')).toBe('button');
    expect(el.getAttribute('aria-label')).toBe('Bãi Sao');
    expect(el.tabIndex).toBe(0);
  });

  it('click và Enter đều kích hoạt onActivate', () => {
    const onClick = jest.fn();
    placeElement('Bãi Sao', onClick).click();
    expect(onClick).toHaveBeenCalledTimes(1);

    const onKey = jest.fn();
    const el = placeElement('Bãi Sao', onKey);
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onKey).toHaveBeenCalledTimes(1);
  });

  // Map/home upgrade (Phase 6.3): thay emoji 📍 bằng SVG pin — không có viền/tương phản trên nền
  // tile OSM. Test này khoá lại việc "emoji không được quay trở lại", chứ không khoá chi tiết SVG.
  it('không còn dùng emoji 📍 — marker là SVG pin có viền, tương phản trên mọi nền tile', () => {
    const el = placeElement('Bãi Sao', jest.fn());
    expect(el.textContent).not.toBe('📍');
    expect(el.querySelector('svg')).not.toBeNull();
  });

  it('aria-current mặc định là false — chưa ở trạng thái đang chọn', () => {
    const el = placeElement('Bãi Sao', jest.fn());
    expect(el.getAttribute('aria-current')).not.toBe('true');
  });
});

describe('setMarkerSelected — trạng thái đang chọn (Phase 6.3)', () => {
  it('bật trạng thái chọn → gắn aria-current="true"', () => {
    const el = placeElement('Bãi Sao', jest.fn());
    setMarkerSelected(el, true);
    expect(el.getAttribute('aria-current')).toBe('true');
  });

  it('tắt trạng thái chọn → aria-current quay lại "false"', () => {
    const el = placeElement('Bãi Sao', jest.fn());
    setMarkerSelected(el, true);
    setMarkerSelected(el, false);
    expect(el.getAttribute('aria-current')).toBe('false');
  });
});

describe('clusterElement — kích thước tăng theo số lượng (Phase 6.4)', () => {
  it('cụm lớn (>=50) to hơn cụm nhỏ, cả hai đều có trần kích thước hợp lý', () => {
    const small = clusterElement(3, jest.fn());
    const big = clusterElement(120, jest.fn());
    const parse = (v: string) => Number.parseInt(v, 10);
    expect(parse(big.style.width)).toBeGreaterThan(parse(small.style.width));
    expect(parse(big.style.width)).toBeLessThanOrEqual(56);
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
    province: null,
    admin_area: null,
    description: null,
    opening_hours: null,
    osm_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    verified_at: null,
    contacts: [],
    prices: [],
    media: [],
    faqs: [],
    trust_sources: [],
    ...overrides,
  };
}

const CATEGORIES: Category[] = [{ id: 'c1', slug: 'beach', name_vi: 'Bãi biển', name_en: 'Beach', icon: null, parent_id: null }];

describe('buildPopupCard — nội dung popup marker (Phase 4.3)', () => {
  it('hiển thị tên và link "Xem chi tiết" trỏ đúng slug — tối thiểu bắt buộc', () => {
    const card = buildPopupCard(detail());
    expect(card.querySelector('p')?.textContent).toBe('Bãi Sao');
    const link = card.querySelector('a');
    // PR A: `locale` mặc định DEFAULT_LOCALE ('vi') khi không truyền — không double-prefix.
    expect(link?.getAttribute('href')).toBe('/vi/places/bai-sao');
    expect(link?.textContent).toContain('Xem chi tiết');
  });

  it('PR A: dùng đúng locale khi được truyền tường minh', () => {
    const card = buildPopupCard(detail(), undefined, 'en');
    const link = card.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/en/places/bai-sao');
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

  it('không có cover_image_url → không render thẻ <img>, thay bằng placeholder chữ cái đầu', () => {
    const card = buildPopupCard(detail({ cover_image_url: null }));
    expect(card.querySelector('img')).toBeNull();
    const placeholder = card.querySelector('[aria-hidden="true"]');
    expect(placeholder?.textContent).toBe('B'); // "Bãi Sao" → chữ cái đầu
  });

  it('có short_description công khai → hiển thị trong popup', () => {
    const card = buildPopupCard(detail({ short_description: 'Bãi biển đẹp nhất đảo.' }));
    expect(card.textContent).toContain('Bãi biển đẹp nhất đảo.');
  });

  it('không có short_description → không render dòng mô tả (không suy diễn nội dung)', () => {
    const card = buildPopupCard(detail({ short_description: null }));
    expect(card.querySelector('.popupDesc')).toBeNull();
  });

  it('locale=en → link "Xem chi tiết" đổi thành "View details"', () => {
    const card = buildPopupCard(detail(), undefined, 'en');
    expect(card.querySelector('a')?.textContent).toContain('View details');
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

  // Public Beta price trust gate (2026-08-28) — mặc định `detail()` là verification_status=
  // 'pending' (chưa tin cậy), nên phải TRUYỀN THÊM trạng thái tin cậy để test giá thật hợp lệ.
  it('price_range hợp lệ + verification_status tin cậy → hiển thị nhãn tiếng Việt', () => {
    const card = buildPopupCard(detail({ price_range: 'high', verification_status: 'verified' }));
    expect(card.textContent).toContain('Cao cấp');
  });

  describe('price trust gate', () => {
    it('verification_status pending (mặc định) → KHÔNG lộ giá thật, hiện "Giá đang được xác minh"', () => {
      const card = buildPopupCard(detail({ price_range: 'high' }));
      expect(card.textContent).not.toContain('Cao cấp');
      expect(card.textContent).toContain('Giá đang được xác minh');
    });

    it.each(['expired', 'rejected'] as const)('verification_status %s → vẫn ẩn giá thật', (status) => {
      const card = buildPopupCard(detail({ price_range: 'mid', verification_status: status }));
      expect(card.textContent).not.toContain('Tầm trung');
      expect(card.textContent).toContain('Giá đang được xác minh');
    });

    it.each(['verified', 'official', 'community_verified'] as const)(
      'verification_status %s → hiện giá thật, không hiện dòng đang xác minh',
      (status) => {
        const card = buildPopupCard(detail({ price_range: 'low', verification_status: status }));
        expect(card.textContent).toContain('Bình dân');
        expect(card.textContent).not.toContain('Giá đang được xác minh');
      },
    );

    it('không có price_range → không hiện giá thật lẫn dòng đang xác minh', () => {
      const card = buildPopupCard(detail({ price_range: null }));
      expect(card.textContent).not.toContain('Giá đang được xác minh');
    });
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
