/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import type { PlaceDetail } from '@/modules/places/types';
import { getPlace } from '@/modules/places/api/places.api';
import { listReviews } from '@/modules/reviews/api/reviews.api';
import { PENDING_DISCLOSURE_TEXT, PRICE_VERIFYING_TEXT, TRUST_BADGE_LABEL } from '@/modules/places/trust';
import PlaceDetailPage from './page';

jest.mock('@/modules/places/api/places.api', () => ({ getPlace: jest.fn() }));
jest.mock('@/modules/reviews/api/reviews.api', () => ({ listReviews: jest.fn() }));
// ReviewsSection cần AuthProvider context (useAuth) — không liên quan tới hành vi được test ở
// đây (disclosure/giá), mock để tách rời, cùng cách DiscoverPlaces.spec.tsx mock next/link.
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

const mockGetPlace = getPlace as jest.Mock;
const mockListReviews = listReviews as jest.Mock;

function place(overrides: Partial<PlaceDetail> = {}): PlaceDetail {
  return {
    id: 'p1',
    name: 'Bãi Sao',
    slug: 'bai-sao',
    category_id: 'c1',
    category_slug: 'beach',
    short_description: 'Bãi biển cát trắng',
    price_range: null,
    cover_image_url: null,
    rating_avg: null,
    rating_count: 0,
    verification_status: 'pending',
    status: 'published',
    location: { lat: 10.0466, lng: 104.0281 },
    address: null,
    ward: 'An Thới',
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
    ...overrides,
  };
}

async function renderPage(p: PlaceDetail) {
  mockGetPlace.mockResolvedValueOnce(p);
  mockListReviews.mockResolvedValueOnce([]);
  render(await PlaceDetailPage({ params: Promise.resolve({ slug: p.slug }) }));
}

