/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import {
  getItinerary,
  getSchedule,
  getTour,
  type TourDetail,
  type TourSchedule,
  type TourStop,
} from '@/modules/tours/api/tours.api';
import { listReviews } from '@/modules/reviews/api/reviews.api';
import { PRICE_VERIFYING_TEXT } from '@/modules/places/trust';
import TourDetailPage, { generateMetadata } from './page';

jest.mock('@/modules/tours/api/tours.api', () => ({
  getTour: jest.fn(),
  getItinerary: jest.fn(),
  getSchedule: jest.fn(),
}));
jest.mock('@/modules/reviews/api/reviews.api', () => ({ listReviews: jest.fn() }));
// ReviewsSection cần AuthProvider context (useAuth) — không liên quan tới hành vi được test ở
// đây, mock để tách rời, cùng cách places/[slug]/page.spec.tsx mock ReviewsSection.
jest.mock('@/modules/reviews/ReviewsSection', () => ({
  ReviewsSection: () => null,
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockGetTour = getTour as jest.Mock;
const mockGetItinerary = getItinerary as jest.Mock;
const mockGetSchedule = getSchedule as jest.Mock;
const mockListReviews = listReviews as jest.Mock;
mockListReviews.mockResolvedValue([]);

function tour(overrides: Partial<TourDetail> = {}): TourDetail {
  return {
    id: 't1',
    name: 'Tour lặn biển',
    slug: 'tour-lan-bien',
    category_id: 'c1',
    category_slug: 'tour',
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
    tour_details: null,
    amenities: [],
    ...overrides,
  };
}

async function renderPage(t: TourDetail, itinerary: TourStop[] = [], schedule: TourSchedule[] = []) {
  mockGetTour.mockResolvedValueOnce(t);
  mockGetItinerary.mockResolvedValueOnce(itinerary);
  mockGetSchedule.mockResolvedValueOnce(schedule);
  render(await TourDetailPage({ params: Promise.resolve({ slug: t.slug, locale: 'vi' }) }));
}

// Giai đoạn 1 (21/10/2026) — Báo sai/Lưu tin mở rộng sang trang tour (target_type='place', khớp
// ADR-002 — tour LÀ một dòng places). Chỉ xác nhận render.
describe('TourDetailPage — Báo sai/Lưu tin (giai đoạn 1, 21/10/2026)', () => {
  it('render cả hai nút "Lưu tin" và "Báo sai / báo trùng"', async () => {
    await renderPage(tour());
    expect(screen.getByRole('button', { name: /Lưu tin/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Báo sai \/ báo trùng/ })).toBeInTheDocument();
  });
});

// Giai đoạn 3 (chiến lược data-hub) — "đặt chỗ" nối vào web. Chỉ xác nhận render, hành vi submit đã
// test riêng ở BookingButton.spec.tsx.
describe('TourDetailPage — nút Đặt chỗ (giai đoạn 3)', () => {
  it('render nút "Đặt chỗ"', async () => {
    await renderPage(tour());
    expect(screen.getByRole('button', { name: 'Đặt chỗ' })).toBeInTheDocument();
  });
});

// Giai đoạn 4 (chiến lược data-hub) — mục đánh giá trước đây KHÔNG tồn tại trên trang tour (phát
// hiện khi rà soát Giai đoạn 4), gắn thêm ở đây. Hành vi render/badge thật đã test riêng ở
// ReviewsSection.spec.tsx — chỉ xác nhận trang gọi đúng API với đúng id của tour đang xem.
describe('TourDetailPage — mục đánh giá (giai đoạn 4)', () => {
  it('gọi listReviews với đúng id tour', async () => {
    await renderPage(tour({ id: 't-review-test' }));
    expect(mockListReviews).toHaveBeenCalledWith('t-review-test');
  });

  it('listReviews lỗi → KHÔNG làm sập trang (reviews rỗng)', async () => {
    mockListReviews.mockRejectedValueOnce(new Error('network'));
    await renderPage(tour());
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});

// 2026-09-17 (real-data pass): trước bản sửa này, getTour() được gọi KHÔNG kèm locale nên
// /en/tours/{slug} luôn nhận nội dung mặc định của server bất kể route.
describe('TourDetailPage/generateMetadata — getTour() phải nhận đúng locale từ route', () => {
  it('generateMetadata({ locale: "en" }) → getTour(slug, "en")', async () => {
    mockGetTour.mockResolvedValueOnce(tour());
    await generateMetadata({ params: Promise.resolve({ slug: 'tour-lan-bien', locale: 'en' }) });
    expect(mockGetTour).toHaveBeenCalledWith('tour-lan-bien', 'en');
  });

  it('TourDetailPage({ locale: "vi" }) → getTour(slug, "vi")', async () => {
    await renderPage(tour());
    expect(mockGetTour).toHaveBeenCalledWith('tour-lan-bien', 'vi');
  });
});

describe('TourDetailPage — gallery ảnh công khai (real-data pass)', () => {
  it('có media đã published -> render ảnh thật', async () => {
    await renderPage(
      tour({
        media: [
          {
            id: 'm1',
            type: 'image',
            url: 'https://api.example/api/media/m1/file',
            thumbnail_url: null,
            caption: null,
            alt_text: 'Đoàn tour ngoài khơi',
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
    await renderPage(tour({ media: [] }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

// Public Beta price trust gate (2026-08-28) — `tour_schedules.price` has NO verification/trust
// column at the DB level (migration InitTour never added one), so this page fails closed: raw
// schedule prices are ALWAYS hidden, never conditioned on the parent place's verification_status
// (a verified tour doesn't mean every scheduled departure's price was individually checked).
describe('TourDetailPage — schedule price trust gate', () => {
  const SENTINEL_PRICE = 987654;

  it('schedule entry has a price → raw amount never renders anywhere, disclosure shown', async () => {
    await renderPage(tour(), [], [
      { id: 'sc1', date: '2026-09-01', capacity: 10, price: SENTINEL_PRICE, currency: 'VND', valid_from: null, valid_to: null },
    ]);
    expect(document.body.textContent).not.toContain(String(SENTINEL_PRICE));
    expect(screen.getByText(PRICE_VERIFYING_TEXT)).toBeInTheDocument();
    expect(screen.getByText(/10 chỗ/)).toBeInTheDocument();
  });

  it('tour itself verified → schedule price still hidden (place trust is not a proxy for item trust)', async () => {
    await renderPage(tour({ verification_status: 'verified' }), [], [
      { id: 'sc1', date: '2026-09-01', capacity: null, price: SENTINEL_PRICE, currency: 'VND', valid_from: null, valid_to: null },
    ]);
    expect(document.body.textContent).not.toContain(String(SENTINEL_PRICE));
  });

  it('no priced schedule entry → no fake disclosure line', async () => {
    await renderPage(tour(), [], [
      { id: 'sc1', date: '2026-09-01', capacity: 5, price: null, currency: 'VND', valid_from: null, valid_to: null },
    ]);
    expect(screen.queryByText(PRICE_VERIFYING_TEXT)).not.toBeInTheDocument();
  });

  it('multiple priced schedule entries → disclosure renders once, not once per entry', async () => {
    await renderPage(tour(), [], [
      { id: 'sc1', date: '2026-09-01', capacity: null, price: SENTINEL_PRICE, currency: 'VND', valid_from: null, valid_to: null },
      { id: 'sc2', date: '2026-09-02', capacity: null, price: SENTINEL_PRICE + 1, currency: 'VND', valid_from: null, valid_to: null },
    ]);
    expect(screen.getAllByText(PRICE_VERIFYING_TEXT)).toHaveLength(1);
  });
});

// Bug thiếu đã sửa (2026-10-11): amenities (place_amenities dùng chung) và opening_hours (đã có
// sẵn trên mọi Place) chưa từng được render ở trang tour, dù dữ liệu/hàm đã sẵn có từ trước.
describe('TourDetailPage — tiện nghi + giờ hoạt động (bug thiếu đã sửa)', () => {
  it('amenities render đúng', async () => {
    await renderPage(tour({ amenities: [{ id: 'am1', code: 'parking', label_vi: 'Bãi đỗ xe', label_en: null, icon: null, group: null }] }));
    expect(screen.getByText(/Bãi đỗ xe/)).toBeInTheDocument();
  });

  it('amenities rỗng → không hiện mục "Tiện nghi"', async () => {
    await renderPage(tour({ amenities: [] }));
    expect(screen.queryByText('Tiện nghi')).not.toBeInTheDocument();
  });

  it('chưa có opening_hours → không hiện mục "Giờ hoạt động"', async () => {
    await renderPage(tour({ opening_hours: null }));
    expect(screen.queryByText('Giờ hoạt động')).not.toBeInTheDocument();
  });

  it('có giờ theo ngày → hiện mục "Giờ hoạt động" kèm bảng giờ cả tuần', async () => {
    await renderPage(
      tour({
        opening_hours: {
          regular: {
            mon: [{ open: '08:00', close: '17:00' }],
            tue: [{ open: '08:00', close: '17:00' }],
            wed: [{ open: '08:00', close: '17:00' }],
            thu: [{ open: '08:00', close: '17:00' }],
            fri: [{ open: '08:00', close: '17:00' }],
            sat: [{ open: '08:00', close: '17:00' }],
            sun: [],
          },
        },
      }),
    );
    expect(screen.getByText('Giờ hoạt động')).toBeInTheDocument();
    expect(screen.getByText('Giờ mở cửa cả tuần')).toBeInTheDocument();
    expect(screen.getByText(/Thứ Hai/)).toBeInTheDocument();
  });
});

// Phase 20 (EN indexation gate) — cùng chính sách/nguồn sự thật đã kiểm chứng ở
// places/[slug]/page.spec.tsx: chưa có bản dịch tour nào APPROVED/PUBLIC hôm nay
// (isEnDetailIndexable khoá `false` toàn cục), nên bản `/en` phải noindex,follow và không quảng
// cáo hreflang="en" giả; bản `/vi` không bị ảnh hưởng.
describe('TourDetailPage — generateMetadata EN indexation gate', () => {
  const t = tour({ slug: 'tour-lan-bien', name: 'Tour lặn biển' });

  it('bản /en chưa đủ điều kiện index → noindex,follow, không hreflang="en"', async () => {
    mockGetTour.mockResolvedValueOnce(t);
    const metadataEn = await generateMetadata({
      params: Promise.resolve({ slug: t.slug, locale: 'en' }),
    });
    expect(metadataEn.robots).toEqual({ index: false, follow: true });
    expect(metadataEn.alternates?.languages?.en).toBeUndefined();
    expect(metadataEn.alternates?.languages?.['x-default']).toBe(
      'http://localhost:3000/vi/tours/tour-lan-bien',
    );
  });

  it('bản /vi (nguồn gốc) KHÔNG bị noindex', async () => {
    mockGetTour.mockResolvedValueOnce(t);
    const metadataVi = await generateMetadata({
      params: Promise.resolve({ slug: t.slug, locale: 'vi' }),
    });
    expect(metadataVi.robots).toBeUndefined();
    expect(metadataVi.alternates?.canonical).toBe('http://localhost:3000/vi/tours/tour-lan-bien');
  });
});

// Bug thật đã sửa 2026-10-17 — cùng nguyên nhân với trang tin tuyển dụng/BĐS/khách sạn/nhà hàng.
// Xem ghi chú đầy đủ ở jobs/[id]/page.spec.tsx.
describe('TourDetailPage — giữ xuống dòng mô tả (bug thật đã sửa)', () => {
  it('"\\n" của mô tả tới DOM nguyên vẹn khi có nội dung nhiều đoạn', async () => {
    await renderPage(tour({ description: 'Đoạn một.\n\nĐoạn hai, sau một dòng trống.' }));
    expect(screen.getByText(/Đoạn một/).textContent).toBe('Đoạn một.\n\nĐoạn hai, sau một dòng trống.');
  });
});
