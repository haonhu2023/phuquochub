/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { getRealEstateListing } from '@/modules/real-estate-listings/api/real-estate-listings.api';
import type { RealEstateListingPublicDetailView } from '@/modules/real-estate-listings/types';
import RealEstateListingDetailPage from './page';

jest.mock('@/modules/real-estate-listings/api/real-estate-listings.api', () => ({ getRealEstateListing: jest.fn() }));
jest.mock('@/modules/saved-items/SaveButton', () => ({ SaveButton: () => null }));
jest.mock('@/modules/listing-reports/ReportButton', () => ({ ReportButton: () => null }));
jest.mock('@/modules/real-estate-listing-photos/RealEstateListingPhotoGallery', () => ({ RealEstateListingPhotoGallery: () => null }));

const mockGetListing = getRealEstateListing as jest.Mock;

function listing(overrides: Partial<RealEstateListingPublicDetailView> = {}): RealEstateListingPublicDetailView {
  return {
    id: 'r1',
    poster_role: 'owner',
    transaction_type: 'rent',
    property_type: 'room',
    title: 'Phòng trọ',
    ward: null,
    address_precision: 'area',
    address_text: null,
    lat: null,
    lng: null,
    area_sqm: null,
    price: null,
    price_currency: null,
    rent_period: null,
    sale_price_basis: null,
    deposit_amount: null,
    utilities_note: null,
    utilities_note_rich: null,
    furniture_status: null,
    move_in_date: null,
    lease_term_months: null,
    legal_status_note: null,
    legal_status_note_rich: null,
    description: null,
    description_rich: null,
    contact_method: 'phone',
    contact_value: '0909000000',
    deal_status: 'available',
    expires_at: null,
    published_at: '2026-01-05T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-05T00:00:00.000Z',
    locale: 'vi',
    is_translation_stale: false,
    translation_hidden_reason: null,
    ...overrides,
  };
}

async function renderPage(l: RealEstateListingPublicDetailView, locale = 'vi') {
  mockGetListing.mockResolvedValueOnce(l);
  render(await RealEstateListingDetailPage({ params: Promise.resolve({ id: l.id, locale }) }));
}

afterEach(() => jest.clearAllMocks());

// Bug thiếu đã sửa (2026-10-11): ngày đăng/cập nhật/hết hạn đã có trong response từ trước nhưng
// chưa từng render ở trang chi tiết công khai.
describe('RealEstateListingDetailPage — ngày đăng/cập nhật/hết hạn (bug thiếu đã sửa)', () => {
  it('hiện đúng ngày đăng (published_at)', async () => {
    await renderPage(listing({ published_at: '2026-03-15T00:00:00.000Z', created_at: '2026-03-01T00:00:00.000Z' }));
    expect(screen.getByText('Đăng ngày')).toBeInTheDocument();
    expect(screen.getByText('15/3/2026')).toBeInTheDocument();
  });

  it('chưa có published_at → dùng created_at làm ngày đăng', async () => {
    await renderPage(listing({ published_at: null, created_at: '2026-03-01T00:00:00.000Z' }));
    expect(screen.getByText('1/3/2026')).toBeInTheDocument();
  });

  it('updated_at khác posted → hiện mục "Cập nhật"', async () => {
    await renderPage(listing({ published_at: '2026-03-01T00:00:00.000Z', updated_at: '2026-03-10T00:00:00.000Z' }));
    expect(screen.getByText('Cập nhật')).toBeInTheDocument();
  });

  it('updated_at giống posted → KHÔNG hiện mục "Cập nhật" (tránh lặp lại thông tin)', async () => {
    await renderPage(listing({ published_at: '2026-03-01T00:00:00.000Z', updated_at: '2026-03-01T00:00:00.000Z' }));
    expect(screen.queryByText('Cập nhật')).not.toBeInTheDocument();
  });

  it('có expires_at → hiện "Hạn đăng"', async () => {
    await renderPage(listing({ expires_at: '2026-12-31T00:00:00.000Z' }));
    expect(screen.getByText('Hạn đăng')).toBeInTheDocument();
  });

  it('expires_at null → KHÔNG hiện "Hạn đăng"', async () => {
    await renderPage(listing({ expires_at: null }));
    expect(screen.queryByText('Hạn đăng')).not.toBeInTheDocument();
  });

  it('locale=en → nhãn tiếng Anh', async () => {
    await renderPage(listing({ expires_at: '2026-12-31T00:00:00.000Z' }), 'en');
    expect(screen.getByText('Posted on')).toBeInTheDocument();
    expect(screen.getByText('Available until')).toBeInTheDocument();
  });
});