describe('PlaceDetailPage — Public Beta trust disclosure', () => {
  describe('pending disclosure', () => {
    it('place pending → hiển thị đúng câu "Thông tin đang được xác minh"', async () => {
      await renderPage(place({ verification_status: 'pending' }));
      expect(screen.getByText(PENDING_DISCLOSURE_TEXT)).toBeInTheDocument();
    });

    it('place verified → KHÔNG hiển thị câu pending, giữ nguyên badge trusted', async () => {
      await renderPage(place({ verification_status: 'verified' }));
      expect(screen.queryByText(PENDING_DISCLOSURE_TEXT)).not.toBeInTheDocument();
      expect(screen.getByText(TRUST_BADGE_LABEL.verified)).toBeInTheDocument();
    });

    // rejected KHÔNG bị gán nhãn pending — vẫn là câu giải thích cũ, một trạng thái thật khác.
    it('place rejected → KHÔNG hiển thị câu pending (giữ câu "Chưa xác minh" cũ)', async () => {
      await renderPage(place({ verification_status: 'rejected' }));
      expect(screen.queryByText(PENDING_DISCLOSURE_TEXT)).not.toBeInTheDocument();
      expect(screen.getByText(/Chưa xác minh — thông tin do cộng đồng đóng góp\./)).toBeInTheDocument();
    });
  });

  describe('unverified commercial price suppression', () => {
    it('hotel pending có price_range → KHÔNG hiện giá thật, hiện "Giá đang được xác minh"', async () => {
      await renderPage(
        place({ category_slug: 'hotel', verification_status: 'pending', price_range: 'high' }),
      );
      expect(screen.queryByText('Cao cấp')).not.toBeInTheDocument();
      expect(screen.getByText(PRICE_VERIFYING_TEXT)).toBeInTheDocument();
    });

    it('restaurant chưa xác minh (rejected) có price_range → vẫn ẩn giá thật', async () => {
      await renderPage(
        place({ category_slug: 'restaurant', verification_status: 'rejected', price_range: 'mid' }),
      );
      expect(screen.queryByText('Tầm trung')).not.toBeInTheDocument();
      expect(screen.getByText(PRICE_VERIFYING_TEXT)).toBeInTheDocument();
    });

    it('tour đã verified có price_range → VẪN hiện giá thật (trusted commercial giữ nguyên)', async () => {
      await renderPage(
        place({ category_slug: 'tour', verification_status: 'verified', price_range: 'low' }),
      );
      expect(screen.getByText('Bình dân')).toBeInTheDocument();
      expect(screen.queryByText(PRICE_VERIFYING_TEXT)).not.toBeInTheDocument();
    });

    // Không bịa dòng "đang xác minh" cho một trường CHƯA TỪNG có giá trị.
    it('hotel pending KHÔNG có price_range (null) → không hiện giá thật lẫn dòng "đang xác minh"', async () => {
      await renderPage(place({ category_slug: 'hotel', verification_status: 'pending', price_range: null }));
      expect(screen.queryByText(PRICE_VERIFYING_TEXT)).not.toBeInTheDocument();
      expect(screen.queryByText('Mức giá')).not.toBeInTheDocument();
    });

    // Public Beta price trust gate (2026-08-28): KHÔNG phụ thuộc category — một beach/attraction/
    // market pending phải ẩn giá thật giống hệt hotel/restaurant/tour pending. Bản trước của gate
    // này chỉ ẩn giá cho category "thương mại", để lộ giá thật của beach/attraction/market — đây
    // là lỗi đã được sửa, giữ test lại (đảo ngược assertion) để khoá hành vi ĐÚNG.
    it('beach pending có price_range → VẪN ẩn giá thật (gate không phụ thuộc category)', async () => {
      await renderPage(place({ category_slug: 'beach', verification_status: 'pending', price_range: 'free' }));
      expect(screen.queryByText('Miễn phí')).not.toBeInTheDocument();
      expect(screen.getByText(PRICE_VERIFYING_TEXT)).toBeInTheDocument();
    });

    it('attraction pending có price_range → VẪN ẩn giá thật (gate không phụ thuộc category)', async () => {
      await renderPage(
        place({ category_slug: 'attraction', verification_status: 'pending', price_range: 'mid' }),
      );
      expect(screen.queryByText('Tầm trung')).not.toBeInTheDocument();
      expect(screen.getByText(PRICE_VERIFYING_TEXT)).toBeInTheDocument();
    });

    it('beach verified có price_range → giá thật hiện bình thường (trusted, bất kể category)', async () => {
      await renderPage(
        place({ category_slug: 'beach', verification_status: 'verified', price_range: 'free' }),
      );
      expect(screen.getByText('Miễn phí')).toBeInTheDocument();
      expect(screen.queryByText(PRICE_VERIFYING_TEXT)).not.toBeInTheDocument();
    });
  });

  // Public Beta price trust gate — "Giá dịch vụ" / PlacePrice[] (2026-08-28): mỗi dòng giá mang
  // verification_status RIÊNG của chính bản ghi đó (price_history), khác hẳn place.verification_status
  // ở trên. Trước fix này, mục "Giá dịch vụ" hiện MỌI dòng bất kể trust — kể cả khi place ở trạng
  // thái 'verified'. Dùng amount=987654 làm sentinel dễ nhận diện để khoá việc rò rỉ.
  describe('PlacePrice[] ("Giá dịch vụ") trust gate', () => {
    const SENTINEL_AMOUNT = 987654;

    it('price pending → KHÔNG hiện giá trị thật (sentinel), hiện dòng đang xác minh dùng chung', async () => {
      await renderPage(
        place({
          verification_status: 'verified', // place chính nó ĐÃ tin cậy — không được dùng làm proxy
          prices: [
            {
              id: 'pr1',
              service_name: 'Vé vào cổng',
              amount: SENTINEL_AMOUNT,
              currency: 'VND',
              unit: null,
              is_free: false,
              valid_from: null,
              valid_to: null,
              verification_status: 'pending',
            },
          ],
        }),
      );
      expect(document.body.textContent).not.toContain(String(SENTINEL_AMOUNT));
      expect(document.body.textContent).not.toContain(SENTINEL_AMOUNT.toLocaleString('vi-VN'));
      expect(screen.getByText(PRICE_VERIFYING_TEXT)).toBeInTheDocument();
    });

    it.each(['expired', 'rejected'] as const)('price %s → vẫn ẩn giá trị thật (sentinel)', async (status) => {
      await renderPage(
        place({
          prices: [
            {
              id: 'pr2',
              service_name: 'Thuê ghế',
              amount: SENTINEL_AMOUNT,
              currency: 'VND',
              unit: null,
              is_free: false,
              valid_from: null,
              valid_to: null,
              verification_status: status,
            },
          ],
        }),
      );
      expect(document.body.textContent).not.toContain(String(SENTINEL_AMOUNT));
      expect(document.body.textContent).not.toContain(SENTINEL_AMOUNT.toLocaleString('vi-VN'));
      expect(screen.getByText(PRICE_VERIFYING_TEXT)).toBeInTheDocument();
    });

    it.each(['verified', 'official', 'community_verified'] as const)(
      'price %s → hiện giá trị thật, không hiện dòng đang xác minh',
      async (status) => {
        await renderPage(
          place({
            prices: [
              {
                id: 'pr3',
                service_name: 'Vé vào cổng',
                amount: SENTINEL_AMOUNT,
                currency: 'VND',
                unit: null,
                is_free: false,
                valid_from: null,
                valid_to: null,
                verification_status: status,
              },
            ],
          }),
        );
        expect(screen.getByText(`${SENTINEL_AMOUNT.toLocaleString('vi-VN')} VND`)).toBeInTheDocument();
        expect(screen.queryByText(PRICE_VERIFYING_TEXT)).not.toBeInTheDocument();
      },
    );

    it('không có PlacePrice nào → không render mục "Giá dịch vụ" lẫn dòng đang xác minh', async () => {
      await renderPage(place({ prices: [] }));
      expect(screen.queryByText('Giá dịch vụ')).not.toBeInTheDocument();
      expect(screen.queryByText(PRICE_VERIFYING_TEXT)).not.toBeInTheDocument();
    });

    it('trộn trusted + untrusted → CHỈ dòng trusted hiện giá thật, MỘT dòng đang xác minh dùng chung (không lặp)', async () => {
      await renderPage(
        place({
          prices: [
            {
              id: 'pr-trusted',
              service_name: 'Vé người lớn',
              amount: 150000,
              currency: 'VND',
              unit: null,
              is_free: false,
              valid_from: null,
              valid_to: null,
              verification_status: 'verified',
            },
            {
              id: 'pr-untrusted-1',
              service_name: 'Vé trẻ em',
              amount: SENTINEL_AMOUNT,
              currency: 'VND',
              unit: null,
              is_free: false,
              valid_from: null,
              valid_to: null,
              verification_status: 'pending',
            },
            {
              id: 'pr-untrusted-2',
              service_name: 'Thuê phao',
              amount: SENTINEL_AMOUNT + 1,
              currency: 'VND',
              unit: null,
              is_free: false,
              valid_from: null,
              valid_to: null,
              verification_status: 'rejected',
            },
          ],
        }),
      );
      expect(screen.getByText('150.000 VND')).toBeInTheDocument();
      expect(document.body.textContent).not.toContain(String(SENTINEL_AMOUNT));
      expect(document.body.textContent).not.toContain(SENTINEL_AMOUNT.toLocaleString('vi-VN'));
      expect(document.body.textContent).not.toContain(String(SENTINEL_AMOUNT + 1));
      expect(document.body.textContent).not.toContain((SENTINEL_AMOUNT + 1).toLocaleString('vi-VN'));
      expect(screen.getAllByText(PRICE_VERIFYING_TEXT)).toHaveLength(1);
    });
  });
});
