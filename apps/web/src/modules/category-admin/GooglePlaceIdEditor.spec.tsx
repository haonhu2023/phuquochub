/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GooglePlaceIdEditor } from './GooglePlaceIdEditor';
import { readSession } from '@/modules/auth/session';
import { getExternalIdentifiers, upsertGooglePlaceId } from '@/modules/place-external-identifiers/api/place-external-identifiers.api';
import { createSource } from '@/modules/sources/api/sources.api';
import { ApiError } from '@/lib/http';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('@/modules/place-external-identifiers/api/place-external-identifiers.api', () => ({
  getExternalIdentifiers: jest.fn(),
  upsertGooglePlaceId: jest.fn(),
}));
jest.mock('@/modules/sources/api/sources.api', () => ({ createSource: jest.fn() }));

const mockReadSession = readSession as jest.Mock;
const mockList = getExternalIdentifiers as jest.Mock;
const mockUpsert = upsertGooglePlaceId as jest.Mock;
const mockCreateSource = createSource as jest.Mock;

const ID_INPUT = 'Google Place ID';
const SAVE_BTN = 'Lưu Google Place ID';

function renderEditor() {
  return render(<GooglePlaceIdEditor placeId="place-1" />);
}

beforeEach(() => {
  mockReadSession.mockReturnValue({ accessToken: 'tok' });
});

afterEach(() => jest.clearAllMocks());

describe('GooglePlaceIdEditor', () => {
  it('record chưa có identifier nào → form rỗng, trạng thái "chưa có" (vẫn hoạt động bình thường)', async () => {
    mockList.mockResolvedValue([]);
    renderEditor();
    expect(await screen.findByText(/chưa có/)).toBeInTheDocument();
    expect((screen.getByLabelText(ID_INPUT) as HTMLInputElement).value).toBe('');
  });

  it('record đã có identifier (chưa xác minh) → tải sẵn giá trị, hiện đúng trạng thái "chưa xác minh"', async () => {
    mockList.mockResolvedValue([
      { id: 'ext-1', place_id: 'place-1', provider: 'GOOGLE_PLACES', external_id: 'ChIJ-existing', is_primary: true, source_id: null, evidence_id: null, verified_at: null, created_at: '2026-10-16T00:00:00Z', updated_at: '2026-10-16T00:00:00Z' },
    ]);
    renderEditor();
    expect((await screen.findByLabelText(ID_INPUT) as HTMLInputElement).value).toBe('ChIJ-existing');
    expect(screen.getByText(/CHƯA xác minh/)).toBeInTheDocument();
  });

  it('lưu một ID mới → PUT đúng external_id, KHÔNG gửi verified_at/is_primary từ client', async () => {
    mockList.mockResolvedValue([]);
    mockUpsert.mockResolvedValue({ id: 'ext-1', place_id: 'place-1', provider: 'GOOGLE_PLACES', external_id: 'ChIJ-new', is_primary: true, source_id: null, evidence_id: null, verified_at: null, created_at: '2026-10-16T00:00:00Z', updated_at: '2026-10-16T00:00:00Z' });
    renderEditor();
    fireEvent.change(await screen.findByLabelText(ID_INPUT), { target: { value: 'ChIJ-new' } });
    fireEvent.click(screen.getByRole('button', { name: SAVE_BTN }));
    await waitFor(() => expect(mockUpsert).toHaveBeenCalledTimes(1));
    expect(mockUpsert).toHaveBeenCalledWith('place-1', { external_id: 'ChIJ-new' }, 'tok');
    expect(await screen.findByRole('status')).toHaveTextContent('CHƯA được xác minh');
  });

  it('để trống → không gửi, báo lỗi yêu cầu nhập ID', async () => {
    mockList.mockResolvedValue([]);
    renderEditor();
    await screen.findByLabelText(ID_INPUT);
    fireEvent.click(screen.getByRole('button', { name: SAVE_BTN }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nhập Google Place ID');
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('điền tiêu đề/URL nguồn → tạo Source trước, gửi source_id kèm identifier', async () => {
    mockList.mockResolvedValue([]);
    mockCreateSource.mockResolvedValue({ id: 'src-9' });
    mockUpsert.mockResolvedValue({ id: 'ext-1', place_id: 'place-1', provider: 'GOOGLE_PLACES', external_id: 'ChIJ-new', is_primary: true, source_id: 'src-9', evidence_id: null, verified_at: null, created_at: '2026-10-16T00:00:00Z', updated_at: '2026-10-16T00:00:00Z' });
    renderEditor();
    fireEvent.change(await screen.findByLabelText(ID_INPUT), { target: { value: 'ChIJ-new' } });
    fireEvent.change(screen.getByLabelText(/Nguồn\/bằng chứng — URL/), { target: { value: 'https://maps.google.com/x' } });
    fireEvent.click(screen.getByRole('button', { name: SAVE_BTN }));
    await waitFor(() => expect(mockUpsert).toHaveBeenCalledTimes(1));
    expect(mockUpsert).toHaveBeenCalledWith('place-1', { external_id: 'ChIJ-new', source_id: 'src-9' }, 'tok');
  });

  it('409 (conflict — ID đã thuộc place khác) → giữ nội dung đang nhập, hiện lỗi', async () => {
    mockList.mockResolvedValue([]);
    mockUpsert.mockRejectedValue(new ApiError('Identifier đã thuộc địa điểm khác.', 400));
    renderEditor();
    fireEvent.change(await screen.findByLabelText(ID_INPUT), { target: { value: 'ChIJ-taken' } });
    fireEvent.click(screen.getByRole('button', { name: SAVE_BTN }));
    expect(await screen.findByRole('alert')).toHaveTextContent('thuộc địa điểm khác');
    expect((screen.getByLabelText(ID_INPUT) as HTMLInputElement).value).toBe('ChIJ-taken');
  });
});