// Bug thật đã sửa 2026-10-17 — cùng nguyên nhân/cách sửa như trang tin tuyển dụng (<p>/<dd> thường
// gộp "\n" thành dấu cách). Khoá đúng việc "\n" tới DOM nguyên vẹn cho description/utilities_note
// (thuê)/legal_status_note (bán) — xem ghi chú đầy đủ ở jobs/[id]/page.spec.tsx (lý do không assert
// className qua mock CSS Module của dự án).
describe('RealEstateListingDetailPage — giữ xuống dòng mô tả/tiện ích/pháp lý (bug thật đã sửa)', () => {
  it('description + utilities_note (cho thuê): "\\n" tới DOM nguyên vẹn', async () => {
    await renderPage(
      listing({
        transaction_type: 'rent',
        description: 'Đoạn một.\n\nĐoạn hai.',
        utilities_note: 'Điện: tự trả.\nNước: bao gồm.',
      }),
    );
    expect(screen.getByText(/Đoạn một/).textContent).toBe('Đoạn một.\n\nĐoạn hai.');
    expect(screen.getByText(/Điện: tự trả/).textContent).toBe('Điện: tự trả.\nNước: bao gồm.');
  });

  it('legal_status_note (mua bán): "\\n" tới DOM nguyên vẹn', async () => {
    await renderPage(
      listing({
        transaction_type: 'sale',
        legal_status_note: 'Sổ đỏ riêng.\nChưa tách thửa.',
      }),
    );
    expect(screen.getByText(/Sổ đỏ riêng/).textContent).toBe('Sổ đỏ riêng.\nChưa tách thửa.');
  });
});

// Gói C (17/10/2026) — cùng lý do jobs/[id]/page.spec.tsx (xem ghi chú ở đó).
describe('RealEstateListingDetailPage — thông báo fallback/lỗi thời bản dịch (Gói C)', () => {
  it('route /en nhưng CHƯA có bản dịch (locale trả về "vi") → ghi chú bằng tiếng Anh', async () => {
    await renderPage(listing({ locale: 'vi' }), 'en');
    expect(screen.getByText(/has not been translated into English yet/)).toBeInTheDocument();
  });

  it('route /vi → KHÔNG hiện ghi chú fallback/lỗi thời nào', async () => {
    await renderPage(listing({ locale: 'vi' }), 'vi');
    expect(screen.queryByText(/has not been translated/)).not.toBeInTheDocument();
    expect(screen.queryByText(/chưa phản ánh thông tin mới nhất/)).not.toBeInTheDocument();
  });

  it('có bản dịch nhưng is_translation_stale=true, route /en → cảnh báo bằng tiếng Anh', async () => {
    await renderPage(listing({ locale: 'en', is_translation_stale: true }), 'en');
    expect(screen.getByText(/may not reflect the latest details/)).toBeInTheDocument();
  });

  it('có bản dịch, is_translation_stale=true, route /vi → cảnh báo bằng tiếng Việt', async () => {
    await renderPage(listing({ locale: 'en', is_translation_stale: true }), 'vi');
    expect(screen.getByText(/chưa phản ánh thông tin mới nhất/)).toBeInTheDocument();
  });

  it('is_translation_stale=false → KHÔNG hiện cảnh báo', async () => {
    await renderPage(listing({ locale: 'en', is_translation_stale: false }), 'en');
    expect(screen.queryByText(/may not reflect the latest details/)).not.toBeInTheDocument();
  });
});

describe('RealEstateListingDetailPage — ẩn bản dịch khi dữ kiện quan trọng mâu thuẫn (Gói D điểm 4)', () => {
  it('translation_hidden_reason="critical_fact_mismatch" trên route /en → ghi chú ẩn bản dịch, KHÔNG phải ghi chú "chưa dịch"', async () => {
    await renderPage(listing({ locale: 'vi', translation_hidden_reason: 'critical_fact_mismatch' }), 'en');
    expect(screen.getByText(/temporarily hidden/)).toBeInTheDocument();
    expect(screen.queryByText(/has not been translated into English yet/)).not.toBeInTheDocument();
  });

  it('translation_hidden_reason=null, locale="vi" (chưa từng dịch) → vẫn là ghi chú "chưa dịch" như cũ', async () => {
    await renderPage(listing({ locale: 'vi', translation_hidden_reason: null }), 'en');
    expect(screen.getByText(/has not been translated into English yet/)).toBeInTheDocument();
    expect(screen.queryByText(/temporarily hidden/)).not.toBeInTheDocument();
  });

  it('route /vi → KHÔNG hiện ghi chú ẩn bản dịch dù translation_hidden_reason="critical_fact_mismatch"', async () => {
    await renderPage(listing({ locale: 'vi', translation_hidden_reason: 'critical_fact_mismatch' }), 'vi');
    expect(screen.queryByText(/temporarily hidden/)).not.toBeInTheDocument();
  });
});
