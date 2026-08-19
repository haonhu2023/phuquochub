/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { AttractionCard } from './AttractionCard';
import type { AttractionCard as AttractionCardType } from './types';

const BASE_ATTRACTION: AttractionCardType = {
  id: 'a1',
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

describe('AttractionCard', () => {
  it('links to the shared place detail page, not a dedicated attraction page', () => {
    render(<AttractionCard attraction={BASE_ATTRACTION} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/places/bai-sao');
  });

  it('renders the fallback initial when there is no cover image', () => {
    render(<AttractionCard attraction={BASE_ATTRACTION} />);
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders the cover image instead of the fallback when present', () => {
    render(
      <AttractionCard
        attraction={{ ...BASE_ATTRACTION, cover_image_url: 'https://cdn.example/bai-sao.jpg' }}
      />,
    );
    const img = screen.getByRole('img', { name: 'Bãi Sao' });
    expect(img).toHaveAttribute('src', 'https://cdn.example/bai-sao.jpg');
    expect(screen.queryByText('B')).not.toBeInTheDocument();
  });

  it('omits optional fields that are null/empty', () => {
    render(<AttractionCard attraction={BASE_ATTRACTION} />);
    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
    expect(screen.queryByText('Đã xác minh')).not.toBeInTheDocument();
  });

  it('renders rating with count when rating_avg is present', () => {
    render(
      <AttractionCard attraction={{ ...BASE_ATTRACTION, rating_avg: 4.5, rating_count: 12 }} />,
    );
    expect(screen.getByText('★ 4.5 (12)')).toBeInTheDocument();
  });

  it('renders rating without a count suffix when rating_count is zero', () => {
    render(
      <AttractionCard attraction={{ ...BASE_ATTRACTION, rating_avg: 4.5, rating_count: 0 }} />,
    );
    expect(screen.getByText('★ 4.5')).toBeInTheDocument();
  });

  it('renders the verified badge only when verification_status is verified', () => {
    render(
      <AttractionCard attraction={{ ...BASE_ATTRACTION, verification_status: 'verified' }} />,
    );
    expect(screen.getByText('Đã xác minh')).toBeInTheDocument();
  });

  // Place Trust & Freshness Surface (2026-08-19): 'official'/'community_verified' cũng là trạng
  // thái TIN CẬY (verification.transition.ts isTrustedStatus()), phải cùng hiện badge.
  it.each(['official', 'community_verified'] as const)(
    'renders the verified badge for the "%s" trusted status too',
    (status) => {
      render(<AttractionCard attraction={{ ...BASE_ATTRACTION, verification_status: status }} />);
      expect(screen.getByText('Đã xác minh')).toBeInTheDocument();
    },
  );

  it.each(['expired', 'rejected', 'pending'] as const)(
    'does NOT render a verified badge for "%s" (not currently trusted)',
    (status) => {
      render(<AttractionCard attraction={{ ...BASE_ATTRACTION, verification_status: status }} />);
      expect(screen.queryByText('Đã xác minh')).not.toBeInTheDocument();
    },
  );

  it('renders a localized price label for a known price_range', () => {
    render(<AttractionCard attraction={{ ...BASE_ATTRACTION, price_range: 'mid' }} />);
    expect(screen.getByText('Tầm trung')).toBeInTheDocument();
  });

  it('renders ward and short_description when present', () => {
    render(
      <AttractionCard
        attraction={{
          ...BASE_ATTRACTION,
          ward: 'Dương Đông',
          short_description: 'Bãi biển đẹp nhất Phú Quốc',
        }}
      />,
    );
    expect(screen.getByText('Dương Đông')).toBeInTheDocument();
    expect(screen.getByText('Bãi biển đẹp nhất Phú Quốc')).toBeInTheDocument();
  });
});
