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
  canViewCommandCenter: false,
  canViewOwnerTodo: false,
  canReviewPlaceEditProposals: false,
  canVerifyPrices: false,
  canReviewJobListings: false,
  canReviewRealEstateListings: false,
  canReviewOpeningHoursEvidence: false,
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

  it('trong dashboard bãi biển: gợi ý biên tập đúng bãi biển và mở editor VI/EN thật', async () => {
    authed();
    mockFetchCapabilities.mockResolvedValue(EDITORIAL_CAPS);
    mockEmptyDrafts();
    render(<PlaceDescriptionEditor placeId="p1" categorySlug="beach" triggerLabel="Sửa tên và mô tả VI/EN" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa tên và mô tả VI/EN' }));
    expect(await screen.findByText(/Gợi ý cho bãi biển/)).toBeInTheDocument();
    expect(screen.getAllByText(/cách tiếp cận/).length).toBeGreaterThan(0);
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

  it('Lưu nháp -> chỉ lưu trường ĐÃ SỬA (không gọi save cho trường không sửa), CHƯA công khai, KHÔNG gọi publish', async () => {
    authed();
    mockFetchCapabilities.mockResolvedValue(EDITORIAL_CAPS);
    mockEmptyDrafts();

    render(<PlaceDescriptionEditor placeId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa nội dung' }));
    await screen.findByLabelText('Mô tả chi tiết (Tiếng Việt)');

    fireEvent.change(screen.getByLabelText('Mô tả chi tiết (Tiếng Việt)'), { target: { value: 'VI mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));

    await waitFor(() =>
      expect(mockSaveDescription).toHaveBeenCalledWith('p1', { vi: 'VI mới', expected_vi_id: null }, 'token-abc'),
    );
    expect(mockSaveName).not.toHaveBeenCalled();
    expect(mockSaveShortDescription).not.toHaveBeenCalled();
    expect(await screen.findByText(/CHƯA hiển thị công khai/)).toBeInTheDocument();
    expect(mockPublishName).not.toHaveBeenCalled();
    expect(mockPublishShortDescription).not.toHaveBeenCalled();
    expect(mockPublishDescription).not.toHaveBeenCalled();
  });

  it('Lưu và công khai -> chỉ lưu và công khai trường ĐÃ SỬA, đúng bản VI theo id; EN không được công khai khi chưa chọn', async () => {
    authed();
    mockPublishDescription.mockResolvedValue([{ locale_code: 'vi', ok: true }]);
    mockFetchCapabilities.mockResolvedValue(EDITORIAL_CAPS);
    mockEmptyDrafts();
    mockSaveDescription.mockResolvedValue([{ id: 't-desc-vi', locale_code: 'vi', human_review_status: 'PENDING' }]);

    render(<PlaceDescriptionEditor placeId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa nội dung' }));
    await screen.findByLabelText('Mô tả chi tiết (Tiếng Việt)');

    fireEvent.change(screen.getByLabelText('Mô tả chi tiết (Tiếng Việt)'), { target: { value: 'VI công khai' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và công khai' }));

    await waitFor(() => expect(mockPublishDescription).toHaveBeenCalledWith('p1', { vi_translation_id: 't-desc-vi' }, 'token-abc'));
    expect(mockPublishDescription.mock.calls[0][1]).not.toHaveProperty('en_translation_id');
    expect(mockPublishName).not.toHaveBeenCalled();
    expect(mockPublishShortDescription).not.toHaveBeenCalled();
    expect(await screen.findByText(/Đã công khai: Mô tả chi tiết \(VI\)\./)).toBeInTheDocument();
    expect(screen.getByText(/Bản tiếng Anh chưa được công khai/)).toBeInTheDocument();
  });

  it('publish MỘT PHẦN lỗi (vd VI của mô tả chi tiết fail) -> báo RÕ trường + locale nào lỗi', async () => {
    authed();
    mockFetchCapabilities.mockResolvedValue(EDITORIAL_CAPS);
    mockEmptyDrafts();
    mockSaveDescription.mockResolvedValue([{ id: 't-desc-vi', locale_code: 'vi', human_review_status: 'PENDING' }]);
    mockPublishDescription.mockResolvedValue([{ locale_code: 'vi', ok: false, error: 'boom' }]);

    render(<PlaceDescriptionEditor placeId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa nội dung' }));
    await screen.findByLabelText('Mô tả chi tiết (Tiếng Việt)');
    fireEvent.change(screen.getByLabelText('Mô tả chi tiết (Tiếng Việt)'), { target: { value: 'VI lỗi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và công khai' }));

    expect(await screen.findByText(/Chưa áp dụng: Mô tả chi tiết \(VI\): lỗi khi công khai/)).toBeInTheDocument();
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

describe('PlaceDescriptionEditor — VI/EN và lỗi một phần', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: SESSION.user, initializing: false, isAuthenticated: true, accessToken: 'token-abc' } as never);
    mockFetchCapabilities.mockResolvedValue(EDITORIAL_CAPS);
    mockEmptyDrafts();
  });

  async function openAndEditDescription(vi: string, en?: string) {
    render(<PlaceDescriptionEditor placeId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa nội dung' }));
    await screen.findByLabelText('Mô tả chi tiết (Tiếng Việt)');
    fireEvent.change(screen.getByLabelText('Mô tả chi tiết (Tiếng Việt)'), { target: { value: vi } });
    if (en !== undefined) fireEvent.change(screen.getByLabelText('Mô tả chi tiết (English)'), { target: { value: en } });
  }

  it('lưu nháp bị 409 (bản đã đổi) -> nội dung người dùng nhập còn nguyên và báo rõ chưa lưu', async () => {
    mockSaveDescription.mockRejectedValue(new ApiError('conflict', 409, 'CONFLICT'));
    await openAndEditDescription('VI giữ lại');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    expect(await screen.findByText(/Chưa lưu: Mô tả chi tiết: bản đã đổi sau khi bạn đọc/)).toBeInTheDocument();
    expect(screen.getByLabelText('Mô tả chi tiết (Tiếng Việt)')).toHaveValue('VI giữ lại');
    expect(mockPublishDescription).not.toHaveBeenCalled();
  });

  it('EN chưa chọn -> công khai chỉ VI; chọn EN -> gửi cả hai id và thông báo nêu đúng hai locale', async () => {
    mockSaveDescription.mockResolvedValue([
      { id: 't-desc-vi', locale_code: 'vi', human_review_status: 'PENDING' },
      { id: 't-desc-en', locale_code: 'en', human_review_status: 'PENDING' },
    ]);
    mockPublishDescription.mockResolvedValue([
      { locale_code: 'vi', ok: true },
      { locale_code: 'en', ok: true },
    ]);
    await openAndEditDescription('VI A', 'EN A');
    fireEvent.click(screen.getByLabelText(/Công khai tiếng Anh/));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và công khai' }));
    await waitFor(() =>
      expect(mockPublishDescription).toHaveBeenCalledWith(
        'p1',
        { vi_translation_id: 't-desc-vi', en_translation_id: 't-desc-en' },
        'token-abc',
      ),
    );
    expect(await screen.findByText(/Đã công khai: Mô tả chi tiết \(VI\), Mô tả chi tiết \(EN\)\./)).toBeInTheDocument();
  });

  it('lỗi một phần: VI công khai, EN bị 409 -> báo đúng phần đã và chưa áp dụng; nội dung EN còn trong ô', async () => {
    mockSaveDescription.mockResolvedValue([
      { id: 't-desc-vi', locale_code: 'vi', human_review_status: 'PENDING' },
      { id: 't-desc-en', locale_code: 'en', human_review_status: 'PENDING' },
    ]);
    mockPublishDescription.mockResolvedValue([
      { locale_code: 'vi', ok: true },
      { locale_code: 'en', ok: false, status: 409, error: 'superseded' },
    ]);
    await openAndEditDescription('VI B', 'EN B');
    fireEvent.click(screen.getByLabelText(/Công khai tiếng Anh/));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và công khai' }));
    expect(await screen.findByText(/Đã công khai: Mô tả chi tiết \(VI\)\./)).toBeInTheDocument();
    expect(screen.getByText(/Chưa áp dụng: Mô tả chi tiết \(EN\): bản đã đổi sau khi bạn đọc/)).toBeInTheDocument();
    expect(screen.getByLabelText('Mô tả chi tiết (English)')).toHaveValue('EN B');
  });
});

describe('PlaceDescriptionEditor — bản nháp hiện hành, retry và lỗi một phần', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: SESSION.user, initializing: false, isAuthenticated: true, accessToken: 'token-abc' } as never);
    mockFetchCapabilities.mockResolvedValue(EDITORIAL_CAPS);
    mockEmptyDrafts();
  });

  const slot = (id: string, text: string, status: string, locale: 'vi' | 'en' = 'vi') => ({
    id,
    text,
    human_review_status: status,
    is_public: false,
    locale,
  });

  async function openDescription() {
    render(<PlaceDescriptionEditor placeId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa nội dung' }));
    await screen.findByLabelText('Mô tả chi tiết (Tiếng Việt)');
  }

  it('tải lại editor có bản nháp VI đang chờ duyệt, không sửa gì -> Công khai vẫn duyệt đúng bản đó (không bị bỏ qua)', async () => {
    mockGetDescription.mockResolvedValue({
      fallback_description: null,
      vi: { id: 't-vi-old', text: 'VI đang chờ', human_review_status: 'PENDING', is_public: false },
      en: null,
    });
    mockPublishDescription.mockResolvedValue([{ locale_code: 'vi', ok: true }]);
    await openDescription();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và công khai' }));
    await waitFor(() => expect(mockPublishDescription).toHaveBeenCalledWith('p1', { vi_translation_id: 't-vi-old' }, 'token-abc'));
    expect(mockSaveDescription).not.toHaveBeenCalled();
    expect(await screen.findByText(/Đã công khai: Mô tả chi tiết \(VI\)\./)).toBeInTheDocument();
  });

  it('không sửa và không có bản nháp đang chờ -> không lưu, không công khai, báo rõ không có thay đổi', async () => {
    mockGetDescription.mockResolvedValue({
      fallback_description: null,
      vi: { id: 't-vi-live', text: 'VI đã công khai', human_review_status: 'APPROVED', is_public: true },
      en: null,
    });
    await openDescription();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và công khai' }));
    expect(await screen.findByText(/Không có thay đổi để công khai\./)).toBeInTheDocument();
    expect(mockSaveDescription).not.toHaveBeenCalled();
    expect(mockPublishDescription).not.toHaveBeenCalled();
    expect(mockSaveName).not.toHaveBeenCalled();
    expect(mockSaveShortDescription).not.toHaveBeenCalled();
  });

  it('chọn công khai EN đã lưu nháp từ trước (không sửa EN) -> chỉ gửi en_translation_id; VI đã duyệt không bị gửi lại', async () => {
    mockGetDescription.mockResolvedValue({
      fallback_description: null,
      vi: { id: 't-vi-live', text: 'VI đã duyệt', human_review_status: 'APPROVED', is_public: true },
      en: { id: 't-en-draft', text: 'EN nháp', human_review_status: 'PENDING', is_public: false },
    });
    mockPublishDescription.mockResolvedValue([{ locale_code: 'en', ok: true }]);
    await openDescription();
    fireEvent.click(screen.getByLabelText(/Công khai tiếng Anh/));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và công khai' }));
    await waitFor(() => expect(mockPublishDescription).toHaveBeenCalledWith('p1', { en_translation_id: 't-en-draft' }, 'token-abc'));
    expect(mockPublishDescription.mock.calls[0][1]).not.toHaveProperty('vi_translation_id');
    expect(mockSaveDescription).not.toHaveBeenCalled();
    expect(await screen.findByText(/Đã công khai: Mô tả chi tiết \(EN\)\./)).toBeInTheDocument();
  });

  it('EN có bản nháp chờ nhưng chưa chọn công khai EN -> EN không được gửi, và VI đã sửa chỉ công khai VI', async () => {
    mockGetDescription.mockResolvedValue({
      fallback_description: null,
      vi: null,
      en: { id: 't-en-draft', text: 'EN nháp', human_review_status: 'PENDING', is_public: false },
    });
    mockSaveDescription.mockResolvedValue([{ id: 't-vi-new', locale_code: 'vi', human_review_status: 'PENDING' }]);
    mockPublishDescription.mockResolvedValue([{ locale_code: 'vi', ok: true }]);
    await openDescription();
    fireEvent.change(screen.getByLabelText('Mô tả chi tiết (Tiếng Việt)'), { target: { value: 'VI mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và công khai' }));
    await waitFor(() => expect(mockPublishDescription).toHaveBeenCalledWith('p1', { vi_translation_id: 't-vi-new' }, 'token-abc'));
    expect(mockPublishDescription.mock.calls[0][1]).not.toHaveProperty('en_translation_id');
    expect(await screen.findByText(/Bản tiếng Anh chưa được công khai/)).toBeInTheDocument();
  });

  it('lỗi một phần (VI công khai bị 409): giữ text, giữ id bản nháp, báo chưa áp dụng; retry chỉ công khai lại đúng id, KHÔNG lưu lại', async () => {
    mockSaveDescription.mockResolvedValue([{ id: 't-vi-1', locale_code: 'vi', human_review_status: 'PENDING' }]);
    mockPublishDescription
      .mockResolvedValueOnce([{ locale_code: 'vi', ok: false, status: 409, error: 'superseded' }])
      .mockResolvedValueOnce([{ locale_code: 'vi', ok: true }]);
    await openDescription();
    fireEvent.change(screen.getByLabelText('Mô tả chi tiết (Tiếng Việt)'), { target: { value: 'VI giữ nguyên' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và công khai' }));
    expect(await screen.findByText(/Chưa áp dụng: Mô tả chi tiết \(VI\): bản đã đổi sau khi bạn đọc/)).toBeInTheDocument();
    expect(screen.getByLabelText('Mô tả chi tiết (Tiếng Việt)')).toHaveValue('VI giữ nguyên');
    expect(mockSaveDescription).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Lưu và công khai' }));
    await waitFor(() => expect(mockPublishDescription).toHaveBeenCalledTimes(2));
    expect(mockPublishDescription.mock.calls[1]).toEqual(['p1', { vi_translation_id: 't-vi-1' }, 'token-abc']);
    expect(mockSaveDescription).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Đã công khai: Mô tả chi tiết \(VI\)\./)).toBeInTheDocument();
  });

  it('sau khi công khai thành công, bấm lại không công khai lại (không tạo thao tác thừa)', async () => {
    mockSaveDescription.mockResolvedValue([{ id: 't-vi-2', locale_code: 'vi', human_review_status: 'PENDING' }]);
    mockPublishDescription.mockResolvedValue([{ locale_code: 'vi', ok: true }]);
    await openDescription();
    fireEvent.change(screen.getByLabelText('Mô tả chi tiết (Tiếng Việt)'), { target: { value: 'VI một lần' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và công khai' }));
    await waitFor(() => expect(mockPublishDescription).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu và công khai' }));
    expect(await screen.findByText(/Không có thay đổi để công khai\./)).toBeInTheDocument();
    expect(mockPublishDescription).toHaveBeenCalledTimes(1);
    expect(mockSaveDescription).toHaveBeenCalledTimes(1);
  });
});

describe('PlaceDescriptionEditor — chỉ gửi locale đã đổi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: SESSION.user, initializing: false, isAuthenticated: true, accessToken: 'token-abc' } as never);
    mockFetchCapabilities.mockResolvedValue(EDITORIAL_CAPS);
    mockEmptyDrafts();
  });

  it('chỉ EN đổi -> save chỉ gửi en với expected_en_id; VI không được gửi lại dù có bản nháp VI', async () => {
    mockGetDescription.mockResolvedValue({
      fallback_description: null,
      vi: { id: 't-vi-cur', text: 'VI hiện có', human_review_status: 'APPROVED', is_public: true },
      en: { id: 't-en-cur', text: 'EN cũ', human_review_status: 'PENDING', is_public: false },
    });
    mockSaveDescription.mockResolvedValue([{ id: 't-en-new', locale_code: 'en', human_review_status: 'PENDING' }]);
    render(<PlaceDescriptionEditor placeId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sửa nội dung' }));
    await screen.findByLabelText('Mô tả chi tiết (Tiếng Việt)');
    fireEvent.change(screen.getByLabelText('Mô tả chi tiết (English)'), { target: { value: 'EN mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(mockSaveDescription).toHaveBeenCalledWith('p1', { en: 'EN mới', expected_en_id: 't-en-cur' }, 'token-abc'));
    expect(mockSaveDescription.mock.calls[0][1]).not.toHaveProperty('vi');
  });
});
