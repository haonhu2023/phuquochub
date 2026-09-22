/** @jest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import { BackupStatusSection } from './BackupStatusSection';
import { readSession } from '@/modules/auth/session';
import { fetchCapabilities } from '@/modules/auth/api/me.api';
import { getBackupStatus } from './api/ops.api';
import { NO_CAPABILITIES } from '@/modules/auth/capabilities';
import { ApiError } from '@/lib/http';
import type { BackupStatusSummary } from './types';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('@/modules/auth/api/me.api', () => ({ fetchCapabilities: jest.fn() }));
jest.mock('./api/ops.api', () => ({ getBackupStatus: jest.fn() }));

const mockReadSession = readSession as jest.Mock;
const mockFetchCapabilities = fetchCapabilities as jest.Mock;
const mockGetBackupStatus = getBackupStatus as jest.Mock;

const SESSION = { accessToken: 'tok123', refreshToken: 'r', expiresAt: 0, user: { id: 'u1', email: 'a@b.c', displayName: 'A', avatarUrl: null } };
const OWNER_CAPS = { ...NO_CAPABILITIES, canViewBackupStatus: true };

const READY_STATUS: BackupStatusSummary = {
  database: {
    configured: true,
    count: 3,
    oldest: { name: 'phuquochub-20260918T020000Z.sql.gz', timestampUtc: '2026-09-18T02:00:00.000Z', ageHours: 100, sizeBytes: 900_000, hasChecksumSidecar: true },
    latest: { name: 'phuquochub-20260920T020000Z.sql.gz', timestampUtc: '2026-09-20T02:00:00.000Z', ageHours: 12, sizeBytes: 1_048_576, hasChecksumSidecar: true },
  },
  media: { configured: false, count: 0, latest: null, oldest: null },
  checkedAtUtc: '2026-09-22T08:00:00.000Z',
};

beforeEach(() => {
  mockReadSession.mockReset();
  mockFetchCapabilities.mockReset();
  mockGetBackupStatus.mockReset();
});

// BK1 (2026-09-22) — khối "Tình trạng sao lưu" trên trang Hướng dẫn. Ẩn (không phải 403) khi
// chưa đăng nhập hoặc không có Ops.BackupStatus.View — cùng quy ước DashboardNav.spec.tsx đã kiểm.
describe('BackupStatusSection', () => {
  it('chưa đăng nhập → không hiện gì, không gọi API nào', async () => {
    mockReadSession.mockReturnValue(null);
    const { container } = render(<BackupStatusSection />);
    expect(mockFetchCapabilities).not.toHaveBeenCalled();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('không có quyền Ops.BackupStatus.View → ẩn hoàn toàn, không gọi getBackupStatus', async () => {
    mockReadSession.mockReturnValue(SESSION);
    mockFetchCapabilities.mockResolvedValue(NO_CAPABILITIES);
    const { container } = render(<BackupStatusSection />);

    await waitFor(() => expect(mockFetchCapabilities).toHaveBeenCalled());
    expect(mockGetBackupStatus).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it('content_owner: hiện tình trạng thật của cả hai cây (DB đã cấu hình, media chưa cấu hình)', async () => {
    mockReadSession.mockReturnValue(SESSION);
    mockFetchCapabilities.mockResolvedValue(OWNER_CAPS);
    mockGetBackupStatus.mockResolvedValue(READY_STATUS);

    render(<BackupStatusSection />);

    expect(screen.getByRole('heading', { name: /Tình trạng sao lưu/i })).toBeInTheDocument();
    expect(await screen.findByText(/3 bản, gần nhất 12 giờ trước \(1\.0 MB, có checksum\)/)).toBeInTheDocument();
    expect(screen.getByText(/chưa cấu hình trên máy chủ này/)).toBeInTheDocument();
  });

  it('lỗi khi tải trạng thái → báo lỗi, không làm sập cả trang', async () => {
    mockReadSession.mockReturnValue(SESSION);
    mockFetchCapabilities.mockResolvedValue(OWNER_CAPS);
    mockGetBackupStatus.mockRejectedValue(new ApiError('Server error', 500));

    render(<BackupStatusSection />);

    expect(await screen.findByText(/Không tải được tình trạng sao lưu/i)).toBeInTheDocument();
  });

  it('đã cấu hình nhưng chưa có bản nào → nói rõ khác với "chưa cấu hình"', async () => {
    mockReadSession.mockReturnValue(SESSION);
    mockFetchCapabilities.mockResolvedValue(OWNER_CAPS);
    mockGetBackupStatus.mockResolvedValue({
      database: { configured: true, count: 0, latest: null, oldest: null },
      media: { configured: true, count: 0, latest: null, oldest: null },
      checkedAtUtc: '2026-09-22T08:00:00.000Z',
    } satisfies BackupStatusSummary);

    render(<BackupStatusSection />);

    expect(await screen.findAllByText(/đã cấu hình, nhưng chưa thấy bản sao lưu nào/)).toHaveLength(2);
  });
});
