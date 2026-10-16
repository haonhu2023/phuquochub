/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GooglePlaceIdEditor } from './GooglePlaceIdEditor';
import { readSession } from '@/modules/auth/session';
import {
  getExternalIdentifiers,
  upsertGooglePlaceId,
  confirmGooglePlaceId,
  revokeGooglePlaceIdVerification,
} from '@/modules/place-external-identifiers/api/place-external-identifiers.api';
import { createSource } from '@/modules/sources/api/sources.api';
import { ApiError } from '@/lib/http';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('@/modules/place-external-identifiers/api/place-external-identifiers.api', () => ({
  getExternalIdentifiers: jest.fn(),
  upsertGooglePlaceId: jest.fn(),
  confirmGooglePlaceId: jest.fn(),
  revokeGooglePlaceIdVerification: jest.fn(),
}));
jest.mock('@/modules/sources/api/sources.api', () => ({ createSource: jest.fn() }));

const mockReadSession = readSession as jest.Mock;
const mockList = getExternalIdentifiers as jest.Mock;
const mockUpsert = upsertGooglePlaceId as jest.Mock;
const mockCreateSource = createSource as jest.Mock;
const mockConfirm = confirmGooglePlaceId as jest.Mock;
const mockRevoke = revokeGooglePlaceIdVerification as jest.Mock;

const ID_INPUT = 'Google Place ID';
const SAVE_BTN = 'Lưu Google Place ID';
const CONFIRM_BTN = 'Xác nhận khớp địa điểm';
const REVOKE_BTN = 'Thu hồi xác nhận';
const CROSS_CHECK_LINK = 'Mở hồ sơ Google để đối chiếu →';

function unverifiedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ext-1',
    place_id: 'place-1',
    provider: 'GOOGLE_PLACES',
    external_id: 'ChIJ-existing',
    is_primary: true,
    source_id: null,
    evidence_id: null,
    verified_at: null,
    created_at: '2026-10-16T00:00:00Z',
    updated_at: '2026-10-16T00:00:00Z',
    ...overrides,
  };
}

function renderEditor(placeName = 'Bãi Sao') {
  return render(<GooglePlaceIdEditor placeId="place-1" placeName={placeName} />);
}

beforeEach(() => {
  mockReadSession.mockReturnValue({ accessToken: 'tok' });
});

afterEach(() => jest.clearAllMocks());

