/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { ModerationQueueRow } from './ModerationQueueRow';
import type { ModerationCaseSummary } from './types';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const base: ModerationCaseSummary = {
  id: 'c1',
  target_type: 'review',
  target_id: 'r1',
  status: 'open',
  source: 'report',
  severity: 'high',
  priority: 80,
  report_count: 3,
  assigned_to: null,
  claimed_at: null,
  decision: null,
  reason: null,
  reason_code: null,
  resolved_by: null,
  resolved_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

it('hiện metadata hàng chờ và link tới chi tiết', () => {
  render(<ModerationQueueRow c={base} />);
  expect(screen.getByText('Đánh giá')).toBeInTheDocument();
  expect(screen.getByText(/Nguồn: Bị báo cáo/)).toBeInTheDocument();
  expect(screen.getByText('Chưa ai nhận')).toBeInTheDocument();
  expect(screen.getByRole('link')).toHaveAttribute('href', '/dashboard/moderation/c1');
});

it('hiện trạng thái nhận việc mà KHÔNG lộ UUID người xử lý', () => {
  render(<ModerationQueueRow c={{ ...base, assigned_to: 'mod-uuid-1' }} />);
  expect(screen.getByText('Đã có người xử lý')).toBeInTheDocument();
  expect(screen.queryByText(/mod-uuid-1/)).not.toBeInTheDocument();
});
