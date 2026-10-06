/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BeachDetailsEditor } from './BeachDetailsEditor';
import { readSession } from '@/modules/auth/session';
import { getBeachDetailsAdmin, updateBeachDetails } from '@/modules/beaches/api/beaches.api';
import { createSource } from '@/modules/sources/api/sources.api';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('@/modules/beaches/api/beaches.api', () => ({
  getBeachDetailsAdmin: jest.fn(),
  updateBeachDetails: jest.fn(),
}));
jest.mock('@/modules/sources/api/sources.api', () => ({ createSource: jest.fn() }));

const mockReadSession = readSession as jest.Mock;
const mockGet = getBeachDetailsAdmin as jest.Mock;
const mockUpdate = updateBeachDetails as jest.Mock;
const mockCreateSource = createSource as jest.Mock;
const mockOnVersionChange = jest.fn();

const EMPTY_DETAILS = {
  access_route: null,
  characteristics: null,
  services: null,
  best_season: null,
  best_season_source: null,
  lifeguard_info: null,
  lifeguard_info_source: null,
  sourced_notes: null,
  sourced_notes_source: null,
};

function renderEditor(contentVersion = 4) {
  return render(
    <BeachDetailsEditor placeId="place-1" contentVersion={contentVersion} onVersionChange={mockOnVersionChange} />,
  );
}

beforeEach(() => {
  mockReadSession.mockReturnValue({ accessToken: 'tok' });
});

afterEach(() => jest.clearAllMocks());

describe('BeachDetailsEditor — tải chi tiết hiện có', () => {
  it('hiện đúng đường vào đã lưu và nguồn của mùa tham khảo', async () => {
    mockGet.mockResolvedValue({
      ...EMPTY_DETAILS,
      access_route: 'Đường ven biển',
      best_season: 'Tháng 11 đến tháng 4',
      best_season_source: { title: 'Sở Du lịch', url: 'https://example.test/x', verified_at: null },
    });
    renderEditor();
    expect(await screen.findByDisplayValue('Đường ven biển')).toBeInTheDocument();
    expect(screen.getByText(/Nguồn hiện tại: Sở Du lịch/)).toBeInTheDocument();
  });

  it('chưa có hàng chi tiết (null) → các ô trống, không lỗi', async () => {
    mockGet.mockResolvedValue(null);
    renderEditor();
    expect(await screen.findByRole('button', { name: 'Lưu thông tin bãi biển' })).toBeInTheDocument();
    expect(screen.getByLabelText('Đường vào (cách đi tới bãi)')).toHaveValue('');
  });
});

describe('BeachDetailsEditor — lưu có CAS', () => {
  it('gửi đúng expected_content_version, ô trống thành null, rồi báo token mới', async () => {
    mockGet.mockResolvedValue({ ...EMPTY_DETAILS, services: 'Thuê ghế' });
    mockUpdate.mockResolvedValue({ ...EMPTY_DETAILS, services: null, access_route: 'Ngõ 12', content_version: 5 });
    renderEditor(4);

    fireEvent.change(await screen.findByLabelText('Đường vào (cách đi tới bãi)'), { target: { value: '  Ngõ 12  ' } });
    fireEvent.change(screen.getByLabelText('Dịch vụ tại bãi'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin bãi biển' }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockUpdate).toHaveBeenCalledWith(
      'place-1',
      {
        expected_content_version: 4,
        access_route: 'Ngõ 12',
        characteristics: null,
        services: null,
        best_season: null,
        lifeguard_info: null,
      },
      'tok',
    );
    expect(mockOnVersionChange).toHaveBeenCalledWith(5);
    expect(await screen.findByText('Đã lưu thông tin bãi biển.')).toBeInTheDocument();
  });

  it('không nhập nguồn → không tạo nguồn và không gửi source_id', async () => {
    mockGet.mockResolvedValue(EMPTY_DETAILS);
    mockUpdate.mockResolvedValue({ ...EMPTY_DETAILS, content_version: 5 });
    renderEditor();

    fireEvent.click(await screen.findByRole('button', { name: 'Lưu thông tin bãi biển' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockCreateSource).not.toHaveBeenCalled();
    expect(mockUpdate.mock.calls[0][1]).not.toHaveProperty('best_season_source_id');
  });

  it('nhập nguồn mùa tham khảo → tạo nguồn rồi gửi best_season_source_id', async () => {
    mockGet.mockResolvedValue(EMPTY_DETAILS);
    mockCreateSource.mockResolvedValue({ id: 'src-1' });
    mockUpdate.mockResolvedValue({ ...EMPTY_DETAILS, content_version: 5 });
    renderEditor();

    fireEvent.change((await screen.findAllByPlaceholderText('Tên nguồn mới (tuỳ chọn)'))[0], { target: { value: 'Sở Du lịch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin bãi biển' }));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    expect(mockCreateSource).toHaveBeenCalledWith(
      { type: 'official_website', kind: 'url', title: 'Sở Du lịch', url: undefined },
      'tok',
    );
    expect(mockUpdate.mock.calls[0][1]).toMatchObject({ best_season_source_id: 'src-1' });
  });

  it('409 từ CAS → hiện thông báo, giữ nội dung đang nhập, không đổi token', async () => {
    mockGet.mockResolvedValue(EMPTY_DETAILS);
    const { ApiError } = jest.requireActual('@/lib/http');
    mockUpdate.mockRejectedValue(new ApiError('Địa điểm vừa được người khác sửa', 409));
    renderEditor();

    fireEvent.change(await screen.findByLabelText('Đặc điểm bãi'), { target: { value: 'Cát mịn' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin bãi biển' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Địa điểm vừa được người khác sửa');
    expect(mockOnVersionChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Đặc điểm bãi')).toHaveValue('Cát mịn');
  });
  it('PATCH lỗi sau khi đã tạo nguồn → lưu lại cùng nội dung không tạo nguồn thứ hai', async () => {
    mockGet.mockResolvedValue(EMPTY_DETAILS);
    mockCreateSource.mockResolvedValue({ id: 'src-1' });
    const { ApiError } = jest.requireActual('@/lib/http');
    mockUpdate
      .mockRejectedValueOnce(new ApiError('Địa điểm vừa được người khác sửa', 409))
      .mockResolvedValueOnce({ ...EMPTY_DETAILS, content_version: 5 });
    renderEditor();

    fireEvent.change((await screen.findAllByPlaceholderText('Tên nguồn mới (tuỳ chọn)'))[0], { target: { value: 'Sở Du lịch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin bãi biển' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Địa điểm vừa được người khác sửa');

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thông tin bãi biển' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2));
    expect(mockCreateSource).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[1][1]).toMatchObject({ best_season_source_id: 'src-1' });
    expect(await screen.findByText('Đã lưu thông tin bãi biển.')).toBeInTheDocument();
  });
});