describe('GooglePlaceIdEditor — nhập/sửa ID', () => {
  it('record chưa có identifier nào → form rỗng, trạng thái "chưa có", KHÔNG hiện khu vực xác nhận', async () => {
    mockList.mockResolvedValue([]);
    renderEditor();
    expect(await screen.findByText(/chưa có/)).toBeInTheDocument();
    expect((screen.getByLabelText(ID_INPUT) as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('button', { name: CONFIRM_BTN })).not.toBeInTheDocument();
  });

  it('record đã có identifier (chưa xác nhận) → tải sẵn giá trị, hiện đúng trạng thái "chưa xác nhận"', async () => {
    mockList.mockResolvedValue([unverifiedRow()]);
    renderEditor();
    expect((await screen.findByLabelText(ID_INPUT) as HTMLInputElement).value).toBe('ChIJ-existing');
    expect(screen.getByText(/CHƯA xác nhận/)).toBeInTheDocument();
  });

  it('lưu một ID mới → PUT đúng external_id, KHÔNG gửi verified_at/is_primary từ client', async () => {
    mockList.mockResolvedValue([]);
    mockUpsert.mockResolvedValue(unverifiedRow({ external_id: 'ChIJ-new' }));
    renderEditor();
    fireEvent.change(await screen.findByLabelText(ID_INPUT), { target: { value: 'ChIJ-new' } });
    fireEvent.click(screen.getByRole('button', { name: SAVE_BTN }));
    await waitFor(() => expect(mockUpsert).toHaveBeenCalledTimes(1));
    expect(mockUpsert).toHaveBeenCalledWith('place-1', { external_id: 'ChIJ-new' }, 'tok');
    expect(await screen.findByRole('status')).toHaveTextContent('CHƯA được xác nhận');
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
    mockUpsert.mockResolvedValue(unverifiedRow({ external_id: 'ChIJ-new', source_id: 'src-9' }));
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

describe('GooglePlaceIdEditor — xác nhận/thu hồi (vai trò riêng)', () => {
  it('đã có ID → hiện link "mở hồ sơ Google để đối chiếu" đúng query_place_id + tên địa điểm, và nút xác nhận; CHƯA xác nhận → KHÔNG hiện nút thu hồi', async () => {
    mockList.mockResolvedValue([unverifiedRow({ external_id: 'ChIJ-cross-check' })]);
    renderEditor('Bãi Sao');
    const link = (await screen.findByRole('link', { name: CROSS_CHECK_LINK })) as HTMLAnchorElement;
    expect(link.href).toContain('query_place_id=ChIJ-cross-check');
    expect(link.href).toContain(encodeURIComponent('Bãi Sao'));
    expect(screen.getByRole('button', { name: CONFIRM_BTN })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: REVOKE_BTN })).not.toBeInTheDocument();
  });

  it('bấm xác nhận → gọi confirmGooglePlaceId, cập nhật trạng thái "đã xác nhận", hiện nút thu hồi', async () => {
    mockList.mockResolvedValue([unverifiedRow()]);
    mockConfirm.mockResolvedValue(unverifiedRow({ verified_at: '2026-10-16T08:00:00Z' }));
    renderEditor();
    fireEvent.click(await screen.findByRole('button', { name: CONFIRM_BTN }));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledTimes(1));
    expect(mockConfirm).toHaveBeenCalledWith('place-1', { expected_external_id: 'ChIJ-existing' }, 'tok');
    expect(await screen.findByRole('status')).toHaveTextContent('Đã xác nhận');
    expect(screen.getByRole('button', { name: REVOKE_BTN })).toBeInTheDocument();
  });

  it('xác nhận 403 (không có quyền PlaceExternalIdentifier.Verify) → báo lỗi rõ ràng, KHÔNG đổi trạng thái', async () => {
    mockList.mockResolvedValue([unverifiedRow()]);
    mockConfirm.mockRejectedValue(new ApiError('Forbidden', 403));
    renderEditor();
    fireEvent.click(await screen.findByRole('button', { name: CONFIRM_BTN }));
    expect(await screen.findByRole('alert')).toHaveTextContent('chỉ vai trò quản trị/kiểm duyệt phù hợp');
    expect(screen.getByText(/CHƯA xác nhận/)).toBeInTheDocument();
  });

  it('xác nhận 409 (ID bị thay giữa lúc tải trang và lúc bấm) → báo lỗi rõ cùng hướng xử lý, KHÔNG đổi trạng thái hiển thị', async () => {
    mockList.mockResolvedValue([unverifiedRow({ external_id: 'ChIJ-stale' })]);
    mockConfirm.mockRejectedValue(new ApiError('ID hiện tại ("ChIJ-new") khác với ID bạn đã đối chiếu ("ChIJ-stale").', 409));
    renderEditor();
    fireEvent.click(await screen.findByRole('button', { name: CONFIRM_BTN }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ChIJ-stale');
    expect(alert).toHaveTextContent('Tải lại trang');
    expect(screen.getByText(/CHƯA xác nhận/)).toBeInTheDocument();
  });

  it('đã xác nhận → bấm thu hồi → gọi revokeGooglePlaceIdVerification, quay lại trạng thái "chưa xác nhận"', async () => {
    mockList.mockResolvedValue([unverifiedRow({ verified_at: '2026-10-16T08:00:00Z' })]);
    mockRevoke.mockResolvedValue(unverifiedRow({ verified_at: null }));
    renderEditor();
    fireEvent.click(await screen.findByRole('button', { name: REVOKE_BTN }));
    await waitFor(() => expect(mockRevoke).toHaveBeenCalledTimes(1));
    expect(mockRevoke).toHaveBeenCalledWith('place-1', { expected_external_id: 'ChIJ-existing' }, 'tok');
    expect(await screen.findByText(/CHƯA xác nhận/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: REVOKE_BTN })).not.toBeInTheDocument();
  });
});

// Lỗi thật phát hiện 16/10/2026 (nghiệm thu Bãi Sao thật: ID lưu thành công, verified_at vẫn null,
// audit_logs KHÔNG có dòng confirm nào — đúng dấu hiệu "request chưa từng rời trình duyệt", trùng
// thời điểm một `auth.refresh.reuse_detected` thật trong log). Trước sửa: bấm Lưu/Xác nhận/Thu hồi
// khi phiên đã mất giữa chừng chỉ `return` im lặng — nút vẫn hiện, bấm "có vẻ hoạt động" nhưng
// không gửi gì, không báo gì. `readSession()` trả session hợp lệ ở lần gọi ĐẦU (tải trang) rồi
// null ở các lần sau — mô phỏng đúng kịch bản phiên mất GIỮA LÚC trang đã tải và lúc bấm nút.
describe('GooglePlaceIdEditor — phiên hết hạn giữa lúc trang đã tải và lúc bấm (không còn im lặng)', () => {
  it('bấm Lưu khi phiên đã mất → báo lỗi rõ, KHÔNG gọi API, KHÔNG im lặng', async () => {
    mockList.mockResolvedValue([]);
    mockReadSession.mockReturnValueOnce({ accessToken: 'tok' }).mockReturnValue(null);
    renderEditor();
    fireEvent.change(await screen.findByLabelText(ID_INPUT), { target: { value: 'ChIJ-new' } });
    fireEvent.click(screen.getByRole('button', { name: SAVE_BTN }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Phiên đăng nhập đã hết hạn');
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('bấm Xác nhận khi phiên đã mất → báo lỗi rõ, KHÔNG gọi API, KHÔNG im lặng', async () => {
    mockList.mockResolvedValue([unverifiedRow()]);
    mockReadSession.mockReturnValueOnce({ accessToken: 'tok' }).mockReturnValue(null);
    renderEditor();
    fireEvent.click(await screen.findByRole('button', { name: CONFIRM_BTN }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Phiên đăng nhập đã hết hạn');
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('bấm Thu hồi khi phiên đã mất → báo lỗi rõ, KHÔNG gọi API, KHÔNG im lặng', async () => {
    mockList.mockResolvedValue([unverifiedRow({ verified_at: '2026-10-16T08:00:00Z' })]);
    mockReadSession.mockReturnValueOnce({ accessToken: 'tok' }).mockReturnValue(null);
    renderEditor();
    fireEvent.click(await screen.findByRole('button', { name: REVOKE_BTN }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Phiên đăng nhập đã hết hạn');
    expect(mockRevoke).not.toHaveBeenCalled();
  });
});
