/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlaceDescriptionEditor } from './PlaceDescriptionEditor';
import { useAuth } from '@/modules/auth/AuthProvider';
import { readSession } from '@/modules/auth/session';
import { fetchCapabilities } from '@/modules/auth/api/me.api';
import { NO_CAPABILITIES, type UserCapabilities } from '@/modules/auth/capabilities';
import {
  getDescriptionDraft,
  getNameDraft,
  getShortDescriptionDraft,
  publishDescriptionDraft,
  publishNameDraft,
  publishShortDescriptionDraft,
  saveDescriptionDraft,
  saveNameDraft,
  saveShortDescriptionDraft,
} from './api/place-description.api';
import { ApiError } from '@/lib/http';

jest.mock('@/modules/auth/AuthProvider');
jest.mock('@/modules/auth/session');
jest.mock('@/modules/auth/api/me.api');
jest.mock('./api/place-description.api');

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockReadSession = readSession as jest.MockedFunction<typeof readSession>;
const mockFetchCapabilities = fetchCapabilities as jest.MockedFunction<typeof fetchCapabilities>;
const mockGetName = getNameDraft as jest.MockedFunction<typeof getNameDraft>;
const mockGetShortDescription = getShortDescriptionDraft as jest.MockedFunction<typeof getShortDescriptionDraft>;
const mockGetDescription = getDescriptionDraft as jest.MockedFunction<typeof getDescriptionDraft>;
const mockSaveName = saveNameDraft as jest.MockedFunction<typeof saveNameDraft>;
const mockSaveShortDescription = saveShortDescriptionDraft as jest.MockedFunction<typeof saveShortDescriptionDraft>;
const mockSaveDescription = saveDescriptionDraft as jest.MockedFunction<typeof saveDescriptionDraft>;
const mockPublishName = publishNameDraft as jest.MockedFunction<typeof publishNameDraft>;
const mockPublishShortDescription = publishShortDescriptionDraft as jest.MockedFunction<typeof publishShortDescriptionDraft>;
const mockPublishDescription = publishDescriptionDraft as jest.MockedFunction<typeof publishDescriptionDraft>;

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
  canEditGuides: false,
  canEditSiteContent: false,
  canViewBackupStatus: false,
};

function authed() {
  mockUseAuth.mockReturnValue({
    user: SESSION.user,
    initializing: false,
    isAuthenticated: true,
    login: jest.fn(),
    register: jest.fn(),
    logout: jest.fn(),
    sessionExpired: false,
  });
  mockReadSession.mockReturnValue(SESSION);
}

function mockEmptyDrafts() {
  mockGetName.mockResolvedValue({ fallback_name: null, vi: null, en: null });
  mockGetShortDescription.mockResolvedValue({ fallback_short_description: null, vi: null, en: null });
  mockGetDescription.mockResolvedValue({ fallback_description: null, vi: null, en: null });
  mockSaveName.mockResolvedValue([]);
  mockSaveShortDescription.mockResolvedValue([]);
  mockSaveDescription.mockResolvedValue([]);
  mockPublishName.mockResolvedValue([{ locale_code: 'vi', ok: true }, { locale_code: 'en', ok: true }]);
  mockPublishShortDescription.mockResolvedValue([{ locale_code: 'vi', ok: true }, { locale_code: 'en', ok: true }]);
  mockPublishDescription.mockResolvedValue([{ locale_code: 'vi', ok: true }, { locale_code: 'en', ok: true }]);
}

