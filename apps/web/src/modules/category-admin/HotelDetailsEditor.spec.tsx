/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HotelDetailsEditor } from './HotelDetailsEditor';
import { readSession } from '@/modules/auth/session';
import { getHotelDetails, updateHotelDetails } from '@/modules/hotels/api/hotels.api';
import { ApiError } from '@/lib/http';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('@/modules/hotels/api/hotels.api', () => ({
  getHotelDetails: jest.fn(),
  updateHotelDetails: jest.fn(),
}));
jest.mock('@/modules/sources/api/sources.api', () => ({ createSource: jest.fn() }));

const mockReadSession = readSession as jest.Mock;
const mockGet = getHotelDetails as jest.Mock;
const mockUpdate = updateHotelDetails as jest.Mock;
const mockOnVersionChange = jest.fn();
const ACCESS = 'Đường vào / điểm tiếp cận (để trống = chưa có thông tin)';

function renderEditor(contentVersion = 4) {
  return render(<HotelDetailsEditor placeId="hotel-1" contentVersion={contentVersion} onVersionChange={mockOnVersionChange} />);
}

beforeEach(() => {
  mockReadSession.mockReturnValue({ accessToken: 'tok' });
});

afterEach(() => jest.clearAllMocks());

describe('HotelDetailsEditor — đường vào / điểm tiếp cận', () => {
  it('tải giá trị đã lưu và gửi đúng trong payload', async () => {
    mockGet.mockResolvedValue({ content_version: 4, hotel_type: 'resort', star_rating: 4, check_in: '14:00:00', check_out: null, access_route: 'Cổng sau, đi bộ 5 phút synthetic', star_rating_source: null });
    mockUpdate.mockResolvedValue({ content_version: 5, hotel_type: 'resort', star_rating: 4, check_in: '14:00:00', check_out: null, access_route: 'Cổng sau, đi bộ 5 phút synthetic', star_rating_source: null });
    renderEditor(4);
    const input = (await screen.findByLabelText(ACCESS)) as HTMLInputElement;
    expect(input.value).toBe('Cổng sau, đi bộ 5 phút synthetic');
    fireEvent.change(input, { target: { value: '  Đường biển mới synthetic  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin khách sạn' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockUpdate.mock.calls[0][1]).toMatchObject({ expected_content_version: 4, access_route: 'Đường biển mới synthetic' });
  });

  it('để trống → gửi null (chưa có thông tin), không gửi chuỗi rỗng', async () => {
    mockGet.mockResolvedValue({ content_version: 4, hotel_type: 'hotel', star_rating: null, check_in: null, check_out: null, access_route: 'Cũ', star_rating_source: null });
    mockUpdate.mockResolvedValue({ content_version: 5, hotel_type: 'hotel', star_rating: null, check_in: null, check_out: null, access_route: null, star_rating_source: null });
    renderEditor(4);
    fireEvent.change(await screen.findByLabelText(ACCESS), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin khách sạn' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockUpdate.mock.calls[0][1].access_route).toBeNull();
  });

  it('409 → giữ nội dung đang nhập, không đổi version', async () => {
    mockGet.mockResolvedValue({ content_version: 4, hotel_type: 'hotel', star_rating: null, check_in: null, check_out: null, access_route: null, star_rating_source: null });
    mockUpdate.mockRejectedValue(new ApiError('Địa điểm vừa được người khác sửa.', 409));
    renderEditor(4);
    fireEvent.change(await screen.findByLabelText(ACCESS), { target: { value: 'Nội dung đang nhập' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin khách sạn' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('người khác sửa');
    expect((screen.getByLabelText(ACCESS) as HTMLInputElement).value).toBe('Nội dung đang nhập');
    expect(mockOnVersionChange).not.toHaveBeenCalled();
  });
});

// Chính sách huỷ phòng (mục V đợt 1 mục A) — cùng khuôn access_route ở trên, field độc lập.
const CANCELLATION = 'Chính sách huỷ phòng (để trống = chưa có thông tin)';

describe('HotelDetailsEditor — chính sách huỷ phòng', () => {
  it('tải giá trị đã lưu và gửi đúng trong payload', async () => {
    mockGet.mockResolvedValue({ content_version: 4, hotel_type: 'resort', star_rating: 4, check_in: null, check_out: null, cancellation_policy: 'Huỷ trước 24h synthetic', star_rating_source: null });
    mockUpdate.mockResolvedValue({ content_version: 5, hotel_type: 'resort', star_rating: 4, check_in: null, check_out: null, cancellation_policy: 'Huỷ trước 24h synthetic', star_rating_source: null });
    renderEditor(4);
    const textarea = (await screen.findByLabelText(CANCELLATION)) as HTMLTextAreaElement;
    expect(textarea.value).toBe('Huỷ trước 24h synthetic');
    fireEvent.change(textarea, { target: { value: '  Huỷ trước 48h synthetic  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin khách sạn' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockUpdate.mock.calls[0][1]).toMatchObject({ expected_content_version: 4, cancellation_policy: 'Huỷ trước 48h synthetic' });
  });

  it('để trống → gửi null (chưa có thông tin), không gửi chuỗi rỗng', async () => {
    mockGet.mockResolvedValue({ content_version: 4, hotel_type: 'hotel', star_rating: null, check_in: null, check_out: null, cancellation_policy: 'Cũ', star_rating_source: null });
    mockUpdate.mockResolvedValue({ content_version: 5, hotel_type: 'hotel', star_rating: null, check_in: null, check_out: null, cancellation_policy: null, star_rating_source: null });
    renderEditor(4);
    fireEvent.change(await screen.findByLabelText(CANCELLATION), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin khách sạn' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockUpdate.mock.calls[0][1].cancellation_policy).toBeNull();
  });
});
