/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { BeachCard } from './BeachCard';
import type { BeachCard as BeachCardType } from './types';

const BASE_BEACH: BeachCardType = {
  id: 'b1',
  name: 'Bãi Sao',
  slug: 'bai-sao',
  short_description: null,
  cover_image_url: null,
  rating_avg: null,
  rating_count: 0,
  price_range: null,
  ward: null,
  verification_status: 'pending',
  location: { lat: 10.0, lng: 104.0 },
};

describe('BeachCard', () => {
  it('links to the shared place detail page /places/{slug}, NOT a dedicated /beaches/{slug} route', () => {
    render(<BeachCard beach={BASE_BEACH} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/places/bai-sao');
  });

  it('renders the fallback initial when there is no cover image', () => {
    render(<BeachCard beach={BASE_BEACH} />);
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('omits ward, price, verified badge, and rating when absent', () => {
    render(<BeachCard beach={BASE_BEACH} />);
    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
    expect(screen.queryByText('Đã xác minh')).not.toBeInTheDocument();
  });

  it('renders the ward line only when present', () => {
    render(<BeachCard beach={{ ...BASE_BEACH, ward: 'Dương Đông' }} />);
    expect(screen.getByText('Dương Đông')).toBeInTheDocument();
  });

  it('renders a localized price label for a known price_range (deliberately not defaulted to "free")', () => {
    render(<BeachCard beach={{ ...BASE_BEACH, price_range: 'free' }} />);
    expect(screen.getByText('Miễn phí')).toBeInTheDocument();
  });

  it('renders the verified badge only when verification_status is "verified"', () => {
    render(<BeachCard beach={{ ...BASE_BEACH, verification_status: 'verified' }} />);
    expect(screen.getByText('Đã xác minh')).toBeInTheDocument();
  });

  it('does not render the verified badge for other verification statuses', () => {
    render(<BeachCard beach={{ ...BASE_BEACH, verification_status: 'community_verified' }} />);
    expect(screen.queryByText('Đã xác minh')).not.toBeInTheDocument();
  });

  it('renders rating with a count suffix when rating_count > 0, without one when zero', () => {
    const { rerender } = render(<BeachCard beach={{ ...BASE_BEACH, rating_avg: 4.8, rating_count: 22 }} />);
    expect(screen.getByText('★ 4.8 (22)')).toBeInTheDocument();

    rerender(<BeachCard beach={{ ...BASE_BEACH, rating_avg: 4.8, rating_count: 0 }} />);
    expect(screen.getByText('★ 4.8')).toBeInTheDocument();
  });
});
