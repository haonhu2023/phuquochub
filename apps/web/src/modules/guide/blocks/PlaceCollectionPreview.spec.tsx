/** @jest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import { PlaceCollectionPreview } from './PlaceCollectionPreview';
import { getPlace } from '@/modules/places/api/places.api';
import type { PlaceDetail } from '@/modules/places/types';

jest.mock('@/modules/places/api/places.api', () => ({ getPlace: jest.fn() }));
const mockGetPlace = getPlace as jest.MockedFunction<typeof getPlace>;

// Only the fields PlaceCard reads; the rest of PlaceDetail is irrelevant to this test.
function makePlace(slug: string): PlaceDetail {
  return {
    id: slug,
    name: `Place ${slug}`,
    slug,
    category_id: 'c1',
    short_description: null,
    price_range: null,
    cover_image_url: null,
    rating_avg: null,
    rating_count: 0,
    verification_status: 'pending',
    content_version: 1,
    status: 'published',
    location: { lat: 10, lng: 104 },
    category_slug: null,
    address: null,
    ward: null,
    province: null,
    admin_area: null,
    description: null,
    opening_hours: null,
    osm_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    verified_at: null,
    contacts: [],
    prices: [],
    media: [],
    faqs: [],
    trust_sources: [],
    en_display_name_approved: false,
    en_short_description_approved: false,
  } as unknown as PlaceDetail;
}

describe('PlaceCollectionPreview (editor overlay, client-side)', () => {
  afterEach(() => jest.resetAllMocks());

  it('resolves slugs in the browser and renders a card for each one that succeeds', async () => {
    mockGetPlace.mockImplementation(async (slug) => {
      if (slug === 'broken') throw new Error('404');
      return makePlace(slug);
    });
    render(<PlaceCollectionPreview content={{ heading: '', placeSlugs: ['a', 'broken', 'b'], emptyStateText: 'none' }} locale="vi" />);
    expect(await screen.findByText('Place a')).toBeInTheDocument();
    expect(screen.getByText('Place b')).toBeInTheDocument();
    expect(screen.queryByText('Place broken')).not.toBeInTheDocument();
    expect(mockGetPlace).toHaveBeenCalledWith('a', 'vi');
  });

  it('shows the empty-state text when no slug resolves', async () => {
    mockGetPlace.mockRejectedValue(new Error('404'));
    render(<PlaceCollectionPreview content={{ heading: '', placeSlugs: ['gone'], emptyStateText: 'Chưa có địa điểm' }} locale="vi" />);
    expect(await screen.findByText('Chưa có địa điểm')).toBeInTheDocument();
  });

  it('shows the empty-state text immediately when there are no slugs, without calling the API', async () => {
    render(<PlaceCollectionPreview content={{ heading: '', placeSlugs: [], emptyStateText: 'Trống' }} locale="vi" />);
    await waitFor(() => expect(screen.getByText('Trống')).toBeInTheDocument());
    expect(mockGetPlace).not.toHaveBeenCalled();
  });

  it('resolves the real slug novotel-phu-quoc and renders its card', async () => {
    mockGetPlace.mockImplementation(async (slug) => makePlace(slug));
    render(<PlaceCollectionPreview content={{ heading: '', placeSlugs: ['novotel-phu-quoc'], emptyStateText: 'none' }} locale="vi" />);
    expect(await screen.findByText('Place novotel-phu-quoc')).toBeInTheDocument();
    expect(mockGetPlace).toHaveBeenCalledWith('novotel-phu-quoc', 'vi');
    expect(screen.queryByText('none')).not.toBeInTheDocument();
  });

  it('shows the empty state when novotel-phu-quoc does not resolve', async () => {
    mockGetPlace.mockRejectedValue(new Error('404'));
    render(<PlaceCollectionPreview content={{ heading: '', placeSlugs: ['novotel-phu-quoc'], emptyStateText: 'Chưa có địa điểm' }} locale="vi" />);
    expect(await screen.findByText('Chưa có địa điểm')).toBeInTheDocument();
  });
});
