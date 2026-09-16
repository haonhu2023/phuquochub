/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlaceDescriptionEditor } from './PlaceDescriptionEditor';
import { useAuth } from '@/modules/auth/AuthProvider';
import { readSession } from '@/modules/auth/session';
import { fetchCapabilities } from '@/modules/auth/api/me.api';
import { NO_CAPABILITIES, type UserCapabilities } from '@/modules/auth/capabilities';
import { getDescriptionDraft, publishDescriptionDraft, saveDescriptionDraft } from './api/place-description.api';
import { ApiError } from '@/lib/http';

jest.mock('@/modules/auth/AuthProvider');
jest.mock('@/modules/auth/session');
jest.mock('@/modules/auth/api/me.api');
jest.mock('./api/place-description.api');

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockReadSession = readSession as jest.MockedFunction<typeof readSession>;
const mockFetchCapabilities = fetchCapabilities as jest.MockedFunction<typeof fetchCapabilities>;
const mockGetDraft = getDescriptionDraft as jest.MockedFunction<typeof getDescriptionDraft>;
const mockSaveDraft = saveDescriptionDraft as jest.MockedFunction<typeof saveDescriptionDraft>;
const mockPublishDraft = publishDescriptionDraft as jest.MockedFunction<typeof publishDescriptionDraft>;

const SESSION = {
  accessToken: 'token-abc',
  refreshToken: 'refresh-abc',
  expiresAt: Date.now() + 900_000,
  user: { id: 'u1', email: 'owner@phuquochub.com', displayName: 'Owner', avatarUrl: null },
};

const EDITORIAL_CAPS: UserCapabilities = {
  canEditorial: true,
  canModerate: false,
  canReviewTranslations: true,
  canSelfApproveOwnMedia: true,
};

function authed() {
  mockUseAuth.mockReturnValue({
    user: SESSION.user,
    initializing: false,
    isAuthenticated: true,
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
  });
  mockReadSession.mockReturnValue(SESSION);
}

