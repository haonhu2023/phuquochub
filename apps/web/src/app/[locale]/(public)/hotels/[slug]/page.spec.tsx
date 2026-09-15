/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { getHotel, type HotelDetail } from '@/modules/hotels/api/hotels.api';
import { PRICE_VERIFYING_TEXT } from '@/modules/places/trust';
import HotelDetailPage, { generateMetadata } from './page';

jest.mock('@/modules/hotels/api/hotels.api', () => ({ getHotel: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockGetHotel = getHotel as jest.Mock;

function hotel(overrides: Partial<HotelDetail> = {}): HotelDetail {
  return {
    id: 'h1',
    name: 'Khách sạn Biển Xanh',
    slug: 'khach-san-bien-xanh',
    category_id: 'c1',
    category_slug: 'hotel',
    short_description: null,
    price_range: null,
    cover_image_url: null,
    rating_avg: null,
    rating_count: 0,
    verification_status: 'verified',
    status: 'published',
    location: { lat: 10.0, lng: 104.0 },
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
    hotel_details: null,
    rooms: [],
    amenities: [],
    ...overrides,
  };
}

async function renderPage(h: HotelDetail) {
  mockGetHotel.mockResolvedValueOnce(h);
  render(await HotelDetailPage({ params: Promise.resolve({ slug: h.slug, locale: 'vi' }) }));
}

// Public Beta price trust gate (2026-08-28) — `hotel_room_types.price_ref` has NO
// verification/trust column at the DB level (migration InitHotel never added one), so this page
// fails closed: raw room prices are ALWAYS hidden, never conditioned on the parent place's
// verification_status (a verified hotel doesn't mean every room rate was individually checked).
describe('HotelDetailPage — room price trust gate', () => {
  const SENTINEL_PRICE = 987654;

  it('room has a price_ref → raw amount never renders anywhere, disclosure shown', async () => {
    await renderPage(
      hotel({
        rooms: [{ id: 'rm1', name: 'Phòng Deluxe', capacity: 2, price_ref: SENTINEL_PRICE, currency: 'VND', sort_order: 0 }],
      }),
    );
    expect(screen.getByText(/Phòng Deluxe/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(String(SENTINEL_PRICE));
    expect(screen.getByText(PRICE_VERIFYING_TEXT)).toBeInTheDocument();
  });

  it('hotel itself verified → room price still hidden (place trust is not a proxy for item trust)', async () => {
    await renderPage(
      hotel({
        verification_status: 'verified',
        rooms: [{ id: 'rm1', name: 'Phòng Suite', capacity: 4, price_ref: SENTINEL_PRICE, currency: 'VND', sort_order: 0 }],
      }),
    );
    expect(document.body.textContent).not.toContain(String(SENTINEL_PRICE));
  });

  it('room with no price_ref → no fake disclosure line', async () => {
    await renderPage(
      hotel({
        rooms: [{ id: 'rm1', name: 'Phòng Standard', capacity: 2, price_ref: null, currency: 'VND', sort_order: 0 }],
      }),
    );
    expect(screen.queryByText(PRICE_VERIFYING_TEXT)).not.toBeInTheDocument();
  });

  it('multiple priced rooms → disclosure renders once, not once per room', async () => {
    await renderPage(
      hotel({
        rooms: [
          { id: 'rm1', name: 'Phòng A', capacity: 2, price_ref: SENTINEL_PRICE, currency: 'VND', sort_order: 0 },
          { id: 'rm2', name: 'Phòng B', capacity: 2, price_ref: SENTINEL_PRICE + 1, currency: 'VND', sort_order: 1 },
        ],
      }),
    );
    expect(screen.getAllByText(PRICE_VERIFYING_TEXT)).toHaveLength(1);
  });
});

// Phase 20 (EN indexation gate) — cùng chính sách/nguồn sự thật đã kiểm chứng ở
// places/[slug]/page.spec.tsx: chưa có bản dịch hotel nào APPROVED/PUBLIC hôm nay
// (isEnDetailIndexable khoá `false` toàn cục), nên bản `/en` phải noindex,follow và không quảng
// cáo hreflang="en" giả; bản `/vi` không bị ảnh hưởng.
describe('HotelDetailPage — generateMetadata EN indexation gate', () => {
  const h = hotel({ slug: 'khach-san-bien-xanh', name: 'Khách sạn Biển Xanh' });

  it('bản /en chưa đủ điều kiện index → noindex,follow, không hreflang="en"', async () => {
    mockGetHotel.mockResolvedValueOnce(h);
    const metadataEn = await generateMetadata({
      params: Promise.resolve({ slug: h.slug, locale: 'en' }),
    });
    expect(metadataEn.robots).toEqual({ index: false, follow: true });
    expect(metadataEn.alternates?.languages?.en).toBeUndefined();
    expect(metadataEn.alternates?.languages?.['x-default']).toBe(
      'http://localhost:3000/vi/hotels/khach-san-bien-xanh',
    );
  });

  it('bản /vi (nguồn gốc) KHÔNG bị noindex', async () => {
    mockGetHotel.mockResolvedValueOnce(h);
    const metadataVi = await generateMetadata({
      params: Promise.resolve({ slug: h.slug, locale: 'vi' }),
    });
    expect(metadataVi.robots).toBeUndefined();
    expect(metadataVi.alternates?.canonical).toBe('http://localhost:3000/vi/hotels/khach-san-bien-xanh');
  });
});

// 2026-09 rà lỗi UI mobile: `locale` được đọc từ route param nhưng trước đây KHÔNG BAO GIỜ được
// truyền vào getHotel() — nên /en/hotels/:slug và /vi/hotels/:slug luôn fetch (và hiển thị) CÙNG
// một nội dung. Regression guard cho cả hai lệnh gọi getHotel() trong file này (generateMetadata
// VÀ component chính) — không chỉ path string, mà đúng cặp tham số (slug, locale).
describe('HotelDetailPage — getHotel() phải nhận đúng locale từ route (cả hai lệnh gọi)', () => {
  const h = hotel({ slug: 'khach-san-bien-xanh' });

  it('generateMetadata({ locale: "en" }) → getHotel(slug, "en")', async () => {
    mockGetHotel.mockResolvedValueOnce(h);
    await generateMetadata({ params: Promise.resolve({ slug: h.slug, locale: 'en' }) });
    expect(mockGetHotel).toHaveBeenCalledWith(h.slug, 'en');
  });

  it('generateMetadata({ locale: "vi" }) → getHotel(slug, "vi")', async () => {
    mockGetHotel.mockResolvedValueOnce(h);
    await generateMetadata({ params: Promise.resolve({ slug: h.slug, locale: 'vi' }) });
    expect(mockGetHotel).toHaveBeenCalledWith(h.slug, 'vi');
  });

  it('HotelDetailPage({ locale: "en" }) → getHotel(slug, "en")', async () => {
    mockGetHotel.mockResolvedValueOnce(h);
    render(await HotelDetailPage({ params: Promise.resolve({ slug: h.slug, locale: 'en' }) }));
    expect(mockGetHotel).toHaveBeenCalledWith(h.slug, 'en');
  });

  it('HotelDetailPage({ locale: "vi" }) → getHotel(slug, "vi")', async () => {
    mockGetHotel.mockResolvedValueOnce(h);
    render(await HotelDetailPage({ params: Promise.resolve({ slug: h.slug, locale: 'vi' }) }));
    expect(mockGetHotel).toHaveBeenCalledWith(h.slug, 'vi');
  });
});

// Fix A (2026-09-16): gallery công khai trang hotel — trước đây hotel.media không được render ở
// bất kỳ đâu trên trang, dù API đã trả đúng dữ liệu. Dùng lại đúng hệ thống gallery của
// places/[slug]/page.tsx (MediaCredit + places.module.css .gallery/.galleryFigure/.galleryImg),
// không dựng bộ hiển thị thứ hai.
describe('HotelDetailPage — gallery ảnh công khai (Fix A)', () => {
  function media(overrides: Partial<import('@/modules/places/types').PlaceMedia> = {}) {
    return {
      id: 'm1',
      type: 'image',
      url: 'https://phuquochub.com/api/media/m1/file',
      thumbnail_url: null,
      caption: 'Chú thích ảnh',
      alt_text: 'Alt ảnh',
      status: 'published',
      attribution: null,
      license_type: null,
      license_url: null,
      ...overrides,
    };
  }

  it('không có ảnh nào → không render khối gallery, không có ảnh vỡ', async () => {
    await renderPage(hotel({ media: [] }));
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('đúng MỘT ảnh → render đúng 1 <img>, đúng src', async () => {
    await renderPage(hotel({ media: [media({ id: 'm1', url: 'https://phuquochub.com/api/media/m1/file' })] }));
    const imgs = screen.getAllByRole('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute('src', 'https://phuquochub.com/api/media/m1/file');
  });

  it('nhiều ảnh → render đủ, ĐÚNG THỨ TỰ server trả về (không tự sắp lại ở client)', async () => {
    await renderPage(
      hotel({
        media: [
          media({ id: 'm1', url: 'https://x/1' }),
          media({ id: 'm2', url: 'https://x/2' }),
          media({ id: 'm3', url: 'https://x/3' }),
        ],
      }),
    );
    const imgs = screen.getAllByRole('img');
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(['https://x/1', 'https://x/2', 'https://x/3']);
  });

  it('alt_text có giá trị → dùng alt_text, không rơi về caption/tên khách sạn', async () => {
    await renderPage(hotel({ name: 'Khách sạn X', media: [media({ alt_text: 'Alt thật', caption: 'Caption khác' })] }));
    expect(screen.getByAltText('Alt thật')).toBeInTheDocument();
  });

  it('alt_text null, có caption → dùng caption', async () => {
    await renderPage(hotel({ name: 'Khách sạn X', media: [media({ alt_text: null, caption: 'Caption dự phòng' })] }));
    expect(screen.getByAltText('Caption dự phòng')).toBeInTheDocument();
  });

  it('alt_text và caption đều null → dùng tên khách sạn làm alt', async () => {
    await renderPage(hotel({ name: 'Khách sạn Cuối Cùng', media: [media({ alt_text: null, caption: null })] }));
    expect(screen.getByAltText('Khách sạn Cuối Cùng')).toBeInTheDocument();
  });

  it('VI và EN cùng render một giá trị caption/alt duy nhất (giới hạn schema một-giá-trị, không phải thiếu bản dịch)', async () => {
    const sharedAlt = 'Toàn cảnh trên cao La Veranda Resort Phú Quốc bên bờ biển Dương Đông, có hồ bơi và hàng dừa';
    const h = hotel({ slug: 'la-veranda-resort', media: [media({ alt_text: sharedAlt, caption: sharedAlt })] });

    mockGetHotel.mockResolvedValueOnce(h);
    const { unmount } = render(await HotelDetailPage({ params: Promise.resolve({ slug: h.slug, locale: 'vi' }) }));
    expect(screen.getByAltText(sharedAlt)).toBeInTheDocument();
    unmount();

    mockGetHotel.mockResolvedValueOnce(h);
    render(await HotelDetailPage({ params: Promise.resolve({ slug: h.slug, locale: 'en' }) }));
    expect(screen.getByAltText(sharedAlt)).toBeInTheDocument();
  });
});
