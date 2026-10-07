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
    content_version: 1,
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
    en_display_name_approved: false,
    en_short_description_approved: false,
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

// 2026-09-17 (real-data pass): trước bản sửa này, getTour() được gọi KHÔNG kèm locale nên
// /en/tours/{slug} luôn nhận nội dung mặc định của server bất kể route.

function renderPage(details: Record<string, unknown> | null) {
  mockGetTour.mockResolvedValue(tour({ tour_details: details } as Partial<TourDetail>));
  mockGetItinerary.mockResolvedValue([]);
  mockGetSchedule.mockResolvedValue([]);
  return TourDetailPage({ params: Promise.resolve({ slug: 'tour-lan-bien', locale: 'vi' }) });
}

describe('TourDetailPage — Thông tin tour (chi tiết admin nhập)', () => {
  it('hiện đúng các trường đã có: loại, thời lượng, độ khó, điểm đón, bao gồm, không bao gồm, hủy', async () => {
    render(await renderPage({
      tour_type: 'diving',
      duration_minutes: 180,
      difficulty: 'easy',
      pickup_point: 'Cổng khách sạn synthetic',
      inclusions: 'Vé lặn synthetic',
      exclusions: 'Ăn trưa synthetic',
      cancellation_policy: 'Hủy trước 24h synthetic',
    }));
    expect(screen.getByRole('heading', { name: 'Thông tin tour' })).toBeInTheDocument();
    expect(screen.getByText('Lặn')).toBeInTheDocument();
    expect(screen.getByText('180 phút')).toBeInTheDocument();
    expect(screen.getByText('Dễ')).toBeInTheDocument();
    expect(screen.getByText('Cổng khách sạn synthetic')).toBeInTheDocument();
    expect(screen.getByText('Ăn trưa synthetic')).toBeInTheDocument();
    expect(screen.getByText('Hủy trước 24h synthetic')).toBeInTheDocument();
  });

  it('thiếu dữ liệu → không hiện dòng đó; thời lượng null không thành "0 phút"; không có chữ miễn phí/đang mở', async () => {
    render(await renderPage({
      tour_type: 'trekking',
      duration_minutes: null,
      difficulty: null,
      pickup_point: null,
      inclusions: null,
      exclusions: null,
      cancellation_policy: null,
    }));
    expect(screen.getByText('Đi bộ/trekking')).toBeInTheDocument();
    expect(screen.queryByText('Thời lượng')).toBeNull();
    expect(screen.queryByText('Điểm đón khách')).toBeNull();
    expect(screen.queryByText(/0 phút/)).toBeNull();
    expect(screen.queryByText(/miễn phí|đang mở/i)).toBeNull();
  });

  it('không có chi tiết (null) hoặc toàn trường rỗng → không có mục Thông tin tour', async () => {
    render(await renderPage(null));
    expect(screen.queryByRole('heading', { name: 'Thông tin tour' })).toBeNull();
  });
});
