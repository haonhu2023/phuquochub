/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MyRealEstateListingsView } from './MyRealEstateListingsView';
import { readSession } from '@/modules/auth/session';
import { listMyRealEstateListings, markRealEstateListingRented } from './api/real-estate-listings.api';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/real-estate-listings.api', () => ({
  listMyRealEstateListings: jest.fn(),
  submitRealEstateListing: jest.fn(),
  closeRealEstateListing: jest.fn(),
  reopenRealEstateListing: jest.fn(),
  markRealEstateListingRented: jest.fn(),
  markRealEstateListingSold: jest.fn(),
  markRealEstateListingAvailable: jest.fn(),
}));

const mockReadSession = readSession as jest.Mock;
const mockList = listMyRealEstateListings as jest.Mock;
const mockMarkRented = markRealEstateListingRented as jest.Mock;

beforeEach(() => {
  mockReadSession.mockReturnValue({ accessToken: 'tok' });
});

afterEach(() => jest.clearAllMocks());

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
    status: 'draft',
    review_note: null,
    reviewed_at: null,
    ...overrides,
  };
}

describe('MyRealEstateListingsView', () => {
  it('rỗng → trạng thái rỗng, không báo lỗi', async () => {
    mockList.mockResolvedValue([]);
    render(<MyRealEstateListingsView />);
    expect(await screen.findByText('Chưa có tin nào')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('tin rejected hiện lý do từ chối', async () => {
    mockList.mockResolvedValue([row({ status: 'rejected', review_note: 'Thiếu ảnh thật' })]);
    render(<MyRealEstateListingsView />);
    expect(await screen.findByText(/Thiếu ảnh thật/)).toBeInTheDocument();
  });

  it('tin published + available: hiện nút "Đánh dấu đã cho thuê", KHÔNG hiện "Đánh dấu còn giao dịch"', async () => {
    mockList.mockResolvedValue([row({ status: 'published', deal_status: 'available' })]);
    render(<MyRealEstateListingsView />);
    expect(await screen.findByRole('button', { name: 'Đánh dấu đã cho thuê' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đánh dấu còn giao dịch' })).toBeNull();
  });

  it('tin published + rented: hiện nút "Đánh dấu còn giao dịch", KHÔNG hiện nút đánh dấu đã cho thuê nữa', async () => {
    mockList.mockResolvedValue([row({ status: 'published', deal_status: 'rented' })]);
    render(<MyRealEstateListingsView />);
    expect(await screen.findByRole('button', { name: 'Đánh dấu còn giao dịch' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đánh dấu đã cho thuê' })).toBeNull();
    // status (kiểm duyệt) KHÔNG đổi chỉ vì deal_status đổi — vẫn hiện "Đang đăng", không phải nhãn khác.
    expect(screen.getByText(/Đang đăng/)).toBeInTheDocument();
  });

  it('bấm "Đánh dấu đã cho thuê" gọi đúng API với id', async () => {
    mockList.mockResolvedValue([row({ status: 'published', deal_status: 'available' })]);
    mockMarkRented.mockResolvedValue(row({ status: 'published', deal_status: 'rented' }));
    render(<MyRealEstateListingsView />);
    const btn = await screen.findByRole('button', { name: 'Đánh dấu đã cho thuê' });
    fireEvent.click(btn);
    await waitFor(() => expect(mockMarkRented).toHaveBeenCalledWith('rel-1', 'tok'));
  });
});
