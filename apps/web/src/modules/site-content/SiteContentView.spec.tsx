/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SiteContentView } from './SiteContentView';
import { readSession } from '@/modules/auth/session';
import { fetchCapabilities } from '@/modules/auth/api/me.api';
import { listSiteContent, upsertSiteContent } from './api/site-content.api';
import { ApiError } from '@/lib/http';
import { NO_CAPABILITIES } from '@/modules/auth/capabilities';
import type { SiteContentRow } from './types';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('@/modules/auth/api/me.api', () => ({ fetchCapabilities: jest.fn() }));
jest.mock('./api/site-content.api', () => ({ listSiteContent: jest.fn(), upsertSiteContent: jest.fn() }));
// GuideMediaPicker kéo theo useSingleImageUpload (presign→PUT→register thật) — ngoài phạm vi test
// này (đã được test riêng ở media/useSingleImageUpload.spec.tsx). Stub tối giản: chỉ cần label.
jest.mock('@/modules/guide-editor/GuideMediaPicker', () => ({
  GuideMediaPicker: ({ label }: { label: string }) => <div>{label}</div>,
}));

const mockReadSession = readSession as jest.Mock;
const mockFetchCapabilities = fetchCapabilities as jest.Mock;
const mockListSiteContent = listSiteContent as jest.Mock;
const mockUpsertSiteContent = upsertSiteContent as jest.Mock;

const SESSION = { accessToken: 'tok123', refreshToken: 'r', expiresAt: 0, user: { id: 'u1', email: 'a@b.c', displayName: 'A', avatarUrl: null } };
const CAN_EDIT = { canEditorial: false, canModerate: false, canReviewTranslations: false, canEditGuides: false, canEditSiteContent: true };

function row(overrides: Partial<SiteContentRow> = {}): SiteContentRow {
  return { key: 'home_hero', locale: 'vi', value: { eyebrow: 'E', title: 'T', lede: 'L' }, contentVersion: 2, updatedAt: '2026-09-22T00:00:00Z', ...overrides };
}

beforeEach(() => {
  mockReadSession.mockReset();
  mockFetchCapabilities.mockReset();
  mockListSiteContent.mockReset().mockResolvedValue([]);
  mockUpsertSiteContent.mockReset();
});

describe('SiteContentView — gác cổng (S1, 2026-09-22)', () => {
  it('chưa đăng nhập → báo cần đăng nhập, không gọi listSiteContent', async () => {
    mockReadSession.mockReturnValue(null);
    render(<SiteContentView />);
    expect(await screen.findByText(/cần đăng nhập/i)).toBeInTheDocument();
    expect(mockListSiteContent).not.toHaveBeenCalled();
  });

  it('đăng nhập nhưng KHÔNG có canEditSiteContent → báo không có quyền, không gọi listSiteContent', async () => {
    mockReadSession.mockReturnValue(SESSION);
    mockFetchCapabilities.mockResolvedValue(NO_CAPABILITIES);
    render(<SiteContentView />);
    expect(await screen.findByText(/không có quyền/i)).toBeInTheDocument();
    expect(mockListSiteContent).not.toHaveBeenCalled();
  });

  it('có canEditSiteContent → tải danh sách và hiện các khối biên tập', async () => {
    mockReadSession.mockReturnValue(SESSION);
    mockFetchCapabilities.mockResolvedValue(CAN_EDIT);
    render(<SiteContentView />);
    expect(await screen.findByText('Hero trang chủ — Tiếng Việt')).toBeInTheDocument();
    expect(screen.getByText('Địa điểm nổi bật')).toBeInTheDocument();
    expect(screen.getByText('Liên hệ / mạng xã hội')).toBeInTheDocument();
  });
});

