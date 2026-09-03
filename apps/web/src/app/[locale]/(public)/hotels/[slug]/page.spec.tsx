/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { getHotel, type HotelDetail } from '@/modules/hotels/api/hotels.api';
import { PRICE_VERIFYING_TEXT } from '@/modules/places/trust';
import HotelDetailPage from './page';

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
