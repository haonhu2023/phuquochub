/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MyBookingsView } from './MyBookingsView';
import { readSession } from '@/modules/auth/session';
import { listMyManagedBookings, confirmBooking, cancelBooking } from './api/bookings.api';
import type { BookingAdminCardResponse } from './types';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/bookings.api', () => ({
  listMyManagedBookings: jest.fn(),
  confirmBooking: jest.fn(),
  cancelBooking: jest.fn(),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockReadSession = readSession as jest.Mock;
const mockList = listMyManagedBookings as jest.Mock;
const mockConfirm = confirmBooking as jest.Mock;
const mockCancel = cancelBooking as jest.Mock;

const SESSION = { accessToken: 'tok', refreshToken: 'r', expiresAt: 0, user: { id: 'u1', email: 'a@b.c', displayName: 'A', avatarUrl: null } };

function booking(overrides: Partial<BookingAdminCardResponse> = {}): BookingAdminCardResponse {
  return {
    id: 'b1',
    booking_code: 'ABCD1234',
    booking_type: null,
    entity_type: 'hotel',
    entity_id: 'p1',
    place_id: 'p1',
    customer_user_id: 'guest-1',
    currency_code: 'VND',
    booking_status: 'pending',
    payment_status: 'unpaid',
    fulfillment_status: 'pending',
    service_start_at: '2026-11-01T10:00:00.000Z',
    service_end_at: null,
    party_size: 2,
    grand_total: 0,
    created_at: '2026-10-21T00:00:00.000Z',
    updated_at: '2026-10-21T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  mockReadSession.mockReset().mockReturnValue(SESSION);
  mockList.mockReset().mockResolvedValue({ data: [], meta: { page: 1, pageSize: 50, total: 0, totalPages: 0 } });
  mockConfirm.mockReset();
  mockCancel.mockReset();
});

describe('MyBookingsView (Giai đoạn 3 — "Đặt chỗ của cơ sở tôi")', () => {
  it('chưa đăng nhập → hiện yêu cầu đăng nhập, không gọi API', async () => {
    mockReadSession.mockReturnValue(null);
    render(<MyBookingsView />);
    expect(await screen.findByText('Cần đăng nhập')).toBeInTheDocument();
    expect(mockList).not.toHaveBeenCalled();
  });

  it('không quản lý cơ sở nào (danh sách rỗng) → hiện empty-state, không báo lỗi', async () => {
    render(<MyBookingsView />);
    expect(await screen.findByText('Chưa có booking nào')).toBeInTheDocument();
  });

  it('có booking pending → hiện mã, trạng thái, số người, nút Xác nhận + Huỷ', async () => {
    mockList.mockResolvedValue({ data: [booking()], meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 } });
    render(<MyBookingsView />);

    expect(await screen.findByText(/ABCD1234/)).toBeInTheDocument();
    expect(screen.getByText(/Chờ xác nhận/)).toBeInTheDocument();
    expect(screen.getByText(/2 người/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeInTheDocument();
  });

  it('booking đã confirmed → chỉ còn nút Huỷ, không có Xác nhận', async () => {
    mockList.mockResolvedValue({
      data: [booking({ booking_status: 'confirmed' })],
      meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
    });
    render(<MyBookingsView />);

    await screen.findByText(/ABCD1234/);
    expect(screen.queryByRole('button', { name: 'Xác nhận' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeInTheDocument();
  });

  it('booking đã cancelled/expired → không còn nút hành động nào', async () => {
    mockList.mockResolvedValue({
      data: [booking({ booking_status: 'cancelled' })],
      meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
    });
    render(<MyBookingsView />);

    await screen.findByText(/ABCD1234/);
    expect(screen.queryByRole('button', { name: 'Xác nhận' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Huỷ' })).not.toBeInTheDocument();
  });

  it('bấm "Xác nhận" → gọi confirmBooking đúng id, rồi tải lại danh sách', async () => {
    mockList
      .mockResolvedValueOnce({ data: [booking()], meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 } })
      .mockResolvedValueOnce({
        data: [booking({ booking_status: 'confirmed' })],
        meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
      });
    mockConfirm.mockResolvedValue(null);
    render(<MyBookingsView />);

    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận' }));

    await waitFor(() => expect(mockConfirm).toHaveBeenCalledWith('b1', 'tok'));
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  });

  it('bấm "Huỷ" → gọi cancelBooking đúng id', async () => {
    mockList.mockResolvedValue({ data: [booking()], meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 } });
    mockCancel.mockResolvedValue(null);
    render(<MyBookingsView />);

    fireEvent.click(await screen.findByRole('button', { name: 'Huỷ' }));

    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith('b1', 'tok'));
  });

  it('confirm thất bại (403 — không quản lý cơ sở này) → hiện lỗi, không tải lại thành công', async () => {
    mockList.mockResolvedValue({ data: [booking()], meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 } });
    const { ApiError } = jest.requireActual('@/lib/http');
    mockConfirm.mockRejectedValue(new ApiError('Forbidden', 403));
    render(<MyBookingsView />);

    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Bạn không quản lý cơ sở của booking này.');
  });

  it('total > số hiện có → hiện ghi chú "chỉ hiện N/total"', async () => {
    mockList.mockResolvedValue({ data: [booking()], meta: { page: 1, pageSize: 50, total: 75, totalPages: 2 } });
    render(<MyBookingsView />);

    expect(await screen.findByText(/Hiển thị 1\/75/)).toBeInTheDocument();
  });
});
