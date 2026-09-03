/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import {
  getMenu,
  getRestaurant,
  type MenuSection,
  type RestaurantDetail,
} from '@/modules/restaurants/api/restaurants.api';
import { PRICE_VERIFYING_TEXT } from '@/modules/places/trust';
import RestaurantDetailPage from './page';

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
    restaurant_details: null,
    cuisines: [],
    ...overrides,
  };
}

async function renderPage(r: RestaurantDetail, menu: MenuSection[] = []) {
  mockGetRestaurant.mockResolvedValueOnce(r);
  mockGetMenu.mockResolvedValueOnce(menu);
  render(await RestaurantDetailPage({ params: Promise.resolve({ slug: r.slug, locale: 'vi' }) }));
}

// Public Beta price trust gate (2026-08-28) — `restaurant_menu_items.price` has NO
// verification/trust column at the DB level (migration InitRestaurant never added one), so this
// page fails closed: raw menu prices are ALWAYS hidden, never conditioned on the parent place's
// verification_status (that would be a false proxy — a verified restaurant doesn't mean every
// menu price was individually checked). SENTINEL_PRICE stands in for a real leaked amount.
describe('RestaurantDetailPage — menu price trust gate', () => {
  const SENTINEL_PRICE = 987654;

  it('menu item has a price → raw amount never renders anywhere, disclosure shown', async () => {
    await renderPage(restaurant(), [
      {
        id: 's1',
        name: 'Khai vị',
        sort_order: 0,
        items: [
          { id: 'i1', name: 'Gỏi hải sản', price: SENTINEL_PRICE, currency: 'VND', tags: null, sort_order: 0 },
        ],
      },
    ]);
    expect(screen.getByText('Gỏi hải sản')).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(String(SENTINEL_PRICE)))).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(String(SENTINEL_PRICE));
    expect(screen.getByText(PRICE_VERIFYING_TEXT)).toBeInTheDocument();
  });

  it('restaurant itself verified → menu price still hidden (place trust is not a proxy for item trust)', async () => {
    await renderPage(restaurant({ verification_status: 'verified' }), [
      {
        id: 's1',
        name: 'Món chính',
        sort_order: 0,
        items: [{ id: 'i1', name: 'Cá nướng', price: SENTINEL_PRICE, currency: 'VND', tags: null, sort_order: 0 }],
      },
    ]);
    expect(document.body.textContent).not.toContain(String(SENTINEL_PRICE));
  });

  it('item with no price → no fake disclosure line for that section', async () => {
    await renderPage(restaurant(), [
      {
        id: 's1',
        name: 'Đồ uống',
        sort_order: 0,
        items: [{ id: 'i1', name: 'Nước dừa', price: null, currency: 'VND', tags: null, sort_order: 0 }],
      },
    ]);
    expect(screen.getByText('Nước dừa')).toBeInTheDocument();
    expect(screen.queryByText(PRICE_VERIFYING_TEXT)).not.toBeInTheDocument();
  });

  it('multiple priced items in one section → disclosure renders once, not once per item', async () => {
    await renderPage(restaurant(), [
      {
        id: 's1',
        name: 'Khai vị',
        sort_order: 0,
        items: [
          { id: 'i1', name: 'Gỏi', price: SENTINEL_PRICE, currency: 'VND', tags: null, sort_order: 0 },
          { id: 'i2', name: 'Chả giò', price: SENTINEL_PRICE + 1, currency: 'VND', tags: null, sort_order: 1 },
        ],
      },
    ]);
    expect(screen.getAllByText(PRICE_VERIFYING_TEXT)).toHaveLength(1);
  });
});
