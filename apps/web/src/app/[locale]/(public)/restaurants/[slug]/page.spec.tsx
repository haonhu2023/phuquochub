/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import {
  getMenu,
  getRestaurant,
  type MenuSection,
  type RestaurantDetail,
} from '@/modules/restaurants/api/restaurants.api';
import { PRICE_VERIFYING_TEXT } from '@/modules/places/trust';
import RestaurantDetailPage, { generateMetadata } from './page';

jest.mock('@/modules/restaurants/api/restaurants.api', () => ({
  getRestaurant: jest.fn(),
  getMenu: jest.fn(),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockGetRestaurant = getRestaurant as jest.Mock;
const mockGetMenu = getMenu as jest.Mock;

function restaurant(overrides: Partial<RestaurantDetail> = {}): RestaurantDetail {
  return {
    id: 'r1',
    name: 'Quán Hải Sản',
    slug: 'quan-hai-san',
    category_id: 'c1',
    category_slug: 'restaurant',
    short_description: null,
    price_range: null,
    cover_image_url: null,
    rating_avg: null,
    rating_count: 0,
    verification_status: 'verified',
    content_version: 1,
    status: 'published',
    location: { lat: 10.0, lng: 104.0 },
    address: null,
    ward: null,
    province: null,
    admin_area: null,
    description: null,
    description_rich: null,
    opening_hours: null,
    osm_id: null,
    google_place_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    verified_at: null,
    contacts: [],
    prices: [],
    media: [],
    faqs: [],
    trust_sources: [],
    en_display_name_approved: false,
    en_short_description_approved: false,
    restaurant_details: null,
    cuisines: [],
    amenities: [],
    ...overrides,
  };
}

async function renderPage(r: RestaurantDetail, menu: MenuSection[] = []) {
  mockGetRestaurant.mockResolvedValueOnce(r);
  mockGetMenu.mockResolvedValueOnce(menu);
  render(await RestaurantDetailPage({ params: Promise.resolve({ slug: r.slug, locale: 'vi' }) }));
}

// 2026-09-17 (real-data pass): trước bản sửa này, getRestaurant() được gọi KHÔNG kèm locale nên
// /en/restaurants/{slug} luôn nhận nội dung mặc định của server bất kể route.
describe('RestaurantDetailPage/generateMetadata — getRestaurant() phải nhận đúng locale từ route', () => {
  it('generateMetadata({ locale: "en" }) → getRestaurant(slug, "en")', async () => {
    mockGetRestaurant.mockResolvedValueOnce(restaurant());
    await generateMetadata({ params: Promise.resolve({ slug: 'quan-hai-san', locale: 'en' }) });
    expect(mockGetRestaurant).toHaveBeenCalledWith('quan-hai-san', 'en');
  });

  it('RestaurantDetailPage({ locale: "vi" }) → getRestaurant(slug, "vi")', async () => {
    await renderPage(restaurant());
    expect(mockGetRestaurant).toHaveBeenCalledWith('quan-hai-san', 'vi');
  });
});

// Bug thật đã sửa (2026-09-30) — xem hotels/[slug]/page.spec.tsx's ghi chú đầy đủ, cùng khuôn.
// SỬA 16/10/2026 — xem hotels/[slug]/page.spec.tsx's ghi chú đầy đủ cho lý do: nay tìm theo tên
// (+địa chỉ) thay vì chỉ toạ độ, cùng `getPlaceMapLinks`.
describe('RestaurantDetailPage — link Google Maps (tìm theo tên + toạ độ tham khảo, cùng dữ liệu location/name)', () => {
  it('render đúng 2 link: tìm theo tên + bù ngữ cảnh "Phú Quốc" (chưa có địa chỉ) và toạ độ tham khảo', async () => {
    await renderPage(restaurant({ location: { lat: 10.2199, lng: 103.9654 }, name: 'Quán Hải Sản', address: null }));
    const searchLink = screen.getByRole('link', { name: 'Tìm trên Google Maps →' });
    expect(searchLink).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Quán Hải Sản, Phú Quốc, Việt Nam'),
    );
    const pinLink = screen.getByRole('link', { name: 'Xem toạ độ tham khảo' });
    expect(pinLink).toHaveAttribute('href', 'https://www.google.com/maps?q=10.2199,103.9654');
  });

  it('có google_place_id (đủ điều kiện) -> CHỈ một nút chính "Xem trên Google Maps", KHÔNG còn link toạ độ tham khảo (16/10/2026, áp dụng nhất quán với trang places/hotels)', async () => {
    await renderPage(
      restaurant({ location: { lat: 10.215, lng: 103.96 }, name: 'Nhà hàng Ra Khơi', address: 'Đường 30/4, Dương Đông', google_place_id: 'ChIJ-rakhoi-verified' }),
    );
    const profileLink = screen.getByRole('link', { name: 'Xem trên Google Maps →' });
    expect(profileLink).toHaveAttribute('href', expect.stringContaining('query_place_id=ChIJ-rakhoi-verified'));
    expect(screen.queryByRole('link', { name: 'Tìm trên Google Maps →' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Xem toạ độ tham khảo' })).not.toBeInTheDocument();
  });
});

// Bug thật đã sửa (2026-09-30) — xem hotels/[slug]/page.spec.tsx's ghi chú đầy đủ, cùng khuôn.
// price_history ở đây KHÁC menu item price (không có trust column riêng) — đây là bản ghi giá
// tổng quát (vd "giá/người") với verification_status CỦA CHÍNH nó.
describe('RestaurantDetailPage — Giá tham khảo (price_history, product spec P2 2026-09-30)', () => {
  it('giá đã xác minh -> hiện số tiền thật', async () => {
    await renderPage(
      restaurant({
        prices: [{ id: 'p1', service_name: 'Giá/người', amount: 200000, currency: 'VND', unit: 'người', is_free: false, valid_from: null, valid_to: null, verification_status: 'verified' }],
      }),
    );
    expect(screen.getByText(/Giá\/người/)).toBeInTheDocument();
    expect(screen.getByText(/200.000 VND \/ người/)).toBeInTheDocument();
  });

  it('giá chưa xác minh -> không lộ amount', async () => {
    const SENTINEL = 987654321;
    await renderPage(
      restaurant({
        prices: [{ id: 'p1', service_name: 'Giá/người', amount: SENTINEL, currency: 'VND', unit: 'người', is_free: false, valid_from: null, valid_to: null, verification_status: 'pending' }],
      }),
    );
    expect(document.body.textContent).not.toContain(String(SENTINEL));
    expect(screen.getByText(PRICE_VERIFYING_TEXT)).toBeInTheDocument();
  });
});

describe('RestaurantDetailPage — gallery ảnh công khai (real-data pass)', () => {
  it('có media đã published -> render ảnh thật', async () => {
    await renderPage(
      restaurant({
        media: [
          {
            id: 'm1',
            type: 'image',
            url: 'https://api.example/api/media/m1/file',
            thumbnail_url: null,
            caption: null,
            alt_text: 'Không gian nhà hàng',
            status: 'published',
            attribution: null,
            license_type: null,
            license_url: null,
          },
        ],
      }),
    );
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://api.example/api/media/m1/file');
  });

  it('media rỗng -> không render <img> nào', async () => {
    await renderPage(restaurant({ media: [] }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

// Public Beta price trust gate (2026-08-28) — `restaurant_menu_items.price` has NO
// verification/trust column at the DB level (migration InitRestaurant never added one), so this
// page fails closed: raw menu prices are ALWAYS hidden, never conditioned on the parent place's
// verification_status (that would be a false proxy — a verified restaurant doesn't mean every
// menu price was individually checked). SENTINEL_PRICE stands in for a real leaked amount.
describe('RestaurantDetailPage — giá món (quyết định sản phẩm 2026-10-07)', () => {
  const PRICE = 987654;

  it('giá có đơn vị, ngày ghi nhận và nguồn → hiện đủ, nguồn là liên kết', async () => {
    await renderPage(restaurant(), [
      { id: 's1', name: 'Khai vị', sort_order: 0, items: [
        { id: 'i1', name: 'Gỏi hải sản', price: PRICE, currency: 'VND', price_unit: 'đĩa', price_recorded_on: '2026-10-01',
          price_source: { id: 'src1', title: 'Menu quán', url: 'https://example.test/menu' }, tags: null, is_signature: false, sort_order: 0 },
      ] },
    ]);
    expect(screen.getByText(/987.654 VND/)).toBeInTheDocument();
    expect(screen.getByText(/\/ đĩa/)).toBeInTheDocument();
    expect(screen.getByText(/ghi nhận ngày 01\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Menu quán' })).toHaveAttribute('href', 'https://example.test/menu');
  });

  it('thiếu đơn vị/ngày/nguồn → nói rõ là chưa rõ, không suy đoán, không gọi là đã xác minh', async () => {
    await renderPage(restaurant(), [
      { id: 's1', name: 'Món chính', sort_order: 0, items: [
        { id: 'i1', name: 'Cá nướng', price: PRICE, currency: 'VND', price_unit: null, price_recorded_on: null, price_source: null, tags: null, is_signature: false, sort_order: 0 },
      ] },
    ]);
    expect(screen.getByText(/chưa rõ đơn vị/)).toBeInTheDocument();
    expect(screen.getByText(/chưa rõ ngày ghi nhận/)).toBeInTheDocument();
    expect(screen.getByText(/chưa rõ nguồn giá/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/đã xác minh/);
  });

  it('món chưa có giá → "chưa có giá", KHÔNG hiện 0 và KHÔNG hiện miễn phí', async () => {
    await renderPage(restaurant(), [
      { id: 's1', name: 'Đồ uống', sort_order: 0, items: [
        { id: 'i1', name: 'Nước dừa', price: null, currency: 'VND', price_unit: null, price_recorded_on: null, price_source: null, tags: null, is_signature: false, sort_order: 0 },
      ] },
    ]);
    expect(screen.getByText('chưa có giá')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/miễn phí|0 VND/);
  });
});

// Phase 20 (EN indexation gate) — cùng chính sách/nguồn sự thật đã kiểm chứng ở
// places/[slug]/page.spec.tsx: chưa có bản dịch restaurant nào APPROVED/PUBLIC hôm nay
// (isEnDetailIndexable khoá `false` toàn cục), nên bản `/en` phải noindex,follow và không quảng
// cáo hreflang="en" giả; bản `/vi` không bị ảnh hưởng.
describe('RestaurantDetailPage — generateMetadata EN indexation gate', () => {
  const r = restaurant({ slug: 'quan-hai-san', name: 'Quán Hải Sản' });

  it('bản /en chưa đủ điều kiện index → noindex,follow, không hreflang="en"', async () => {
    mockGetRestaurant.mockResolvedValueOnce(r);
    const metadataEn = await generateMetadata({
      params: Promise.resolve({ slug: r.slug, locale: 'en' }),
    });
    expect(metadataEn.robots).toEqual({ index: false, follow: true });
    expect(metadataEn.alternates?.languages?.en).toBeUndefined();
    expect(metadataEn.alternates?.languages?.['x-default']).toBe(
      'http://localhost:3000/vi/restaurants/quan-hai-san',
    );
  });

  it('bản /vi (nguồn gốc) KHÔNG bị noindex', async () => {
    mockGetRestaurant.mockResolvedValueOnce(r);
    const metadataVi = await generateMetadata({
      params: Promise.resolve({ slug: r.slug, locale: 'vi' }),
    });
    expect(metadataVi.robots).toBeUndefined();
    expect(metadataVi.alternates?.canonical).toBe('http://localhost:3000/vi/restaurants/quan-hai-san');
  });
});

// Bug thật đã sửa (2026-09-30): cuisines là mảng OBJECT {id,code,label_vi,label_en}, trang trước
// đây gọi `.join(' · ')` trên đó (đúng cho string[], sai cho object[]) — sẽ render "[object Object]".
describe('RestaurantDetailPage — ẩm thực/đặc sản/liên hệ/giờ mở cửa/món nổi bật (product spec, 2026-09-29)', () => {
  it('cuisines render đúng label_vi, KHÔNG BAO GIỜ "[object Object]"', async () => {
    await renderPage(restaurant({ cuisines: [{ id: 'c1', code: 'seafood', label_vi: 'Hải sản', label_en: 'Seafood' }] }));
    expect(screen.getByText(/Hải sản/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('[object Object]');
  });

  it('is_local_specialty=true → hiện dòng đặc sản Phú Quốc', async () => {
    await renderPage(restaurant({ restaurant_details: { is_local_specialty: true, dietary: null } }));
    expect(screen.getByText(/đặc sản Phú Quốc/)).toBeInTheDocument();
  });

  it('is_local_specialty=false → KHÔNG hiện dòng đặc sản', async () => {
    await renderPage(restaurant({ restaurant_details: { is_local_specialty: false, dietary: null } }));
    expect(document.body.textContent).not.toContain('đặc sản Phú Quốc');
  });

  it('contacts render đúng nhãn/giá trị', async () => {
    await renderPage(
      restaurant({
        contacts: [{ id: 'c1', contact_type: 'PHONE', value: '0909123456', label: null, is_primary: true, verification_status: 'pending', display_order: 0 }],
      }),
    );
    expect(screen.getByText(/PHONE: 0909123456/)).toBeInTheDocument();
  });

  // Bug thiếu đã sửa (2026-10-11): owner đã gán được tiện nghi cho nhà hàng qua AmenitiesEditor
  // từ trước, nhưng trang công khai chưa từng render field này dù backend giờ đã trả về.
  it('amenities render đúng, cùng khuôn trang khách sạn', async () => {
    await renderPage(restaurant({ amenities: [{ id: 'am1', code: 'parking', label_vi: 'Bãi đỗ xe', label_en: null, icon: null, group: null }] }));
    expect(screen.getByText(/Bãi đỗ xe/)).toBeInTheDocument();
  });

  it('amenities rỗng → không hiện mục "Tiện nghi"', async () => {
    await renderPage(restaurant({ amenities: [] }));
    expect(screen.queryByText('Tiện nghi')).not.toBeInTheDocument();
  });

  // Bug thiếu đã sửa (2026-10-11): places/[slug]/page.tsx đã có bảng giờ cả tuần từ trước — trang
  // nhà hàng riêng chỉ hiện "giờ hôm nay", chưa từng hiện phần này.
  it('có giờ theo ngày → hiện bảng giờ cả tuần, đủ 7 ngày', async () => {
    await renderPage(
      restaurant({
        opening_hours: {
          regular: {
            mon: [{ open: '08:00', close: '22:00' }],
            tue: [{ open: '08:00', close: '22:00' }],
            wed: [{ open: '08:00', close: '22:00' }],
            thu: [{ open: '08:00', close: '22:00' }],
            fri: [{ open: '08:00', close: '22:00' }],
            sat: [{ open: '08:00', close: '22:00' }],
            sun: [],
          },
        },
      }),
    );
    expect(screen.getByText('Giờ mở cửa cả tuần')).toBeInTheDocument();
    expect(screen.getByText(/Thứ Hai/)).toBeInTheDocument();
    expect(screen.getByText(/Chủ Nhật/)).toBeInTheDocument();
  });

  it('món nổi bật (is_signature) đánh dấu ★ cạnh tên món', async () => {
    await renderPage(restaurant(), [
      {
        id: 's1',
        name: 'Món chính',
        sort_order: 0,
        items: [{ id: 'i1', name: 'Gỏi cá trích', price: null, currency: 'VND', price_unit: null, price_recorded_on: null, price_source: null, tags: null, is_signature: true, sort_order: 0 }],
      },
    ]);
    expect(screen.getByText(/★/)).toBeInTheDocument();
    expect(screen.getByText(/Gỏi cá trích/)).toBeInTheDocument();
  });

  it('món KHÔNG nổi bật → không có ★', async () => {
    await renderPage(restaurant(), [
      {
        id: 's1',
        name: 'Món chính',
        sort_order: 0,
        items: [{ id: 'i1', name: 'Cơm trắng', price: null, currency: 'VND', price_unit: null, price_recorded_on: null, price_source: null, tags: null, is_signature: false, sort_order: 0 }],
      },
    ]);
    expect(document.body.textContent).not.toContain('★');
  });
});

// Bug thật đã sửa 2026-10-17 — cùng nguyên nhân với trang tin tuyển dụng/BĐS/khách sạn. Xem ghi
// chú đầy đủ ở jobs/[id]/page.spec.tsx.
describe('RestaurantDetailPage — giữ xuống dòng mô tả (bug thật đã sửa)', () => {
  it('"\\n" của mô tả tới DOM nguyên vẹn khi có nội dung nhiều đoạn', async () => {
    await renderPage(restaurant({ description: 'Đoạn một.\n\nĐoạn hai, sau một dòng trống.' }));
    expect(screen.getByText(/Đoạn một/).textContent).toBe('Đoạn một.\n\nĐoạn hai, sau một dòng trống.');
  });
});
