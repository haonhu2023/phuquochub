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
// Cố định "hôm nay" cho test hạn/bộ lọc — xem ghi chú đầy đủ ở MyJobListingsView.spec.tsx (cùng
// khuôn: mock THẲNG useTodayInVietnam(), KHÔNG dùng jest.useFakeTimers()).
jest.mock('@/lib/listingExpiry', () => ({
  ...jest.requireActual('@/lib/listingExpiry'),
  useTodayInVietnam: () => '2026-06-15',
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
    // `selector: 'p'` loại trừ <option value="published">Đang đăng</option> của bộ lọc trạng thái mới thêm.
    expect(screen.getByText(/Đang đăng/, { selector: 'p' })).toBeInTheDocument();
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

// Gói B (17/10/2026) — cùng bản vá/lý do với MyJobListingsView (xem ghi chú ở đó).
describe('MyRealEstateListingsView — hạn đăng + bộ lọc (Gói B)', () => {
  it('có expires_at → hiện đúng ngày dạng dd/mm/yyyy', async () => {
    mockList.mockResolvedValue([row({ status: 'published', expires_at: '2026-12-31' })]);
    render(<MyRealEstateListingsView />);
    expect(await screen.findByText(/hạn đăng 31\/12\/2026/)).toBeInTheDocument();
  });

  it('published + hạn đã qua → nhãn "Đã hết hạn" + ghi chú giải thích', async () => {
    mockList.mockResolvedValue([row({ status: 'published', expires_at: '2026-06-01' })]);
    render(<MyRealEstateListingsView />);
    expect(await screen.findByText(/Đã hết hạn/, { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(/Tin đã quá hạn đăng/)).toBeInTheDocument();
  });

  it('published + còn ≤ 7 ngày → nhãn "Sắp hết hạn"', async () => {
    mockList.mockResolvedValue([row({ status: 'published', expires_at: '2026-06-20' })]);
    render(<MyRealEstateListingsView />);
    expect(await screen.findByText(/Sắp hết hạn/, { selector: 'span' })).toBeInTheDocument();
  });

  it('bộ lọc "Đã hết hạn" chỉ hiện tin published đã quá expires_at', async () => {
    mockList.mockResolvedValue([
      row({ id: 'expired-1', title: 'Tin đã hết hạn', status: 'published', expires_at: '2026-06-01' }),
      row({ id: 'ok-1', title: 'Tin còn hạn', status: 'published', expires_at: '2026-12-31' }),
    ]);
    render(<MyRealEstateListingsView />);
    await screen.findByText(/Tin đã hết hạn/);
    fireEvent.change(screen.getByLabelText('Lọc theo trạng thái'), { target: { value: 'expired' } });
    expect(screen.getByText(/Tin đã hết hạn/)).toBeInTheDocument();
    expect(screen.queryByText(/Tin còn hạn/)).not.toBeInTheDocument();
  });

  it('không có tin nào khớp bộ lọc → thông báo rõ', async () => {
    mockList.mockResolvedValue([row({ status: 'draft' })]);
    render(<MyRealEstateListingsView />);
    fireEvent.change(await screen.findByLabelText('Lọc theo trạng thái'), { target: { value: 'expired' } });
    expect(screen.getByText('Không có tin nào khớp bộ lọc')).toBeInTheDocument();
  });
});
