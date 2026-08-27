/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { TourCard } from './TourCard';
import type { TourCard as TourCardType } from './types';
import { PRICE_VERIFYING_TEXT } from '@/modules/places/trust';

const BASE_TOUR: TourCardType = {
  id: 't1',
  name: 'Lặn ngắm san hô An Thới',
  slug: 'lan-ngam-san-ho-an-thoi',
  short_description: null,
  cover_image_url: null,
  rating_avg: null,
  rating_count: 0,
  price_range: null,
  verification_status: 'pending',
  ward: null,
  tour_type: 'diving',
  duration_minutes: null,
  difficulty: null,
  location: { lat: 10.0, lng: 104.0 },
};

describe('TourCard', () => {
  it('links to /tours/{slug}', () => {
    render(<TourCard tour={BASE_TOUR} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/tours/lan-ngam-san-ho-an-thoi');
  });

  it('renders the fallback initial when there is no cover image', () => {
    render(<TourCard tour={BASE_TOUR} />);
    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('omits departure ward, duration, price, and difficulty when absent (but still shows the tour type)', () => {
    render(<TourCard tour={BASE_TOUR} />);
    expect(screen.queryByText(/Khởi hành:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/⏱/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Độ khó:/)).not.toBeInTheDocument();
    expect(screen.getByText('Lặn biển')).toBeInTheDocument(); // tour_type always has a label
  });

  it('renders the departure ward line only when ward is present', () => {
    render(<TourCard tour={{ ...BASE_TOUR, ward: 'An Thới' }} />);
    expect(screen.getByText('Khởi hành: An Thới')).toBeInTheDocument();
  });

  it('formats duration_minutes into a Vietnamese label, and hides it for a non-positive/invalid value', () => {
    const { rerender } = render(<TourCard tour={{ ...BASE_TOUR, duration_minutes: 270 }} />);
    expect(screen.getByText('⏱ 4 giờ 30 phút')).toBeInTheDocument();

    rerender(<TourCard tour={{ ...BASE_TOUR, duration_minutes: 0 }} />);
    expect(screen.queryByText(/⏱/)).not.toBeInTheDocument();
  });

  it('falls back to the raw tour_type string for an unrecognized value', () => {
    render(<TourCard tour={{ ...BASE_TOUR, tour_type: 'kayaking' }} />);
    expect(screen.getByText('kayaking')).toBeInTheDocument();
  });

  it('renders the difficulty label only when present', () => {
    render(<TourCard tour={{ ...BASE_TOUR, difficulty: 'hard' }} />);
    expect(screen.getByText('Độ khó: Khó')).toBeInTheDocument();
  });

  it('renders a localized price label for a known price_range', () => {
    render(<TourCard tour={{ ...BASE_TOUR, price_range: 'mid', verification_status: 'verified' }} />);
    expect(screen.getByText('Tầm trung')).toBeInTheDocument();
  });

  // Public Beta price trust gate (2026-08-28): raw price of an unverified tour must never render
  // — TourCard previously had no verification_status field at all and showed price unconditionally.
  describe('price trust gate', () => {
    it('pending + có giá → KHÔNG hiện giá thật, hiện "Giá đang được xác minh"', () => {
      render(<TourCard tour={{ ...BASE_TOUR, verification_status: 'pending', price_range: 'low' }} />);
      expect(screen.queryByText('Bình dân')).not.toBeInTheDocument();
      expect(screen.getByText(PRICE_VERIFYING_TEXT)).toBeInTheDocument();
    });

    it('expired + có giá → vẫn ẩn giá thật', () => {
      render(<TourCard tour={{ ...BASE_TOUR, verification_status: 'expired', price_range: 'high' }} />);
      expect(screen.queryByText('Cao cấp')).not.toBeInTheDocument();
      expect(screen.getByText(PRICE_VERIFYING_TEXT)).toBeInTheDocument();
    });

    it('pending KHÔNG có giá → không hiện giá thật lẫn dòng đang xác minh', () => {
      render(<TourCard tour={{ ...BASE_TOUR, verification_status: 'pending', price_range: null }} />);
      expect(screen.queryByText(PRICE_VERIFYING_TEXT)).not.toBeInTheDocument();
    });
  });

  it('renders rating with a count suffix when rating_count > 0, without one when zero', () => {
    const { rerender } = render(<TourCard tour={{ ...BASE_TOUR, rating_avg: 4.9, rating_count: 15 }} />);
    expect(screen.getByText('★ 4.9 (15)')).toBeInTheDocument();

    rerender(<TourCard tour={{ ...BASE_TOUR, rating_avg: 4.9, rating_count: 0 }} />);
    expect(screen.getByText('★ 4.9')).toBeInTheDocument();
  });
});
