/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { PlaceCard } from './PlaceCard';
import type { PlaceCard as PlaceCardType } from './types';

const BASE_PLACE: PlaceCardType = {
  id: 'p1',
  name: 'Dinh Cậu',
  slug: 'dinh-cau',
  category_id: 'c1',
  short_description: null,
  price_range: null,
  cover_image_url: null,
  rating_avg: null,
  rating_count: 0,
  verification_status: 'pending',
  status: 'published',
  location: { lat: 10.0, lng: 104.0 },
};

describe('PlaceCard', () => {
  it('links to /places/{slug}', () => {
    render(<PlaceCard place={BASE_PLACE} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/places/dinh-cau');
  });

  it('renders the fallback initial when there is no cover image', () => {
    render(<PlaceCard place={BASE_PLACE} />);
    expect(screen.getByText('D')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('omits price, distance, verified badge, and rating when absent', () => {
    render(<PlaceCard place={BASE_PLACE} />);
    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
    expect(screen.queryByText('Đã xác minh')).not.toBeInTheDocument();
    expect(screen.queryByText(/\bkm\b|\bm\b/)).not.toBeInTheDocument();
  });

  it('formats distance_m in meters when under 1000, only shown when the field is present (nearby-search-only)', () => {
    render(<PlaceCard place={{ ...BASE_PLACE, distance_m: 350 }} />);
    expect(screen.getByText('350 m')).toBeInTheDocument();
  });

  it('formats distance_m in kilometers (1 decimal) when 1000 or above', () => {
    render(<PlaceCard place={{ ...BASE_PLACE, distance_m: 2450 }} />);
    expect(screen.getByText('2.5 km')).toBeInTheDocument();
  });

  it('renders the verified badge only when verification_status is "verified"', () => {
    render(<PlaceCard place={{ ...BASE_PLACE, verification_status: 'verified' }} />);
    expect(screen.getByText('Đã xác minh')).toBeInTheDocument();
  });

  it('renders a localized price label for a known price_range', () => {
    render(<PlaceCard place={{ ...BASE_PLACE, price_range: 'low' }} />);
    expect(screen.getByText('Bình dân')).toBeInTheDocument();
  });

  it('renders rating with a count suffix when rating_count > 0, without one when zero', () => {
    const { rerender } = render(<PlaceCard place={{ ...BASE_PLACE, rating_avg: 4.3, rating_count: 11 }} />);
    expect(screen.getByText('★ 4.3 (11)')).toBeInTheDocument();

    rerender(<PlaceCard place={{ ...BASE_PLACE, rating_avg: 4.3, rating_count: 0 }} />);
    expect(screen.getByText('★ 4.3')).toBeInTheDocument();
  });
});

// `titleAs` — nơi gọi đặt tên địa điểm đúng bậc tiêu đề của trang đó (trang chủ gom thẻ dưới một
// h2 nên cần h3). Mặc định phải GIỮ NGUYÊN h2 để không đổi hành vi các trang danh sách hiện có.
describe('PlaceCard — bậc tiêu đề', () => {
  it('mặc định render h2 (hành vi cũ của mọi nơi gọi hiện có)', () => {
    render(<PlaceCard place={BASE_PLACE} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Dinh Cậu' })).toBeInTheDocument();
  });

  it('titleAs="h3" render h3', () => {
    render(<PlaceCard place={BASE_PLACE} titleAs="h3" />);
    expect(screen.getByRole('heading', { level: 3, name: 'Dinh Cậu' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });
});
