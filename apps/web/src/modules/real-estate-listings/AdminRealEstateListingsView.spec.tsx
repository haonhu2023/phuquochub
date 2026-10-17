/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdminRealEstateListingsView } from './AdminRealEstateListingsView';
import { readSession } from '@/modules/auth/session';
import { closeRealEstateListing, listRealEstateListingsForAdmin, reopenRealEstateListing } from './api/real-estate-listings.api';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/real-estate-listings.api', () => ({
  listRealEstateListingsForAdmin: jest.fn(),
  closeRealEstateListing: jest.fn(),
  reopenRealEstateListing: jest.fn(),
}));
jest.mock('@/lib/listingExpiry', () => ({
  ...jest.requireActual('@/lib/listingExpiry'),
  useTodayInVietnam: () => '2026-06-15',
}));

const mockReadSession = readSession as jest.Mock;
const mockList = listRealEstateListingsForAdmin as jest.Mock;
const mockClose = closeRealEstateListing as jest.Mock;
const mockReopen = reopenRealEstateListing as jest.Mock;

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rel-1',
    poster_role: 'owner',
    transaction_type: 'rent',
    property_type: 'room',
    title: 'Phòng trọ gần biển',
    ward: 'An Thới',
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
    contact_value: '0909xxxxxx',
    deal_status: 'available',
    expires_at: null,
    published_at: null,
    created_at: '2026-10-07T00:00:00.000Z',
    updated_at: '2026-10-07T00:00:00.000Z',
    status: 'published',
    review_note: null,
    reviewed_at: null,
    created_by: 'owner-1',
    reviewer_id: null,
    creator_email: 'owner1@test.com',
    creator_display_name: 'Chủ tin 1',
    ...overrides,
  };
}

beforeEach(() => {
  mockReadSession.mockReturnValue({ accessToken: 'tok' });
});

afterEach(() => jest.clearAllMocks());

// Cùng khuôn AdminJobListingsView.spec.tsx — khác RealEstateListingModerationQueueView.spec.tsx
// (hàng chờ duyệt, chỉ pending).
describe('AdminRealEstateListingsView — quản lý tất cả tin bất động sản', () => {
  it('không có session → trạng thái "không có quyền"', async () => {
    mockReadSession.mockReturnValue(null);
    render(<AdminRealEstateListingsView />);
    expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
  });

  it('403 từ API → trạng thái "không có quyền" (chặn ở server, không chỉ web)', async () => {
    const { ApiError } = jest.requireActual('@/lib/http');
    mockList.mockRejectedValue(new ApiError('forbidden', 403));
    render(<AdminRealEstateListingsView />);
    expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
  });

  it('hiện tin của NHIỀU người đăng, NHIỀU trạng thái cùng lúc (khác hàng chờ duyệt chỉ-pending)', async () => {
    mockList.mockResolvedValue({
      data: [
        row({ id: 'rel-pub', status: 'published', creator_display_name: 'Chủ tin 1' }),
        row({ id: 'rel-closed', status: 'closed', title: 'Tin đã đóng', creator_display_name: 'Chủ tin 2', creator_email: 'owner2@test.com' }),
        row({ id: 'rel-draft', status: 'draft', title: 'Tin nháp', creator_display_name: 'Chủ tin 3' }),
      ],
      meta: { page: 1, pageSize: 100, total: 3, totalPages: 1, timestamp: '' },
    });
    render(<AdminRealEstateListingsView />);
    expect(await screen.findByText(/Tin đã đóng/)).toBeInTheDocument();
    expect(screen.getByText(/Tin nháp/)).toBeInTheDocument();
    expect(screen.getByText(/Chủ tin 1/)).toBeInTheDocument();
    expect(screen.getByText(/owner2@test.com/)).toBeInTheDocument();
  });

  it('người đăng đã bị xoá (creator_display_name null) → hiện ghi chú rõ, không crash', async () => {
    mockList.mockResolvedValue({
      data: [row({ creator_display_name: null, creator_email: null })],
      meta: { page: 1, pageSize: 100, total: 1, totalPages: 1, timestamp: '' },
    });
    render(<AdminRealEstateListingsView />);
    expect(await screen.findByText(/đã xoá tài khoản/)).toBeInTheDocument();
  });

  it('đổi bộ lọc trạng thái → gọi lại API với đúng status (lọc THẬT ở server, không phải client)', async () => {
    mockList.mockResolvedValue({ data: [row()], meta: { page: 1, pageSize: 100, total: 1, totalPages: 1, timestamp: '' } });
    render(<AdminRealEstateListingsView />);
    await screen.findByText(/Phòng trọ gần biển/);
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'closed' } });
    await waitFor(() =>
      expect(mockList).toHaveBeenLastCalledWith({ status: 'closed', limit: 100 }, 'tok'),
    );
  });

  it('lọc người đăng khớp đúng email → chỉ còn tin của người đó, KHÔNG gọi lại API (lọc client-side)', async () => {
    mockList.mockResolvedValue({
      data: [
        row({ id: 'rel-a', title: 'Tin của A', creator_display_name: 'Người A', creator_email: 'a@test.com' }),
        row({ id: 'rel-b', title: 'Tin của B', creator_display_name: 'Người B', creator_email: 'b@test.com' }),
      ],
      meta: { page: 1, pageSize: 100, total: 2, totalPages: 1, timestamp: '' },
    });
    render(<AdminRealEstateListingsView />);
    await screen.findByText(/Tin của A/);
    const callsBefore = mockList.mock.calls.length;
    fireEvent.change(screen.getByLabelText('Người đăng (tên/email)'), { target: { value: 'a@test.com' } });
    expect(screen.getByText(/Tin của A/)).toBeInTheDocument();
    expect(screen.queryByText(/Tin của B/)).not.toBeInTheDocument();
    expect(mockList.mock.calls.length).toBe(callsBefore);
  });

  it('tin published: nút "Đóng tin" gọi closeRealEstateListing đúng id', async () => {
    mockList.mockResolvedValue({ data: [row({ status: 'published' })], meta: { page: 1, pageSize: 100, total: 1, totalPages: 1, timestamp: '' } });
    mockClose.mockResolvedValue(row({ status: 'closed' }));
    render(<AdminRealEstateListingsView />);
    const btn = await screen.findByRole('button', { name: 'Đóng tin' });
    fireEvent.click(btn);
    await waitFor(() => expect(mockClose).toHaveBeenCalledWith('rel-1', 'tok'));
  });

  it('tin closed: nút "Mở lại" gọi reopenRealEstateListing đúng id', async () => {
    mockList.mockResolvedValue({ data: [row({ status: 'closed' })], meta: { page: 1, pageSize: 100, total: 1, totalPages: 1, timestamp: '' } });
    mockReopen.mockResolvedValue(row({ status: 'pending' }));
    render(<AdminRealEstateListingsView />);
    const btn = await screen.findByRole('button', { name: /Mở lại/ });
    fireEvent.click(btn);
    await waitFor(() => expect(mockReopen).toHaveBeenCalledWith('rel-1', 'tok'));
  });
});
