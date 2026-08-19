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

  // Owner Cover & Photo Ordering (2026-08-12): ảnh bìa do chủ cơ sở chọn được API phát ra dưới
  // dạng URL API ỔN ĐỊNH `/media/{id}/file` (không phải presigned URL, không phải địa chỉ MinIO —
  // xem core/media-url/cover-image.ts). Thẻ chỉ việc render đúng giá trị đó.
  it('renders the canonical cover image URL served by the API', () => {
    const coverUrl = 'https://api.example/api/media/11111111-1111-4111-8111-111111111111/file';
    render(<PlaceCard place={{ ...BASE_PLACE, cover_image_url: coverUrl }} />);

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', coverUrl);
    expect(img).toHaveAttribute('alt', 'Dinh Cậu');
    expect(img.getAttribute('src')).not.toContain('X-Amz-Signature');
    expect(img.getAttribute('src')).not.toContain(':9000');
    // Có ảnh bìa thì KHÔNG hiện chữ cái dự phòng nữa.
    expect(screen.queryByText('D')).not.toBeInTheDocument();
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

  // Place Trust & Freshness Surface (2026-08-19): trước đó thẻ chỉ nhận diện đúng chuỗi
  // 'verified', bỏ sót 'official'/'community_verified' — cả ba đều là trạng thái TIN CẬY
  // (verification.transition.ts isTrustedStatus()) và phải cùng hiện badge.
  it.each(['official', 'community_verified'] as const)(
    'renders the verified badge for the "%s" trusted status too',
    (status) => {
      render(<PlaceCard place={{ ...BASE_PLACE, verification_status: status }} />);
      expect(screen.getByText('Đã xác minh')).toBeInTheDocument();
    },
  );

  it.each(['expired', 'rejected', 'pending'] as const)(
    'does NOT render a verified badge for "%s" (not currently trusted)',
    (status) => {
      render(<PlaceCard place={{ ...BASE_PLACE, verification_status: status }} />);
      expect(screen.queryByText('Đã xác minh')).not.toBeInTheDocument();
    },
  );

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
