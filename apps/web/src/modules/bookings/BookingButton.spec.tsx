/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BookingButton } from './BookingButton';
import { readSession } from '@/modules/auth/session';
import { createGuestBooking } from './api/bookings.api';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/bookings.api', () => ({ createGuestBooking: jest.fn() }));

const mockReadSession = readSession as jest.Mock;
const mockCreate = createGuestBooking as jest.Mock;

afterEach(() => jest.clearAllMocks());

describe('BookingButton (Giai đoạn 3 — form tối giản, ẩn items/giá khỏi khách)', () => {
  it('đóng mặc định → hiện nút "Đặt chỗ", chưa hiện form', () => {
    render(<BookingButton entityType="hotel" placeId="p1" />);
    expect(screen.getByRole('button', { name: 'Đặt chỗ' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Số người')).not.toBeInTheDocument();
  });

  it('bấm "Đặt chỗ" → mở form với đúng 3 trường: ngày giờ, số người, ghi chú', () => {
    render(<BookingButton entityType="hotel" placeId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Đặt chỗ' }));
    expect(screen.getByLabelText(/Ngày giờ mong muốn/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Số người/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Ghi chú/)).toBeInTheDocument();
    // KHÔNG có trường items/giá nào — đúng quyết định "tối giản".
    expect(screen.queryByText(/giá|đơn giá|unit_price/i)).not.toBeInTheDocument();
  });

  it('chưa đăng nhập → submit hiện lỗi yêu cầu đăng nhập, KHÔNG gọi API', async () => {
    mockReadSession.mockReturnValue(null);
    render(<BookingButton entityType="hotel" placeId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Đặt chỗ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu đặt chỗ' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Đăng nhập để đặt chỗ.');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('submit hợp lệ → gọi createGuestBooking đúng entity_type/entity_id/place_id (cùng id, ADR-002) + party_size mặc định 2', async () => {
    mockReadSession.mockReturnValue({ accessToken: 'tok' });
    mockCreate.mockResolvedValue({ booking_code: 'ABCD1234', booking_status: 'pending' });
    render(<BookingButton entityType="tour" placeId="place-9" />);
    fireEvent.click(screen.getByRole('button', { name: 'Đặt chỗ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu đặt chỗ' }));

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ entity_type: 'tour', entity_id: 'place-9', place_id: 'place-9', party_size: 2 }),
        'tok',
      ),
    );
  });

  it('submit thành công → hiện mã đặt chỗ + trạng thái "Chờ xác nhận", ẩn form', async () => {
    mockReadSession.mockReturnValue({ accessToken: 'tok' });
    mockCreate.mockResolvedValue({ booking_code: 'ABCD1234', booking_status: 'pending' });
    render(<BookingButton entityType="hotel" placeId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Đặt chỗ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu đặt chỗ' }));

    expect(await screen.findByText(/ABCD1234/)).toBeInTheDocument();
    expect(screen.getByText(/Chờ xác nhận/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gửi yêu cầu đặt chỗ' })).not.toBeInTheDocument();
  });

  it('API lỗi (4xx) → hiện message lỗi từ API, form vẫn mở để sửa lại', async () => {
    mockReadSession.mockReturnValue({ accessToken: 'tok' });
    const { ApiError } = jest.requireActual('@/lib/http');
    mockCreate.mockRejectedValue(new ApiError('party_size không hợp lệ', 422, 'VALIDATION_ERROR'));
    render(<BookingButton entityType="hotel" placeId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Đặt chỗ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu đặt chỗ' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('party_size không hợp lệ');
    expect(screen.getByRole('button', { name: 'Gửi yêu cầu đặt chỗ' })).toBeInTheDocument();
  });

  it('bấm "Huỷ" trong form → đóng lại về nút "Đặt chỗ"', () => {
    render(<BookingButton entityType="hotel" placeId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Đặt chỗ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(screen.getByRole('button', { name: 'Đặt chỗ' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Số người/)).not.toBeInTheDocument();
  });
});
