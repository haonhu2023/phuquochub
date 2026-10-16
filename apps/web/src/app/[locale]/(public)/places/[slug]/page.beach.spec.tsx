/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import type { PlaceDetail } from '@/modules/places/types';
import { getPlace } from '@/modules/places/api/places.api';
import { getBeachPublicDetails, type BeachDetails, type BeachPublicDetails } from '@/modules/beaches/api/beaches.api';
import { listReviews } from '@/modules/reviews/api/reviews.api';
import PlaceDetailPage from './page';

jest.mock('@/modules/places/api/places.api', () => ({ getPlace: jest.fn() }));
jest.mock('@/modules/beaches/api/beaches.api', () => ({ getBeachPublicDetails: jest.fn() }));
jest.mock('@/modules/reviews/api/reviews.api', () => ({ listReviews: jest.fn() }));
jest.mock('@/modules/reviews/ReviewsSection', () => ({ ReviewsSection: () => null }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
  permanentRedirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const mockGetPlace = getPlace as jest.Mock;
const mockBeach = getBeachPublicDetails as jest.Mock;
const mockListReviews = listReviews as jest.Mock;

const EMPTY_BEACH_DETAILS: BeachDetails = {
  access_route: null,
  characteristics: null,
  services: null,
  best_season: null,
  best_season_source: null,
  lifeguard_info: null,
  lifeguard_info_source: null,
  sourced_notes: null,
  sourced_notes_source: null,
};

function beachResponse(overrides: Partial<BeachDetails> = {}, amenities: BeachPublicDetails['amenities'] = []): BeachPublicDetails {
  return { beach_details: { ...EMPTY_BEACH_DETAILS, ...overrides }, amenities };
}

beforeEach(() => {
  mockListReviews.mockReset().mockResolvedValue([]);
});

afterEach(() => jest.clearAllMocks());

async function callPage(slug: string, locale: string) {
  return PlaceDetailPage({ params: Promise.resolve({ slug, locale }) });
}

function place(overrides: Partial<PlaceDetail> = {}): PlaceDetail {
  return {
    id: 'p1',
    name: 'Bãi Sao',
    slug: 'bai-sao',
    category_id: 'c1',
    category_slug: 'beach',
    short_description: 'Bãi biển cát trắng',
    price_range: null,
    cover_image_url: null,
    rating_avg: null,
    rating_count: 0,
    verification_status: 'pending',
    content_version: 1,
    status: 'published',
    location: { lat: 10.0466, lng: 104.0281 },
    address: null,
    ward: 'An Thới',
    province: null,
    admin_area: null,
    description: null,
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
    ...overrides,
  };
}

describe('PlaceDetailPage — mục Thông tin bãi biển (công khai)', () => {
  it('bãi biển có đường vào và mùa tham khảo có nguồn → hiện cả hai, nguồn là liên kết', async () => {
    mockGetPlace.mockResolvedValue(place({ slug: 'bai-sao', category_slug: 'beach' }));
    mockBeach.mockResolvedValue(
      beachResponse({
        access_route: 'Đi đường ven biển 10 phút',
        best_season: 'Tháng 11 đến tháng 4',
        best_season_source: { title: 'Sở Du lịch', url: 'https://example.test/src', verified_at: null },
      }),
    );
    render(await callPage('bai-sao', 'vi'));
    expect(screen.getByRole('heading', { name: 'Thông tin bãi biển' })).toBeInTheDocument();
    expect(screen.getByText('Đi đường ven biển 10 phút')).toBeInTheDocument();
    expect(screen.getByText(/Tháng 11 đến tháng 4/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Sở Du lịch' });
    expect(link).toHaveAttribute('href', 'https://example.test/src');
  });

  it('mùa tham khảo không có nguồn → không hiện "Nguồn:" và không suy ra trạng thái an toàn', async () => {
    mockGetPlace.mockResolvedValue(place({ slug: 'bai-sao', category_slug: 'beach' }));
    mockBeach.mockResolvedValue(beachResponse({ best_season: 'Tháng 11 đến tháng 4' }));
    render(await callPage('bai-sao', 'vi'));
    expect(screen.getByText('Tháng 11 đến tháng 4')).toBeInTheDocument();
    expect(screen.queryByText(/Nguồn:/)).not.toBeInTheDocument();
  });

  it('lỗi đọc chi tiết bãi → trang vẫn render, không có mục bãi biển', async () => {
    mockGetPlace.mockResolvedValue(place({ slug: 'bai-sao', category_slug: 'beach' }));
    mockBeach.mockRejectedValue(new Error('network'));
    render(await callPage('bai-sao', 'vi'));
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Thông tin bãi biển' })).not.toBeInTheDocument();
  });

  it('không phải bãi biển → không gọi API chi tiết bãi', async () => {
    mockGetPlace.mockResolvedValue(place({ slug: 'cafe-x', category_slug: 'cafe' }));
    render(await callPage('cafe-x', 'vi'));
    expect(mockBeach).not.toHaveBeenCalled();
  });
  it('chi tiết bãi có đủ trường nhưng đều trống → không có mục bãi biển, không ghi "miễn phí" hay "an toàn"', async () => {
    mockGetPlace.mockResolvedValue(place({ slug: 'bai-sao', category_slug: 'beach' }));
    mockBeach.mockResolvedValue(beachResponse());
    const { container } = render(await callPage('bai-sao', 'vi'));
    expect(screen.queryByRole('heading', { name: 'Thông tin bãi biển' })).not.toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(/miễn phí|an toàn|dịch vụ tại bãi/i);
  });

  // Bug thiếu đã sửa (2026-10-11): amenities (place_amenities dùng chung) chưa từng được render
  // cho bãi biển dù owner đã gán được qua AmenitiesEditor từ trước.
  it('amenities render đúng, ĐỘC LẬP với beach_details rỗng (hai nguồn khác nhau)', async () => {
    mockGetPlace.mockResolvedValue(place({ slug: 'bai-sao', category_slug: 'beach' }));
    mockBeach.mockResolvedValue(beachResponse({}, [{ id: 'am1', code: 'parking', label_vi: 'Bãi đỗ xe', label_en: null, icon: null, group: null }]));
    render(await callPage('bai-sao', 'vi'));
    expect(screen.getByText(/Bãi đỗ xe/)).toBeInTheDocument();
    // beach_details vẫn rỗng → không có mục "Thông tin bãi biển", nhưng mục "Tiện nghi" vẫn hiện.
    expect(screen.queryByRole('heading', { name: 'Thông tin bãi biển' })).not.toBeInTheDocument();
  });

  it('amenities rỗng → không hiện mục "Tiện nghi"', async () => {
    mockGetPlace.mockResolvedValue(place({ slug: 'bai-sao', category_slug: 'beach' }));
    mockBeach.mockResolvedValue(beachResponse());
    render(await callPage('bai-sao', 'vi'));
    expect(screen.queryByText('Tiện nghi')).not.toBeInTheDocument();
  });
});
