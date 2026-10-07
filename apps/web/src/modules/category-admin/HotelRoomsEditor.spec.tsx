/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HotelRoomsEditor } from './HotelRoomsEditor';
import { readSession } from '@/modules/auth/session';
import { getHotelRoomsManaged, updateHotelRooms } from '@/modules/hotels/api/hotels.api';
import { ApiError } from '@/lib/http';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('@/modules/hotels/api/hotels.api', () => ({
  getHotelRoomsManaged: jest.fn(),
  updateHotelRooms: jest.fn(),
}));

const mockReadSession = readSession as jest.Mock;
const mockGet = getHotelRoomsManaged as jest.Mock;
const mockUpdate = updateHotelRooms as jest.Mock;
const mockOnVersionChange = jest.fn();

const ROOMS = [
  { id: 'r1', name: 'Deluxe synthetic', capacity: 2, price_ref: 1200000, currency: 'VND', sort_order: 0, valid_from: null, valid_to: null },
  { id: 'r2', name: 'Phòng không giá synthetic', capacity: null, price_ref: null, currency: 'VND', sort_order: 1, valid_from: null, valid_to: null },
];

function renderEditor(contentVersion = 4) {
  return render(<HotelRoomsEditor placeId="hotel-1" contentVersion={contentVersion} onVersionChange={mockOnVersionChange} />);
}

beforeEach(() => {
  mockReadSession.mockReturnValue({ accessToken: 'tok' });
});

afterEach(() => jest.clearAllMocks());

describe('HotelRoomsEditor — tải và hiển thị', () => {
  it('tải giá thật; phòng không giá hiện ô trống (không phải 0)', async () => {
    mockGet.mockResolvedValue(ROOMS);
    renderEditor();
    expect(await screen.findByDisplayValue('Deluxe synthetic')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1200000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Phòng không giá synthetic')).toBeInTheDocument();
    const priceInputs = screen.getAllByPlaceholderText('Để trống = chưa có giá') as HTMLInputElement[];
    expect(priceInputs[1].value).toBe('');
  });

  it('lỗi tải → không hiện form sửa và không có nút lưu', async () => {
    mockGet.mockRejectedValue(new ApiError('down', 500));
    renderEditor();
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể lưu cho đến khi tải lại được');
    expect(screen.queryByRole('button', { name: 'Lưu danh sách phòng' })).toBeNull();
  });
});

describe('HotelRoomsEditor — lưu có CAS', () => {
  it('gửi đúng expected_content_version; giá trống → null và KHÔNG kèm currency; bỏ một phòng và thêm một phòng', async () => {
    mockGet.mockResolvedValue(ROOMS);
    mockUpdate.mockResolvedValue({
      rooms: [{ id: 'r9', name: 'Phòng mới synthetic', capacity: 3, price_ref: null, currency: 'VND', sort_order: 0 }],
      content_version: 5,
    });
    renderEditor(4);
    await screen.findByDisplayValue('Deluxe synthetic');
    fireEvent.click(screen.getAllByRole('button', { name: 'Bỏ phòng này khỏi danh sách' })[0]);
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm phòng' }));
    const names = screen.getAllByLabelText('Tên phòng');
    fireEvent.change(names[names.length - 1], { target: { value: 'Phòng mới synthetic' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu danh sách phòng' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    const [placeId, input] = mockUpdate.mock.calls[0];
    expect(placeId).toBe('hotel-1');
    expect(input.expected_content_version).toBe(4);
    expect(input.rooms).toEqual([
      { name: 'Phòng không giá synthetic', capacity: null, price_ref: null, valid_from: null, valid_to: null, sort_order: 0 },
      { name: 'Phòng mới synthetic', capacity: null, price_ref: null, valid_from: null, valid_to: null, sort_order: 1 },
    ]);
    await waitFor(() => expect(mockOnVersionChange).toHaveBeenCalledWith(5));
  });

  it('tên phòng trống → báo lỗi đúng dòng, KHÔNG gọi API', async () => {
    mockGet.mockResolvedValue([]);
    renderEditor();
    await screen.findByText('Chưa có phòng nào.');
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm phòng' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu danh sách phòng' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Phòng 1: cần nhập tên phòng.');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('409 → giữ nguyên dòng đang nhập, không đổi version, không tự lưu lại', async () => {
    mockGet.mockResolvedValue(ROOMS);
    mockUpdate.mockRejectedValue(new ApiError('Địa điểm vừa được người khác sửa.', 409));
    renderEditor();
    await screen.findByDisplayValue('Deluxe synthetic');
    fireEvent.change(screen.getAllByLabelText('Tên phòng')[0], { target: { value: 'Nội dung đang nhập' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu danh sách phòng' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('người khác sửa');
    expect(screen.getAllByLabelText('Tên phòng')[0]).toHaveValue('Nội dung đang nhập');
    expect(mockOnVersionChange).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});