describe('PlaceDescriptionEditor — nút ✏️ + drawer sửa nội dung (tên/mô tả ngắn/mô tả, VI/EN) (content_owner)', () => {
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
      sessionExpired: false,
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

    await waitFor(() => expect(screen.getByRole('button', { name: 'Sửa nội dung' })).toBeInTheDocument());
  });

  it('bấm ✏️ -> tải CẢ BA bản nháp (name/short_description/description), điền sẵn vi theo fallback tương ứng', async () => {
    authed();
    mockFetchCapabilities.mockResolvedValue(EDITORIAL_CAPS);
    mockGetName.mockResolvedValue({ fallback_name: 'Tên gốc', vi: null, en: null });
    mockGetShortDescription.mockResolvedValue({ fallback_short_description: 'Ngắn gốc', vi: null, en: null });
    mockGetDescription.mockResolvedValue({ fallback_description: 'Mô tả gốc', vi: null, en: null });

    render(<PlaceDescriptionEditor placeId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa nội dung' }));

    await waitFor(() => expect(mockGetName).toHaveBeenCalledWith('p1', 'token-abc'));
    expect(mockGetShortDescription).toHaveBeenCalledWith('p1', 'token-abc');
    expect(mockGetDescription).toHaveBeenCalledWith('p1', 'token-abc');
    expect(await screen.findByDisplayValue('Tên gốc')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ngắn gốc')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Mô tả gốc')).toBeInTheDocument();
  });

  it('Lưu nháp -> gọi CẢ BA saveXDraft, hiện thông báo "CHƯA hiển thị công khai", KHÔNG gọi publish nào', async () => {
    authed();
    mockFetchCapabilities.mockResolvedValue(EDITORIAL_CAPS);
    mockEmptyDrafts();

    render(<PlaceDescriptionEditor placeId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa nội dung' }));
    await screen.findByLabelText('Mô tả chi tiết (Tiếng Việt)');

    fireEvent.change(screen.getByLabelText('Mô tả chi tiết (Tiếng Việt)'), { target: { value: 'VI mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));

    await waitFor(() =>
      expect(mockSaveDescription).toHaveBeenCalledWith('p1', { vi: 'VI mới', en: undefined }, 'token-abc'),
    );
    expect(mockSaveName).toHaveBeenCalled();
    expect(mockSaveShortDescription).toHaveBeenCalled();
    expect(await screen.findByText(/CHƯA hiển thị công khai/)).toBeInTheDocument();
    expect(mockPublishName).not.toHaveBeenCalled();
    expect(mockPublishShortDescription).not.toHaveBeenCalled();
    expect(mockPublishDescription).not.toHaveBeenCalled();
  });

  it('Lưu và công khai -> lưu nháp RỒI publish CẢ BA trường, hiện thông báo thành công khi mọi trường/locale ok', async () => {
    authed();
    mockFetchCapabilities.mockResolvedValue(EDITORIAL_CAPS);
    mockEmptyDrafts();

    render(<PlaceDescriptionEditor placeId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa nội dung' }));
    await screen.findByLabelText('Mô tả chi tiết (Tiếng Việt)');

    fireEvent.change(screen.getByLabelText('Mô tả chi tiết (Tiếng Việt)'), { target: { value: 'VI công khai' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và công khai' }));

    await waitFor(() => expect(mockSaveDescription).toHaveBeenCalled());
    await waitFor(() => expect(mockPublishName).toHaveBeenCalledWith('p1', 'token-abc'));
    expect(mockPublishShortDescription).toHaveBeenCalledWith('p1', 'token-abc');
    expect(mockPublishDescription).toHaveBeenCalledWith('p1', 'token-abc');
    expect(await screen.findByText(/Đã công khai/)).toBeInTheDocument();
  });

  it('publish MỘT PHẦN lỗi (vd EN của mô tả chi tiết fail) -> báo RÕ trường + locale nào lỗi', async () => {
    authed();
    mockFetchCapabilities.mockResolvedValue(EDITORIAL_CAPS);
    mockEmptyDrafts();
    mockPublishDescription.mockResolvedValue([
      { locale_code: 'vi', ok: true },
      { locale_code: 'en', ok: false, error: 'boom' },
    ]);

    render(<PlaceDescriptionEditor placeId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa nội dung' }));
    await screen.findByLabelText('Mô tả chi tiết (Tiếng Việt)');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và công khai' }));

    expect(await screen.findByText(/Công khai MỘT PHẦN.*Mô tả chi tiết.*EN/)).toBeInTheDocument();
  });

  it('một trường lỗi khi tải (vd getNameDraft 403) -> báo đúng "không có quyền", không crash', async () => {
    authed();
    mockFetchCapabilities.mockResolvedValue(EDITORIAL_CAPS);
    mockGetName.mockRejectedValue(new ApiError('Thiếu quyền', 403));
    mockGetShortDescription.mockResolvedValue({ fallback_short_description: null, vi: null, en: null });
    mockGetDescription.mockResolvedValue({ fallback_description: null, vi: null, en: null });

    render(<PlaceDescriptionEditor placeId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa nội dung' }));

    expect(await screen.findByText(/không có quyền sửa nội dung/)).toBeInTheDocument();
  });

  it('Xem trước -> hiện đúng nội dung vi/en hiện tại của CẢ BA trường, không gọi API ghi nào', async () => {
    authed();
    mockFetchCapabilities.mockResolvedValue(EDITORIAL_CAPS);
    mockEmptyDrafts();

    render(<PlaceDescriptionEditor placeId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa nội dung' }));
    await screen.findByLabelText('Mô tả chi tiết (Tiếng Việt)');
    fireEvent.change(screen.getByLabelText('Mô tả chi tiết (Tiếng Việt)'), { target: { value: 'Xem thử VI' } });

    fireEvent.click(screen.getByRole('button', { name: 'Xem trước' }));

    expect(screen.getByText((_, el) => el?.textContent === 'Mô tả chi tiết — VI: Xem thử VI')).toBeInTheDocument();
    expect(mockSaveDescription).not.toHaveBeenCalled();
    expect(mockPublishDescription).not.toHaveBeenCalled();
  });
});
