/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { getRealEstateListing } from '@/modules/real-estate-listings/api/real-estate-listings.api';
import type { RealEstateListingPublicView } from '@/modules/real-estate-listings/types';
import RealEstateListingDetailPage from './page';

jest.mock('@/modules/real-estate-listings/api/real-estate-listings.api', () => ({ getRealEstateListing: jest.fn() }));
jest.mock('@/modules/saved-items/SaveButton', () => ({ SaveButton: () => null }));
jest.mock('@/modules/listing-reports/ReportButton', () => ({ ReportButton: () => null }));
jest.mock('@/modules/real-estate-listing-photos/RealEstateListingPhotoGallery', () => ({ RealEstateListingPhotoGallery: () => null }));

const mockGetListing = getRealEstateListing as jest.Mock;

function listing(overrides: Partial<RealEstateListingPublicView> = {}): RealEstateListingPublicView {
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
    furniture_status: null,
    move_in_date: null,
    lease_term_months: null,
    legal_status_note: null,
    description: null,
    contact_method: 'phone',
    contact_value: '0909000000',
    deal_status: 'available',
    expires_at: null,
    published_at: '2026-01-05T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-05T00:00:00.000Z',
    ...overrides,
  };
}

async function renderPage(l: RealEstateListingPublicView, locale = 'vi') {
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