describe('SiteContentView — nạp dữ liệu đã lưu vào form', () => {
  beforeEach(() => {
    mockReadSession.mockReturnValue(SESSION);
    mockFetchCapabilities.mockResolvedValue(CAN_EDIT);
  });

  it('hero VI đã có hàng → prefill đúng giá trị đã lưu', async () => {
    mockListSiteContent.mockResolvedValue([row({ value: { eyebrow: 'Chào mừng', title: 'Tiêu đề đã lưu', lede: 'Mô tả đã lưu' } })]);
    render(<SiteContentView />);
    await screen.findByText('Hero trang chủ — Tiếng Việt');
    expect(screen.getByDisplayValue('Chào mừng')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Tiêu đề đã lưu')).toBeInTheDocument();
  });
});

describe('SiteContentView — lưu (CAS)', () => {
  beforeEach(() => {
    mockReadSession.mockReturnValue(SESSION);
    mockFetchCapabilities.mockResolvedValue(CAN_EDIT);
  });

  it('lưu hero VI lần đầu (chưa có hàng) → expectedContentVersion=0, báo đã cập nhật công khai', async () => {
    mockListSiteContent.mockResolvedValue([]);
    mockUpsertSiteContent.mockResolvedValue(row({ contentVersion: 1 }));
    render(<SiteContentView />);
    await screen.findByText('Hero trang chủ — Tiếng Việt');

    const saveButtons = screen.getAllByRole('button', { name: 'Cập nhật công khai' });
    fireEvent.click(saveButtons[0]);

    await waitFor(() =>
      expect(mockUpsertSiteContent).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'home_hero', locale: 'vi', expectedContentVersion: 0 }),
        'tok123',
      ),
    );
    expect(await screen.findAllByText('Đã cập nhật công khai.')).not.toHaveLength(0);
  });

  it('nút và ghi chú đầu trang nói rõ đây là cập nhật công khai ngay, không phải lưu nháp', async () => {
    mockListSiteContent.mockResolvedValue([]);
    render(<SiteContentView />);
    await screen.findByText('Hero trang chủ — Tiếng Việt');
    expect(screen.getByText(/cập nhật NGAY lên trang chủ công khai/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Lưu$/ })).not.toBeInTheDocument();
  });

  it('409 (đã bị người khác cập nhật) → thông báo xung đột KHÔNG hiện mã lỗi, KHÔNG mất dữ liệu đang nhập ở khối đó', async () => {
    mockListSiteContent.mockResolvedValue([row({ contentVersion: 3 })]);
    mockUpsertSiteContent.mockRejectedValue(new ApiError('conflict', 409, 'CONFLICT'));
    render(<SiteContentView />);
    await screen.findByText('Hero trang chủ — Tiếng Việt');

    const titleInput = screen.getByDisplayValue('T');
    fireEvent.change(titleInput, { target: { value: 'Đang nhập dở' } });

    const saveButtons = screen.getAllByRole('button', { name: 'Cập nhật công khai' });
    fireEvent.click(saveButtons[0]);

    const conflictMessage = await screen.findByText(/vừa được người khác cập nhật công khai trước bạn/i);
    expect(conflictMessage).toBeInTheDocument();
    expect(conflictMessage.textContent).not.toMatch(/409/);
    // Dữ liệu đang nhập vẫn còn nguyên trên form — không bị xoá khi cập nhật lỗi.
    expect(screen.getByDisplayValue('Đang nhập dở')).toBeInTheDocument();
  });

  it('xung đột → nút "Tải phiên bản mới nhất" cập nhật CAS token nhưng KHÔNG đụng nội dung đang nhập, cho phép thử lại', async () => {
    mockListSiteContent
      .mockResolvedValueOnce([row({ contentVersion: 3, value: { eyebrow: 'E', title: 'Bản cũ', lede: 'L' } })])
      .mockResolvedValueOnce([row({ contentVersion: 4, value: { eyebrow: 'E', title: 'Bản mới của người khác', lede: 'L' } })]);
    mockUpsertSiteContent.mockRejectedValueOnce(new ApiError('conflict', 409, 'CONFLICT')).mockResolvedValueOnce(row({ contentVersion: 5 }));
    render(<SiteContentView />);
    await screen.findByText('Hero trang chủ — Tiếng Việt');

    const titleInput = screen.getByDisplayValue('Bản cũ');
    fireEvent.change(titleInput, { target: { value: 'Đang nhập dở' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Cập nhật công khai' })[0]);
    await screen.findByText(/vừa được người khác cập nhật công khai trước bạn/i);

    const reloadButton = await screen.findByRole('button', { name: /Tải phiên bản mới nhất/i });
    fireEvent.click(reloadButton);
    // Đợi nút "Tải phiên bản mới nhất" biến mất — đây là hệ quả trực tiếp của setConflict(false)
    // chạy CÙNG lượt render với onSaved(latest) cập nhật content_version, nên đợi được nó nghĩa là
    // prop `row` mới (content_version=4) cũng đã áp dụng xong, không chỉ đợi mock được gọi.
    await waitFor(() => expect(screen.queryByRole('button', { name: /Tải phiên bản mới nhất/i })).not.toBeInTheDocument());
    expect(mockListSiteContent).toHaveBeenCalledTimes(2);

    // Nội dung đang nhập KHÔNG bị thay bằng "Bản mới của người khác" — vẫn là input của owner.
    expect(screen.getByDisplayValue('Đang nhập dở')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Bản mới của người khác')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Cập nhật công khai' })[0]);
    await waitFor(() =>
      expect(mockUpsertSiteContent).toHaveBeenLastCalledWith(
        expect.objectContaining({ expectedContentVersion: 4 }),
        'tok123',
      ),
    );
  });

  it('mỗi khối có content_version CAS riêng — cập nhật khối này không gửi kèm dữ liệu khối khác', async () => {
    mockListSiteContent.mockResolvedValue([
      row({ key: 'home_hero', locale: 'vi', contentVersion: 5 }),
      row({ key: 'social_links', locale: '*', value: { facebook: 'https://facebook.com/x', zalo: null, instagram: null, whatsapp: null, phone: null }, contentVersion: 2 }),
    ]);
    mockUpsertSiteContent.mockResolvedValue(row({ contentVersion: 3 }));
    render(<SiteContentView />);
    await screen.findByText('Liên hệ / mạng xã hội');

    const saveButtons = screen.getAllByRole('button', { name: 'Cập nhật công khai' });
    const socialSaveButton = saveButtons[saveButtons.length - 1];
    fireEvent.click(socialSaveButton);

    await waitFor(() =>
      expect(mockUpsertSiteContent).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'social_links', locale: '*', expectedContentVersion: 2 }),
        'tok123',
      ),
    );
  });
});
