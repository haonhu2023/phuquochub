/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { PlaceCollectionBlock } from './PlaceCollectionBlock';
import { getPlace } from '@/modules/places/api/places.api';
import type { PlaceDetail } from '@/modules/places/types';
import { ApiError } from '@/lib/http';

jest.mock('@/modules/places/api/places.api', () => ({ getPlace: jest.fn() }));
const mockGetPlace = getPlace as jest.MockedFunction<typeof getPlace>;

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
  };
}

describe('PlaceCollectionBlock', () => {
  afterEach(() => jest.resetAllMocks());

  it('renders a card for each place slug that resolves', async () => {
    mockGetPlace.mockImplementation((slug) => Promise.resolve(makePlace(slug)));

    const element = await PlaceCollectionBlock({
      content: { heading: 'Ở đâu', placeSlugs: ['a', 'b'], emptyStateText: 'Chưa có gì' },
      locale: 'vi',
    });
    render(element);

    expect(screen.getByText('Place a')).toBeInTheDocument();
    expect(screen.getByText('Place b')).toBeInTheDocument();
    expect(screen.queryByText('Chưa có gì')).not.toBeInTheDocument();
  });

  it('drops a slug that fails to resolve (404/unpublished) without failing the whole block', async () => {
    mockGetPlace.mockImplementation((slug) =>
      slug === 'gone' ? Promise.reject(new ApiError('not found', 404)) : Promise.resolve(makePlace(slug)),
    );

    const element = await PlaceCollectionBlock({
      content: { heading: 'Ở đâu', placeSlugs: ['gone', 'ok'], emptyStateText: 'Chưa có gì' },
      locale: 'vi',
    });
    render(element);

    expect(screen.queryByText('Place gone')).not.toBeInTheDocument();
    expect(screen.getByText('Place ok')).toBeInTheDocument();
  });

  it('renders the empty-state text (not an empty grid) when every slug fails to resolve', async () => {
    mockGetPlace.mockRejectedValue(new ApiError('not found', 404));

    const element = await PlaceCollectionBlock({
      content: { heading: 'Ở đâu', placeSlugs: ['x', 'y'], emptyStateText: 'Chưa có địa điểm phù hợp' },
      locale: 'vi',
    });
    render(element);

    expect(screen.getByText('Chưa có địa điểm phù hợp')).toBeInTheDocument();
  });
});
