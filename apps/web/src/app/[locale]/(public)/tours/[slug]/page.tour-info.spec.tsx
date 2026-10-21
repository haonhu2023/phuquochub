/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { getItinerary, getSchedule, getTour, type TourDetail } from '@/modules/tours/api/tours.api';
import { listReviews } from '@/modules/reviews/api/reviews.api';
import TourDetailPage from './page';

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

// Fixture tối thiểu cho trang tour; chỉ các trường trang đọc. Không dùng dữ liệu thật.
function tourWithDetails(details: Record<string, unknown> | null): TourDetail {
  return {
    id: 't1',
    name: 'Tour synthetic',
    slug: 'tour-synthetic',
    category_slug: 'tour',
    description: null,
    media: [],
    prices: [],
    contacts: [],
    faqs: [],
    price_range: null,
    opening_hours: null,
    location: { lat: 10, lng: 104 },
    trust_sources: [],
    tour_details: details,
    amenities: [],
  } as unknown as TourDetail;
}

async function renderTour(details: Record<string, unknown> | null) {
  mockGetTour.mockResolvedValue(tourWithDetails(details));
  mockGetItinerary.mockResolvedValue([]);
  mockGetSchedule.mockResolvedValue([]);
  const element = await TourDetailPage({ params: Promise.resolve({ slug: 'tour-synthetic', locale: 'vi' }) });
  return render(element);
}

afterEach(() => jest.clearAllMocks());

describe('TourDetailPage — Thông tin tour (chi tiết admin nhập)', () => {
  it('hiện đúng các trường đã có: loại, thời lượng, độ khó, điểm đón, bao gồm, không bao gồm, hủy', async () => {
    await renderTour({
      tour_type: 'diving',
      duration_minutes: 180,
      difficulty: 'easy',
      pickup_point: 'Cổng khách sạn synthetic',
      inclusions: 'Vé lặn synthetic',
      exclusions: 'Ăn trưa synthetic',
      cancellation_policy: 'Hủy trước 24h synthetic',
    });
    expect(screen.getByRole('heading', { name: 'Thông tin tour' })).toBeInTheDocument();
    expect(screen.getByText('Lặn')).toBeInTheDocument();
    expect(screen.getByText('180 phút')).toBeInTheDocument();
    expect(screen.getByText('Dễ')).toBeInTheDocument();
    expect(screen.getByText('Cổng khách sạn synthetic')).toBeInTheDocument();
    expect(screen.getByText('Ăn trưa synthetic')).toBeInTheDocument();
    expect(screen.getByText('Hủy trước 24h synthetic')).toBeInTheDocument();
  });

  it('thiếu dữ liệu → không hiện dòng đó; thời lượng null không thành "0 phút"; không có chữ miễn phí/đang mở', async () => {
    await renderTour({
      tour_type: 'trekking',
      duration_minutes: null,
      difficulty: null,
      pickup_point: null,
      inclusions: null,
      exclusions: null,
      cancellation_policy: null,
    });
    expect(screen.getByText('Đi bộ/trekking')).toBeInTheDocument();
    expect(screen.queryByText('Thời lượng')).toBeNull();
    expect(screen.queryByText('Điểm đón khách')).toBeNull();
    expect(screen.queryByText(/0 phút/)).toBeNull();
    expect(screen.queryByText(/miễn phí|đang mở/i)).toBeNull();
  });

  it('không có chi tiết (null) → không có mục Thông tin tour', async () => {
    await renderTour(null);
    expect(screen.queryByRole('heading', { name: 'Thông tin tour' })).toBeNull();
  });
});
