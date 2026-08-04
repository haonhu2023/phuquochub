/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import { ModerationQueueView } from './ModerationQueueView';
import { listModerationCases } from './api/moderation.api';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import type { ModerationCaseSummary } from './types';

jest.mock('./api/moderation.api', () => ({ listModerationCases: jest.fn() }));
jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

let searchParamsString = '';
const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(searchParamsString),
}));

const mockList = listModerationCases as jest.Mock;
const mockSession = readSession as jest.Mock;

const meta = (over = {}) => ({ timestamp: 't', page: 1, pageSize: 20, total: 1, totalPages: 1, ...over });
const aCase: ModerationCaseSummary = {
  id: 'c1',
  target_type: 'review',
  target_id: 'r1',
  status: 'open',
  source: 'report',
  severity: 'high',
  priority: 80,
  report_count: 2,
  assigned_to: null,
  claimed_at: null,
  decision: null,
  reason: null,
  resolved_by: null,
  resolved_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  searchParamsString = '';
  push.mockClear();
  mockSession.mockReset().mockReturnValue({ accessToken: 'tok' });
  mockList.mockReset();
});

it('render danh sách case khi tải thành công', async () => {
  mockList.mockResolvedValue({ data: [aCase], meta: meta() });
  render(<ModerationQueueView />);
  expect(await screen.findByText('Đánh giá')).toBeInTheDocument();
  expect(screen.getByText(/Báo cáo:/)).toBeInTheDocument();
});

it('hiển thị empty state khi không có case', async () => {
  mockList.mockResolvedValue({ data: [], meta: meta({ total: 0, totalPages: 0 }) });
  render(<ModerationQueueView />);
  expect(await screen.findByText('Hàng chờ trống')).toBeInTheDocument();
});

it('403 → forbidden state', async () => {
  mockList.mockRejectedValue(new ApiError('forbidden', 403));
  render(<ModerationQueueView />);
  expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
});

it('lỗi server → error state + retry gọi lại API', async () => {
  mockList
    .mockRejectedValueOnce(new ApiError('boom', 500))
    .mockResolvedValueOnce({ data: [aCase], meta: meta() });
  render(<ModerationQueueView />);
  const retry = await screen.findByRole('button', { name: 'Thử lại' });
  fireEvent.click(retry);
  expect(await screen.findByText('Đánh giá')).toBeInTheDocument();
  expect(mockList).toHaveBeenCalledTimes(2);
});

it('danh sách không lộ dữ liệu riêng tư người báo cáo', async () => {
  mockList.mockResolvedValue({ data: [aCase], meta: meta() });
  render(<ModerationQueueView />);
  await screen.findByText('Đánh giá');
  expect(screen.queryByText(/reporter/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/@/)).not.toBeInTheDocument();
});
