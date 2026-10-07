/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TourDetailsEditor } from './TourDetailsEditor';
import { readSession } from '@/modules/auth/session';
import { getTourDetailsAdmin, updateTourDetails } from '@/modules/tours/api/tours.admin.api';
import { ApiError } from '@/lib/http';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('@/modules/tours/api/tours.admin.api', () => ({
  getTourDetailsAdmin: jest.fn(),
  updateTourDetails: jest.fn(),
}));

const mockReadSession = readSession as jest.Mock;
const mockGet = getTourDetailsAdmin as jest.Mock;
const mockUpdate = updateTourDetails as jest.Mock;
const mockOnVersionChange = jest.fn();

const DETAILS = {
  tour_type: 'diving',
  duration_minutes: 180,
  difficulty: 'easy',
  organizer_id: null,
  organizer_name: null,
  organizer_slug: null,
  pickup_point: 'Cổng khách sạn synthetic',
  inclusions: 'Vé lặn synthetic',
  exclusions: null,
  cancellation_policy: null,
};

function renderEditor(contentVersion = 4) {
  return render(<TourDetailsEditor placeId="tour-1" contentVersion={contentVersion} onVersionChange={mockOnVersionChange} />);
}

beforeEach(() => {
  mockReadSession.mockReturnValue({ accessToken: 'tok' });
});

afterEach(() => jest.clearAllMocks());

describe('TourDetailsEditor — tải chi tiết', () => {
  it('hiện đúng giá trị đã lưu', async () => {
    mockGet.mockResolvedValue(DETAILS);
    renderEditor();
    expect(await screen.findByDisplayValue('Cổng khách sạn synthetic')).toBeInTheDocument();
    expect(screen.getByDisplayValue('180')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Vé lặn synthetic')).toBeInTheDocument();
  });

  it('chưa có hàng chi tiết (null) → ô trống, thời lượng trống không thành 0', async () => {
    mockGet.mockResolvedValue(null);
    renderEditor();
    await screen.findByLabelText('Thời lượng (phút)');
    expect(screen.getByLabelText('Thời lượng (phút)')).toHaveValue('');
    expect(screen.getByLabelText('Loại tour')).toHaveValue('');
  });
});

describe('TourDetailsEditor — lưu có CAS', () => {
  it('gửi đúng expected_content_version, ô trống thành null, rồi báo version mới', async () => {
    mockGet.mockResolvedValue(DETAILS);
    mockUpdate.mockResolvedValue({ ...DETAILS, cancellation_policy: 'Hủy trước 24h', content_version: 5 });
    renderEditor(4);
    await screen.findByDisplayValue('Cổng khách sạn synthetic');
    fireEvent.change(screen.getByLabelText('Quy định hủy'), { target: { value: 'Hủy trước 24h' } });
    fireEvent.change(screen.getByLabelText('Bao gồm'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu chi tiết tour' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    const [placeId, input] = mockUpdate.mock.calls[0];
    expect(placeId).toBe('tour-1');
    expect(input).toMatchObject({
      expected_content_version: 4,
      tour_type: 'diving',
      duration_minutes: 180,
      cancellation_policy: 'Hủy trước 24h',
      inclusions: null,
    });
    await waitFor(() => expect(mockOnVersionChange).toHaveBeenCalledWith(5));
  });

  it('thời lượng trống → gửi null, không gửi 0', async () => {
    mockGet.mockResolvedValue({ ...DETAILS, duration_minutes: null });
    mockUpdate.mockResolvedValue({ ...DETAILS, duration_minutes: null, content_version: 5 });
    renderEditor(4);
    await screen.findByDisplayValue('Cổng khách sạn synthetic');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu chi tiết tour' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockUpdate.mock.calls[0][1].duration_minutes).toBeNull();
  });

  it('thời lượng không phải số nguyên dương → báo lỗi, không gọi API', async () => {
    mockGet.mockResolvedValue(DETAILS);
    renderEditor();
    await screen.findByDisplayValue('180');
    fireEvent.change(screen.getByLabelText('Thời lượng (phút)'), { target: { value: '2,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu chi tiết tour' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Thời lượng phải là số phút nguyên dương.');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('409 từ CAS → hiện lỗi, giữ nội dung đang nhập, không đổi version', async () => {
    mockGet.mockResolvedValue(DETAILS);
    mockUpdate.mockRejectedValue(new ApiError('Địa điểm vừa được người khác sửa.', 409));
    renderEditor();
    await screen.findByDisplayValue('Cổng khách sạn synthetic');
    fireEvent.change(screen.getByLabelText('Điểm đón khách'), { target: { value: 'Nội dung đang nhập' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu chi tiết tour' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('người khác sửa');
    expect(screen.getByLabelText('Điểm đón khách')).toHaveValue('Nội dung đang nhập');
    expect(mockOnVersionChange).not.toHaveBeenCalled();
  });

  it('lần đầu thiếu loại tour (400) → hiện lỗi từ máy chủ, giữ nội dung', async () => {
    mockGet.mockResolvedValue(null);
    mockUpdate.mockRejectedValue(new ApiError('Lần đầu lưu chi tiết tour cần chọn loại tour (tour_type).', 400));
    renderEditor();
    await screen.findByLabelText('Loại tour');
    fireEvent.change(screen.getByLabelText('Điểm đón khách'), { target: { value: 'Cổng' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu chi tiết tour' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('loại tour');
    expect(screen.getByLabelText('Điểm đón khách')).toHaveValue('Cổng');
  });
});
