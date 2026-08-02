/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { TourCard } from './TourCard';
import type { TourCard as TourCardType } from './types';

const BASE_TOUR: TourCardType = {
  id: 't1',
  name: 'Lặn ngắm san hô An Thới',
  slug: 'lan-ngam-san-ho-an-thoi',
  short_description: null,
  cover_image_url: null,
  rating_avg: null,
  rating_count: 0,
  price_range: null,
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
    render(<TourCard tour={{ ...BASE_TOUR, price_range: 'mid' }} />);
    expect(screen.getByText('Tầm trung')).toBeInTheDocument();
  });

  it('renders rating with a count suffix when rating_count > 0, without one when zero', () => {
    const { rerender } = render(<TourCard tour={{ ...BASE_TOUR, rating_avg: 4.9, rating_count: 15 }} />);
    expect(screen.getByText('★ 4.9 (15)')).toBeInTheDocument();

    rerender(<TourCard tour={{ ...BASE_TOUR, rating_avg: 4.9, rating_count: 0 }} />);
    expect(screen.getByText('★ 4.9')).toBeInTheDocument();
  });
});
