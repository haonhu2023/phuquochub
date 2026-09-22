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

  it('lưu hero VI lần đầu (chưa có hàng) → expectedContentVersion=0, báo Đã lưu', async () => {
    mockListSiteContent.mockResolvedValue([]);
    mockUpsertSiteContent.mockResolvedValue(row({ contentVersion: 1 }));
    render(<SiteContentView />);
    await screen.findByText('Hero trang chủ — Tiếng Việt');

    const saveButtons = screen.getAllByRole('button', { name: 'Lưu' });
    fireEvent.click(saveButtons[0]);

    await waitFor(() =>
      expect(mockUpsertSiteContent).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'home_hero', locale: 'vi', expectedContentVersion: 0 }),
        'tok123',
      ),
    );
    expect(await screen.findAllByText('Đã lưu.')).not.toHaveLength(0);
  });

  it('409 (đã bị người khác sửa) → thông báo xung đột, KHÔNG mất dữ liệu đang nhập ở khối đó', async () => {
    mockListSiteContent.mockResolvedValue([row({ contentVersion: 3 })]);
    mockUpsertSiteContent.mockRejectedValue(new ApiError('conflict', 409, 'CONFLICT'));
    render(<SiteContentView />);
    await screen.findByText('Hero trang chủ — Tiếng Việt');

    const titleInput = screen.getByDisplayValue('T');
    fireEvent.change(titleInput, { target: { value: 'Đang nhập dở' } });

    const saveButtons = screen.getAllByRole('button', { name: 'Lưu' });
    fireEvent.click(saveButtons[0]);

    expect(await screen.findByText(/vừa được người khác lưu/i)).toBeInTheDocument();
    // Dữ liệu đang nhập vẫn còn nguyên trên form — không bị xoá khi lưu lỗi.
    expect(screen.getByDisplayValue('Đang nhập dở')).toBeInTheDocument();
  });

  it('mỗi khối có content_version CAS riêng — lưu khối này không gửi kèm dữ liệu khối khác', async () => {
    mockListSiteContent.mockResolvedValue([
      row({ key: 'home_hero', locale: 'vi', contentVersion: 5 }),
      row({ key: 'social_links', locale: '*', value: { facebook: 'https://facebook.com/x', zalo: null, instagram: null, whatsapp: null, phone: null }, contentVersion: 2 }),
    ]);
    mockUpsertSiteContent.mockResolvedValue(row({ contentVersion: 3 }));
    render(<SiteContentView />);
    await screen.findByText('Liên hệ / mạng xã hội');

    const saveButtons = screen.getAllByRole('button', { name: 'Lưu' });
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
