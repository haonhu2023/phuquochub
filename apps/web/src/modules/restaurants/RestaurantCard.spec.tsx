/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { RestaurantCard } from './RestaurantCard';
import type { RestaurantCard as RestaurantCardType } from './types';
import { PRICE_VERIFYING_TEXT } from '@/modules/places/trust';

const BASE_RESTAURANT: RestaurantCardType = {
  id: 'r1',
  name: 'Quán Hải Sản Biển Xanh',
  slug: 'quan-hai-san-bien-xanh',
  short_description: null,
  cover_image_url: null,
  rating_avg: null,
  rating_count: 0,
  price_range: null,
  verification_status: 'pending',
  is_local_specialty: false,
  cuisines: [],
  location: { lat: 10.0, lng: 104.0 },
};

describe('RestaurantCard', () => {
  it('links to /restaurants/{slug}', () => {
    render(<RestaurantCard restaurant={BASE_RESTAURANT} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/restaurants/quan-hai-san-bien-xanh');
  });

  it('renders the fallback initial when there is no cover image', () => {
    render(<RestaurantCard restaurant={BASE_RESTAURANT} />);
    expect(screen.getByText('Q')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('omits price, specialty badge, and rating when absent/empty/false', () => {
    render(<RestaurantCard restaurant={BASE_RESTAURANT} />);
    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
    expect(screen.queryByText('Đặc sản địa phương')).not.toBeInTheDocument();
  });

  it('renders cuisines joined with " · " only when the array is non-empty', () => {
    render(<RestaurantCard restaurant={{ ...BASE_RESTAURANT, cuisines: ['Hải sản', 'Nướng'] }} />);
    expect(screen.getByText('Hải sản · Nướng')).toBeInTheDocument();
  });

  it('renders a localized price label for a known price_range', () => {
    render(
      <RestaurantCard restaurant={{ ...BASE_RESTAURANT, price_range: 'high', verification_status: 'verified' }} />,
    );
    expect(screen.getByText('Cao cấp')).toBeInTheDocument();
  });

  // Public Beta price trust gate (2026-08-28): raw price of an unverified restaurant must never
  // render — RestaurantCard previously had no verification_status field at all and showed price
  // unconditionally.
  describe('price trust gate', () => {
    it('pending + có giá → KHÔNG hiện giá thật, hiện "Giá đang được xác minh"', () => {
      render(<RestaurantCard restaurant={{ ...BASE_RESTAURANT, verification_status: 'pending', price_range: 'high' }} />);
      expect(screen.queryByText('Cao cấp')).not.toBeInTheDocument();
      expect(screen.getByText(PRICE_VERIFYING_TEXT)).toBeInTheDocument();
    });

    it('rejected + có giá → vẫn ẩn giá thật', () => {
      render(<RestaurantCard restaurant={{ ...BASE_RESTAURANT, verification_status: 'rejected', price_range: 'mid' }} />);
      expect(screen.queryByText('Tầm trung')).not.toBeInTheDocument();
      expect(screen.getByText(PRICE_VERIFYING_TEXT)).toBeInTheDocument();
    });

    it('pending KHÔNG có giá → không hiện giá thật lẫn dòng đang xác minh', () => {
      render(<RestaurantCard restaurant={{ ...BASE_RESTAURANT, verification_status: 'pending', price_range: null }} />);
      expect(screen.queryByText(PRICE_VERIFYING_TEXT)).not.toBeInTheDocument();
    });
  });

  it('renders the local-specialty badge only when is_local_specialty is true', () => {
    render(<RestaurantCard restaurant={{ ...BASE_RESTAURANT, is_local_specialty: true }} />);
    expect(screen.getByText('Đặc sản địa phương')).toBeInTheDocument();
  });

  it('renders rating with a count suffix when rating_count > 0, without one when zero', () => {
    const { rerender } = render(
      <RestaurantCard restaurant={{ ...BASE_RESTAURANT, rating_avg: 4.2, rating_count: 8 }} />,
    );
    expect(screen.getByText('★ 4.2 (8)')).toBeInTheDocument();

    rerender(<RestaurantCard restaurant={{ ...BASE_RESTAURANT, rating_avg: 4.2, rating_count: 0 }} />);
    expect(screen.getByText('★ 4.2')).toBeInTheDocument();
  });
});
