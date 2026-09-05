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
import { PRICE_VERIFYING_TEXT } from '@/modules/places/trust';
import TourDetailPage, { generateMetadata } from './page';

jest.mock('@/modules/tours/api/tours.api', () => ({
  getTour: jest.fn(),
  getItinerary: jest.fn(),
  getSchedule: jest.fn(),
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
    tour_details: null,
    ...overrides,
  };
}

async function renderPage(t: TourDetail, itinerary: TourStop[] = [], schedule: TourSchedule[] = []) {
  mockGetTour.mockResolvedValueOnce(t);
  mockGetItinerary.mockResolvedValueOnce(itinerary);
  mockGetSchedule.mockResolvedValueOnce(schedule);
  render(await TourDetailPage({ params: Promise.resolve({ slug: t.slug, locale: 'vi' }) }));
}

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