describe('PlaceDescriptionEditor — nút ✏️ + drawer sửa mô tả VI/EN (content_owner, 2026-09-16)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('chưa đăng nhập -> KHÔNG render gì (không nút, không drawer)', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      initializing: false,
      isAuthenticated: false,
      login: jest.fn(),
      register: jest.fn(),
      logout: jest.fn(),
    });

    const { container } = render(<PlaceDescriptionEditor placeId="p1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('đã đăng nhập nhưng KHÔNG có canEditorial (vd member thường) -> KHÔNG render nút', async () => {
    authed();
    mockFetchCapabilities.mockResolvedValue(NO_CAPABILITIES);

    const { container } = render(<PlaceDescriptionEditor placeId="p1" />);

    await waitFor(() => expect(mockFetchCapabilities).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('content_owner (canEditorial=true) -> HIỆN nút ✏️', async () => {
    authed();
    mockFetchCapabilities.mockResolvedValue(EDITORIAL_CAPS);

    render(<PlaceDescriptionEditor placeId="p1" />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Sửa mô tả' })).toBeInTheDocument());
  });

  it('bấm ✏️ -> tải bản nháp, điền sẵn vi/en (vi rơi về fallback_description nếu chưa có bản dịch)', async () => {
    authed();
    mockFetchCapabilities.mockResolvedValue(EDITORIAL_CAPS);
    mockGetDraft.mockResolvedValue({
      fallback_description: 'Mô tả gốc places.description',
      vi: null,
      en: null,
    });

    render(<PlaceDescriptionEditor placeId="p1" />);
    await waitFor(() => screen.getByRole('button', { name: 'Sửa mô tả' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sửa mô tả' }));

    await waitFor(() => expect(mockGetDraft).toHaveBeenCalledWith('p1', 'token-abc'));
    const viField = await screen.findByDisplayValue('Mô tả gốc places.description');
    expect(viField).toBeInTheDocument();
  });

  it('Lưu nháp -> gọi saveDescriptionDraft, hiện thông báo "CHƯA hiển thị công khai", KHÔNG gọi publish', async () => {
    authed();
    mockFetchCapabilities.mockResolvedValue(EDITORIAL_CAPS);
    mockGetDraft.mockResolvedValue({ fallback_description: null, vi: null, en: null });
    mockSaveDraft.mockResolvedValue([]);

    render(<PlaceDescriptionEditor placeId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa mô tả' }));
    await screen.findByLabelText('Mô tả (Tiếng Việt)');

    fireEvent.change(screen.getByLabelText('Mô tả (Tiếng Việt)'), { target: { value: 'VI mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));

    await waitFor(() =>
      expect(mockSaveDraft).toHaveBeenCalledWith('p1', { vi: 'VI mới', en: undefined }, 'token-abc'),
    );
    expect(await screen.findByText(/CHƯA hiển thị công khai/)).toBeInTheDocument();
    expect(mockPublishDraft).not.toHaveBeenCalled();
  });

  it('Lưu và công khai -> lưu nháp RỒI publish, hiện thông báo thành công khi mọi locale ok', async () => {
    authed();
    mockFetchCapabilities.mockResolvedValue(EDITORIAL_CAPS);
    mockGetDraft.mockResolvedValue({ fallback_description: null, vi: null, en: null });
    mockSaveDraft.mockResolvedValue([]);
    mockPublishDraft.mockResolvedValue([
      { locale_code: 'vi', ok: true },
      { locale_code: 'en', ok: true },
    ]);

    render(<PlaceDescriptionEditor placeId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa mô tả' }));
    await screen.findByLabelText('Mô tả (Tiếng Việt)');

    fireEvent.change(screen.getByLabelText('Mô tả (Tiếng Việt)'), { target: { value: 'VI công khai' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và công khai' }));

    await waitFor(() => expect(mockSaveDraft).toHaveBeenCalled());
    await waitFor(() => expect(mockPublishDraft).toHaveBeenCalledWith('p1', 'token-abc'));
    expect(await screen.findByText(/Đã công khai/)).toBeInTheDocument();
  });

  it('publish MỘT PHẦN lỗi (vd en fail) -> báo RÕ locale nào lỗi, không nói "đã công khai" chung chung', async () => {
    authed();
    mockFetchCapabilities.mockResolvedValue(EDITORIAL_CAPS);
    mockGetDraft.mockResolvedValue({ fallback_description: null, vi: null, en: null });
    mockSaveDraft.mockResolvedValue([]);
    mockPublishDraft.mockResolvedValue([
      { locale_code: 'vi', ok: true },
      { locale_code: 'en', ok: false, error: 'boom' },
    ]);

    render(<PlaceDescriptionEditor placeId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa mô tả' }));
    await screen.findByLabelText('Mô tả (Tiếng Việt)');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và công khai' }));

    expect(await screen.findByText(/Công khai MỘT PHẦN.*EN/)).toBeInTheDocument();
  });

  it('lỗi 403 khi tải bản nháp -> báo đúng "không có quyền", không crash', async () => {
    authed();
    mockFetchCapabilities.mockResolvedValue(EDITORIAL_CAPS);
    mockGetDraft.mockRejectedValue(new ApiError('Thiếu quyền', 403));

    render(<PlaceDescriptionEditor placeId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa mô tả' }));

    expect(await screen.findByText(/không có quyền sửa mô tả/)).toBeInTheDocument();
  });

  it('Xem trước -> hiện đúng nội dung vi/en hiện tại trong ô soạn thảo, không gọi API nào thêm', async () => {
    authed();
    mockFetchCapabilities.mockResolvedValue(EDITORIAL_CAPS);
    mockGetDraft.mockResolvedValue({ fallback_description: null, vi: null, en: null });

    render(<PlaceDescriptionEditor placeId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa mô tả' }));
    await screen.findByLabelText('Mô tả (Tiếng Việt)');
    fireEvent.change(screen.getByLabelText('Mô tả (Tiếng Việt)'), { target: { value: 'Xem thử VI' } });

    fireEvent.click(screen.getByRole('button', { name: 'Xem trước' }));

    // "Xem thử VI" now appears twice (the textarea's own value + the preview box) — scope to the
    // preview paragraph specifically rather than a bare getByText (which would fail on ambiguity).
    expect(screen.getByText((_, el) => el?.textContent === 'VI: Xem thử VI')).toBeInTheDocument();
    expect(mockSaveDraft).not.toHaveBeenCalled();
    expect(mockPublishDraft).not.toHaveBeenCalled();
  });
});
