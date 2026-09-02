/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { HotelCard } from './HotelCard';
import type { HotelCard as HotelCardType } from './types';

const BASE_HOTEL: HotelCardType = {
  id: 'h1',
  name: 'Salinda Resort',
  slug: 'salinda-resort',
  short_description: null,
  cover_image_url: null,
  rating_avg: null,
  rating_count: 0,
  star_rating: null,
  hotel_type: 'resort',
  location: { lat: 10.0, lng: 104.0 },
};

describe('HotelCard', () => {
  it('links to /hotels/{slug}', () => {
    render(<HotelCard hotel={BASE_HOTEL} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/vi/hotels/salinda-resort');
  });

  it('renders the fallback initial when there is no cover image', () => {
    render(<HotelCard hotel={BASE_HOTEL} />);
    expect(screen.getByText('S')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders the cover image instead of the fallback when present', () => {
    render(<HotelCard hotel={{ ...BASE_HOTEL, cover_image_url: 'https://cdn.example/salinda.jpg' }} />);
    const img = screen.getByRole('img', { name: 'Salinda Resort' });
    expect(img).toHaveAttribute('src', 'https://cdn.example/salinda.jpg');
    expect(screen.queryByText('S')).not.toBeInTheDocument();
  });

  it('omits rating, star rating, and description when absent', () => {
    render(<HotelCard hotel={BASE_HOTEL} />);
    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
    expect(screen.queryByText(/sao$/)).not.toBeInTheDocument();
  });

  it('renders rating with a count suffix when rating_count > 0', () => {
    render(<HotelCard hotel={{ ...BASE_HOTEL, rating_avg: 4.7, rating_count: 30 }} />);
    expect(screen.getByText('★ 4.7 (30)')).toBeInTheDocument();
  });

  it('renders rating without a count suffix when rating_count is zero', () => {
    render(<HotelCard hotel={{ ...BASE_HOTEL, rating_avg: 4.7, rating_count: 0 }} />);
    expect(screen.getByText('★ 4.7')).toBeInTheDocument();
  });

  it('renders the star rating as repeated ★ characters with an aria-label, only when present', () => {
    render(<HotelCard hotel={{ ...BASE_HOTEL, star_rating: 3 }} />);
    const stars = screen.getByLabelText('3 sao');
    expect(stars).toHaveTextContent('★★★');
  });

  it('translates a known hotel_type via the label map', () => {
    render(<HotelCard hotel={{ ...BASE_HOTEL, hotel_type: 'homestay' }} />);
    expect(screen.getByText('Homestay')).toBeInTheDocument();
  });

  it('falls back to the raw hotel_type string for an unrecognized value (does not hide unknown types)', () => {
    render(<HotelCard hotel={{ ...BASE_HOTEL, hotel_type: 'houseboat' }} />);
    expect(screen.getByText('houseboat')).toBeInTheDocument();
  });

  it('renders short_description only when present', () => {
    render(<HotelCard hotel={{ ...BASE_HOTEL, short_description: 'Resort 5 sao view biển' }} />);
    expect(screen.getByText('Resort 5 sao view biển')).toBeInTheDocument();
  });
});
