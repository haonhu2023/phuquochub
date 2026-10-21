/** @jest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import { DashboardNav } from './DashboardNav';
import { readSession } from '@/modules/auth/session';
import { fetchCapabilities } from '@/modules/auth/api/me.api';
import { NO_CAPABILITIES } from '@/modules/auth/capabilities';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('@/modules/auth/api/me.api', () => ({ fetchCapabilities: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockReadSession = readSession as jest.Mock;
const mockFetchCapabilities = fetchCapabilities as jest.Mock;

const SESSION = { accessToken: 'tok123', refreshToken: 'r', expiresAt: 0, user: { id: 'u1', email: 'a@b.c', displayName: 'A', avatarUrl: null } };

beforeEach(() => {
  mockReadSession.mockReset();
  mockFetchCapabilities.mockReset();
});

// N1 (2026-09-22) — shell điều hướng quản trị 5 mục ĐÚNG plan §5: Tổng quan / Địa điểm / Bài viết /
// Nội dung website / Hướng dẫn. "Bài viết"/"Nội dung website" chỉ hiện khi capabilities xác nhận có
// quyền — bấm vào một lối vào sẽ 403 là lỗi UX, không phải lỗ hổng (backend vẫn chặn thật).
describe('DashboardNav', () => {
  it('member thường KHÔNG có canEditGuides/canEditSiteContent → chỉ thấy 3 mục luôn dùng được', async () => {
    mockReadSession.mockReturnValue(SESSION);
    mockFetchCapabilities.mockResolvedValue(NO_CAPABILITIES);
    render(<DashboardNav />);

    await waitFor(() => expect(mockFetchCapabilities).toHaveBeenCalled());

    expect(screen.getByRole('link', { name: 'Tổng quan' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Địa điểm của tôi' })).toHaveAttribute('href', '/dashboard/places');
    // Giai đoạn 3 (chiến lược data-hub) — luôn hiện, cùng lý do 'Địa điểm của tôi'.
    expect(screen.getByRole('link', { name: 'Đặt chỗ của cơ sở tôi' })).toHaveAttribute('href', '/dashboard/bookings');
    expect(screen.getByRole('link', { name: 'Hướng dẫn' })).toHaveAttribute('href', '/dashboard/help');
    expect(screen.queryByRole('link', { name: 'Bài viết' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nội dung website' })).not.toBeInTheDocument();
  });

  it('content_owner → thấy đủ cả 5 mục, đúng href', async () => {
    mockReadSession.mockReturnValue(SESSION);
    mockFetchCapabilities.mockResolvedValue({
      canEditorial: true,
      canModerate: true,
      canReviewTranslations: true,
      canEditGuides: true,
      canEditSiteContent: true,
    });
    render(<DashboardNav />);

    expect(await screen.findByRole('link', { name: 'Bài viết' })).toHaveAttribute('href', '/dashboard/editorial/guides');
    expect(screen.getByRole('link', { name: 'Quản lý địa điểm' })).toHaveAttribute('href', '/dashboard/editorial/places');
    expect(screen.getByRole('link', { name: 'Nội dung website' })).toHaveAttribute('href', '/dashboard/content');
  });

  // Phát hiện 2026-10-11 (xây /dashboard/opening-hours-evidence): route đã gác đúng Source.Verify
  // ở backend từ đầu, nhưng DashboardNav không có mục nào trỏ tới nó — moderator đăng nhập sẽ
  // không thấy trang này trừ khi tự gõ URL. content_owner KHÔNG thấy mục này (Source.Verify chỉ
  // cấp trực tiếp cho moderator, khác JobListing.Moderate/RealEstateListing.Moderate).
  it('moderator → thấy "Duyệt bằng chứng giờ mở cửa"; content_owner → KHÔNG thấy (Source.Verify không cấp cho content_owner)', async () => {
    mockReadSession.mockReturnValue(SESSION);
    mockFetchCapabilities.mockResolvedValue({ ...NO_CAPABILITIES, canReviewOpeningHoursEvidence: true });
    render(<DashboardNav />);

    expect(await screen.findByRole('link', { name: 'Duyệt bằng chứng giờ mở cửa' })).toHaveAttribute(
      'href',
      '/dashboard/opening-hours-evidence',
    );
  });

  it('content_owner (canReviewOpeningHoursEvidence: false) → KHÔNG thấy "Duyệt bằng chứng giờ mở cửa"', async () => {
    mockReadSession.mockReturnValue(SESSION);
    mockFetchCapabilities.mockResolvedValue({ ...NO_CAPABILITIES, canReviewJobListings: true });
    render(<DashboardNav />);

    await waitFor(() => expect(mockFetchCapabilities).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: 'Duyệt bằng chứng giờ mở cửa' })).not.toBeInTheDocument();
  });

  it('chưa xác định capabilities (đang tải) → ẩn hai mục đặc quyền cho tới khi biết chắc, không hiện nhầm rồi ẩn lại', () => {
    mockReadSession.mockReturnValue(SESSION);
    mockFetchCapabilities.mockReturnValue(new Promise(() => {})); // không bao giờ resolve trong test này
    render(<DashboardNav />);

    expect(screen.queryByRole('link', { name: 'Bài viết' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nội dung website' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tổng quan' })).toBeInTheDocument();
  });

  it('chưa đăng nhập → không gọi fetchCapabilities, vẫn hiện 3 mục cơ bản', () => {
    mockReadSession.mockReturnValue(null);
    render(<DashboardNav />);
    expect(mockFetchCapabilities).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Địa điểm của tôi' })).toBeInTheDocument();
  });
});
