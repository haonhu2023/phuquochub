/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import type { PlaceDetail } from '@/modules/places/types';
import { getPlace } from '@/modules/places/api/places.api';
import { listReviews } from '@/modules/reviews/api/reviews.api';
import { PENDING_DISCLOSURE_TEXT, PRICE_VERIFYING_TEXT, TRUST_BADGE_LABEL } from '@/modules/places/trust';
import PlaceDetailPage, { generateMetadata } from './page';

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
    content_version: 1,
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
    en_display_name_approved: false,
    en_short_description_approved: false,
    ...overrides,
  };
}

async function renderPage(p: PlaceDetail) {
  mockGetPlace.mockResolvedValueOnce(p);
  mockListReviews.mockResolvedValueOnce([]);
  render(await PlaceDetailPage({ params: Promise.resolve({ slug: p.slug, locale: 'vi' }) }));
}

// 2026-09-17 (real-data pass): gallery được tách ra `PlaceGallery` (dùng chung với
// hotels/restaurants/tours) — test lại HÀNH VI render, không phải chi tiết cài đặt, để đảm bảo
// refactor không lặng lẽ làm mất gallery khỏi trang này.
describe('PlaceDetailPage — gallery ảnh công khai (dùng chung PlaceGallery)', () => {
  it('có media đã published -> render ảnh thật', async () => {
    await renderPage(
      place({
        media: [
          {
            id: 'm1',
            type: 'image',
            url: 'https://api.example/api/media/m1/file',
            thumbnail_url: null,
            caption: null,
            alt_text: 'Ảnh thật',
            status: 'published',
            attribution: null,
            license_type: null,
            license_url: null,
          },
        ],
      }),
    );
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://api.example/api/media/m1/file');
  });

  it('media rỗng -> không render <img> nào', async () => {
    await renderPage(place({ media: [] }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

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

  // Regression: `getPlace()` supports an optional `locale` param (defaults to 'vi'), and this page
  // already reads `params.locale` for breadcrumbs/canonical — but never forwards it into
  // getPlace(). Both call sites (generateMetadata + the page component) silently fetch `vi`
  // content regardless of the URL's locale, so GET /en/places/... renders Vietnamese
  // short_description. These tests assert on the FORWARDED locale AND on locale-dependent output
  // content (not just call count), so a fix that forwards the wrong value or forwards it into the
  // wrong place still fails here.
  describe('locale forwarding to getPlace() (bug: page ignores params.locale)', () => {
    const viPlace = place({
      slug: 'vinwonders-phu-quoc',
      name: 'VinWonders Phú Quốc',
      short_description: 'Khám phá công viên chủ đề lớn nhất Việt Nam, hàng đầu châu Á.',
    });
    const enPlace = place({
      slug: 'vinwonders-phu-quoc',
      name: 'VinWonders Phu Quoc',
      short_description: 'Explore the largest theme park in Vietnam that ranks top in Asia.',
    });

    describe('generateMetadata', () => {
      it('locale=en → getPlace được gọi với ("vinwonders-phu-quoc", "en"), không phải mặc định vi', async () => {
        mockGetPlace.mockResolvedValueOnce(enPlace);
        await generateMetadata({
          params: Promise.resolve({ slug: 'vinwonders-phu-quoc', locale: 'en' }),
        });
        expect(mockGetPlace).toHaveBeenCalledWith('vinwonders-phu-quoc', 'en');
      });

      it('locale=vi → getPlace được gọi với ("vinwonders-phu-quoc", "vi")', async () => {
        mockGetPlace.mockResolvedValueOnce(viPlace);
        await generateMetadata({
          params: Promise.resolve({ slug: 'vinwonders-phu-quoc', locale: 'vi' }),
        });
        expect(mockGetPlace).toHaveBeenCalledWith('vinwonders-phu-quoc', 'vi');
      });

      it('locale=en → metadata.description dùng ĐÚNG bản dịch tiếng Anh trả về từ getPlace, không phải bản tiếng Việt', async () => {
        mockGetPlace.mockResolvedValueOnce(enPlace);
        const metadata = await generateMetadata({
          params: Promise.resolve({ slug: 'vinwonders-phu-quoc', locale: 'en' }),
        });
        expect(metadata.description).toBe('Explore the largest theme park in Vietnam that ranks top in Asia.');
        expect(metadata.description).not.toBe('Khám phá công viên chủ đề lớn nhất Việt Nam, hàng đầu châu Á.');
      });

      // SEO v2: canonical giờ là URL ĐẦY ĐỦ (buildRouteAlternates/getSiteUrl), không còn path
      // tương đối — khớp yêu cầu "test actual rendered <head> output" (Phase 18), đã xác minh
      // trực tiếp qua trình duyệt trên local staging.
      it('canonical vẫn locale-prefixed đúng (URL đầy đủ) bất kể có forward locale vào getPlace hay không (không regression PR A)', async () => {
        mockGetPlace.mockResolvedValueOnce(enPlace);
        const metadataEn = await generateMetadata({
          params: Promise.resolve({ slug: 'vinwonders-phu-quoc', locale: 'en' }),
        });
        expect(metadataEn.alternates?.canonical).toBe('http://localhost:3000/en/places/vinwonders-phu-quoc');

        mockGetPlace.mockResolvedValueOnce(viPlace);
        const metadataVi = await generateMetadata({
          params: Promise.resolve({ slug: 'vinwonders-phu-quoc', locale: 'vi' }),
        });
        expect(metadataVi.alternates?.canonical).toBe('http://localhost:3000/vi/places/vinwonders-phu-quoc');
      });

      // Phase 20 (EN indexation gate): chưa có bản dịch EN nào được duyệt cho BẤT KỲ place nào
      // hôm nay (isEnDetailIndexable khoá `false` toàn cục, xem lib/seo.ts) — bản `/en` phải
      // noindex,follow và không quảng cáo hreflang="en" giả; bản `/vi` không bị ảnh hưởng.
      it('Phase 20: bản /en chưa đủ điều kiện index → noindex,follow, không hreflang="en"', async () => {
        mockGetPlace.mockResolvedValueOnce(enPlace);
        const metadataEn = await generateMetadata({
          params: Promise.resolve({ slug: 'vinwonders-phu-quoc', locale: 'en' }),
        });
        expect(metadataEn.robots).toEqual({ index: false, follow: true });
        expect(metadataEn.alternates?.languages?.en).toBeUndefined();
        expect(metadataEn.alternates?.languages?.['x-default']).toBe(
          'http://localhost:3000/vi/places/vinwonders-phu-quoc',
        );
      });

      it('Phase 20: bản /vi (nguồn gốc) KHÔNG bị noindex', async () => {
        mockGetPlace.mockResolvedValueOnce(viPlace);
        const metadataVi = await generateMetadata({
          params: Promise.resolve({ slug: 'vinwonders-phu-quoc', locale: 'vi' }),
        });
        expect(metadataVi.robots).toBeUndefined();
      });

      // EN indexation gate v2 (H): một place đã có CẢ HAI field EN thật sự duyệt/công khai (giống
      // VinWonders sau khi chủ cơ sở duyệt qua UI) → bản /en phải index được, có hreflang="en"
      // thật, và canonical tự trỏ về chính nó (không còn trỏ về /vi).
      it('EN indexation gate v2 (H): place có display_name + short_description EN đã duyệt/công khai → indexable', async () => {
        const fullyApprovedEnPlace = {
          ...enPlace,
          en_display_name_approved: true,
          en_short_description_approved: true,
        };
        mockGetPlace.mockResolvedValueOnce(fullyApprovedEnPlace);
        const metadataEn = await generateMetadata({
          params: Promise.resolve({ slug: 'vinwonders-phu-quoc', locale: 'en' }),
        });
        expect(metadataEn.robots).toBeUndefined();
        expect(metadataEn.alternates?.canonical).toBe(
          'http://localhost:3000/en/places/vinwonders-phu-quoc',
        );
        expect(metadataEn.alternates?.languages?.en).toBe(
          'http://localhost:3000/en/places/vinwonders-phu-quoc',
        );
        expect(metadataEn.alternates?.languages?.vi).toBe(
          'http://localhost:3000/vi/places/vinwonders-phu-quoc',
        );
        expect(metadataEn.alternates?.languages?.['x-default']).toBe(
          'http://localhost:3000/vi/places/vinwonders-phu-quoc',
        );
      });

      it('EN indexation gate v2: chỉ MỘT trong hai field EN đã duyệt (tên duyệt, mô tả còn PENDING) → vẫn noindex', async () => {
        const partiallyApprovedEnPlace = {
          ...enPlace,
          en_display_name_approved: true,
          en_short_description_approved: false,
        };
        mockGetPlace.mockResolvedValueOnce(partiallyApprovedEnPlace);
        const metadataEn = await generateMetadata({
          params: Promise.resolve({ slug: 'vinwonders-phu-quoc', locale: 'en' }),
        });
        expect(metadataEn.robots).toEqual({ index: false, follow: true });
        expect(metadataEn.alternates?.languages?.en).toBeUndefined();
      });
    });

    describe('page render', () => {
      it('locale=en → getPlace được gọi với ("bai-sao", "en")', async () => {
        mockGetPlace.mockResolvedValueOnce(place({ slug: 'bai-sao' }));
        mockListReviews.mockResolvedValueOnce([]);
        render(await PlaceDetailPage({ params: Promise.resolve({ slug: 'bai-sao', locale: 'en' }) }));
        expect(mockGetPlace).toHaveBeenCalledWith('bai-sao', 'en');
      });

      it('locale=vi → getPlace được gọi với ("bai-sao", "vi")', async () => {
        mockGetPlace.mockResolvedValueOnce(place({ slug: 'bai-sao' }));
        mockListReviews.mockResolvedValueOnce([]);
        render(await PlaceDetailPage({ params: Promise.resolve({ slug: 'bai-sao', locale: 'vi' }) }));
        expect(mockGetPlace).toHaveBeenCalledWith('bai-sao', 'vi');
      });

      it('locale=en → h1 và meta description render ĐÚNG nội dung tiếng Anh mà getPlace trả về (không phải mock vi bị dùng nhầm)', async () => {
        mockGetPlace.mockResolvedValueOnce(enPlace);
        mockListReviews.mockResolvedValueOnce([]);
        render(await PlaceDetailPage({ params: Promise.resolve({ slug: 'vinwonders-phu-quoc', locale: 'en' }) }));
        expect(screen.getByRole('heading', { name: 'VinWonders Phu Quoc' })).toBeInTheDocument();
        expect(screen.queryByText('VinWonders Phú Quốc')).not.toBeInTheDocument();
      });

      it('locale=vi → h1 render đúng nội dung tiếng Việt', async () => {
        mockGetPlace.mockResolvedValueOnce(viPlace);
        mockListReviews.mockResolvedValueOnce([]);
        render(await PlaceDetailPage({ params: Promise.resolve({ slug: 'vinwonders-phu-quoc', locale: 'vi' }) }));
        expect(screen.getByRole('heading', { name: 'VinWonders Phú Quốc' })).toBeInTheDocument();
      });
    });
  });

  // G10 (X1, launch-readiness pass 2026-09-22) — phần thân trang (Giới thiệu/Thông tin/Liên hệ/Giá)
  // trước đây hardcode tiếng Việt bất kể `/en`. Test dưới đây khẳng định KHÔNG còn chữ tiếng Việt
  // nào của CHÍNH TRANG này (section heading/label) lọt vào bản `/en` — không khẳng định lại toàn
  // bộ nội dung do getPlace() trả về (đó là dữ liệu, đã có test riêng ở trên).
  describe('G10 — phần thân trang theo đúng locale', () => {
    async function renderEn(p: Partial<PlaceDetail> = {}) {
      mockGetPlace.mockResolvedValueOnce(place(p));
      mockListReviews.mockResolvedValueOnce([]);
      render(await PlaceDetailPage({ params: Promise.resolve({ slug: 'bai-sao', locale: 'en' }) }));
    }

    it('locale=en → section headings tiếng Anh, KHÔNG còn "Giới thiệu"/"Thông tin"/"Liên hệ"/"Giá dịch vụ"/"Câu hỏi thường gặp"', async () => {
      await renderEn({
        description: 'A white sand beach.',
        address: '123 Main St',
        contacts: [{ id: 'c1', contact_type: 'phone', label: null, value: '0909123456', is_primary: true, verification_status: 'verified', display_order: 0 }],
        prices: [{ id: 'pr1', service_name: 'Entry', is_free: true, amount: null, currency: 'VND', unit: null, verification_status: 'verified', valid_from: null, valid_to: null }],
        faqs: [{ id: 'f1', question: 'Open when?', answer: 'Daily', sort_order: 0, is_ai_generated: false, status: 'published' }],
      });

      expect(screen.getByRole('heading', { name: 'About' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Information' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Contact' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Prices' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'FAQ' })).toBeInTheDocument();
      expect(screen.queryByText('Giới thiệu')).not.toBeInTheDocument();
      expect(screen.queryByText('Thông tin')).not.toBeInTheDocument();
      expect(screen.queryByText('Liên hệ')).not.toBeInTheDocument();
      expect(screen.queryByText('Giá dịch vụ')).not.toBeInTheDocument();
      expect(screen.queryByText('Câu hỏi thường gặp')).not.toBeInTheDocument();
    });

    it('locale=en → info labels (Address/Area/Price range) tiếng Anh, không còn "Địa chỉ"/"Khu vực"/"Mức giá"', async () => {
      await renderEn({ address: '123 Main St', ward: 'An Thoi', price_range: 'mid', verification_status: 'verified' });
      expect(screen.getByText('Address')).toBeInTheDocument();
      expect(screen.getByText('Area')).toBeInTheDocument();
      expect(screen.getByText('Price range')).toBeInTheDocument();
      expect(screen.getByText('Mid-range')).toBeInTheDocument();
      expect(screen.queryByText('Địa chỉ')).not.toBeInTheDocument();
      expect(screen.queryByText('Khu vực')).not.toBeInTheDocument();
      expect(screen.queryByText('Mức giá')).not.toBeInTheDocument();
      expect(screen.queryByText('Tầm trung')).not.toBeInTheDocument();
    });

    it('locale=en → trust badge và trust note tiếng Anh, không còn "Chưa xác minh"/"Đã xác minh"', async () => {
      await renderEn({ verification_status: 'verified' });
      expect(screen.getByText('Verified')).toBeInTheDocument();
      expect(screen.queryByText('Đã xác minh')).not.toBeInTheDocument();
    });

    it('locale=en → giá "Miễn phí" hiển thị "Free"', async () => {
      await renderEn({
        prices: [{ id: 'pr1', service_name: 'Entry', is_free: true, amount: null, currency: 'VND', unit: null, verification_status: 'verified', valid_from: null, valid_to: null }],
      });
      expect(screen.getByText('Free')).toBeInTheDocument();
      expect(screen.queryByText('Miễn phí')).not.toBeInTheDocument();
    });

    it('locale=en → giá chưa xác minh hiện "Price is being verified", không còn "Giá đang được xác minh"', async () => {
      await renderEn({ price_range: 'mid', verification_status: 'pending' });
      expect(screen.getByText('Price is being verified')).toBeInTheDocument();
      expect(screen.queryByText('Giá đang được xác minh')).not.toBeInTheDocument();
    });

    it('locale=vi (mặc định) vẫn giữ nguyên section heading tiếng Việt — không đổi hành vi hiện có', async () => {
      mockGetPlace.mockResolvedValueOnce(place({ description: 'Bãi biển cát trắng.' }));
      mockListReviews.mockResolvedValueOnce([]);
      render(await PlaceDetailPage({ params: Promise.resolve({ slug: 'bai-sao', locale: 'vi' }) }));
      expect(screen.getByRole('heading', { name: 'Giới thiệu' })).toBeInTheDocument();
    });
  });
});
