/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { OpeningHoursEvidenceQueueView } from './OpeningHoursEvidenceQueueView';
import { listPendingOpeningHoursEvidence } from './api/opening-hours-evidence.api';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import type { OpeningHoursEvidencePendingView } from './types';

jest.mock('./api/opening-hours-evidence.api', () => ({ listPendingOpeningHoursEvidence: jest.fn() }));
jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
jest.mock('./OpeningHoursEvidenceDecisionForm', () => ({
  OpeningHoursEvidenceDecisionForm: ({ item }: { item: OpeningHoursEvidencePendingView }) => (
    <div data-testid={`decision-form-${item.evidence_artifact_id}`} />
  ),
}));

const mockList = listPendingOpeningHoursEvidence as jest.Mock;
const mockSession = readSession as jest.Mock;

const anItem = (over: Partial<OpeningHoursEvidencePendingView> = {}): OpeningHoursEvidencePendingView => ({
  evidence_artifact_id: 'evd-1',
  place_id: 'place-1',
  place_name: 'Bãi Sao',
  place_slug: 'bai-sao',
  place_current_opening_hours: { regular: { mon: [{ open: '09:00', close: '17:00' }] } },
  source_url: 'https://example.com/hours',
  captured_at: '2026-10-11T00:00:00.000Z',
  observed_text: '9h-17h thứ 2',
  schedule_stability_claimed: 'STABLE',
  submitted_at: '2026-10-11T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  mockSession.mockReset().mockReturnValue({ accessToken: 'tok' });
  mockList.mockReset();
});

it('render danh sách kèm nguồn, nội dung nộp, và giá trị hiện tại của place', async () => {
  mockList.mockResolvedValue([anItem()]);
  render(<OpeningHoursEvidenceQueueView />);

  expect(await screen.findByText(/Bãi Sao/)).toBeInTheDocument();
  expect(screen.getByText('https://example.com/hours')).toBeInTheDocument();
  expect(screen.getByText(/9h-17h thứ 2/)).toBeInTheDocument();
  expect(screen.getByTestId('decision-form-evd-1')).toBeInTheDocument();
});

it('hàng chờ trống hiện đúng thông báo', async () => {
  mockList.mockResolvedValue([]);
  render(<OpeningHoursEvidenceQueueView />);
  expect(await screen.findByText('Hàng chờ trống')).toBeInTheDocument();
});

it('403 → hiện "Không có quyền truy cập"', async () => {
  mockList.mockRejectedValue(new ApiError('Thiếu quyền: Source.Verify', 403));
  render(<OpeningHoursEvidenceQueueView />);
  expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
});

it('chưa đăng nhập → hiện "Không có quyền truy cập" ngay, không gọi API', async () => {
  mockSession.mockReturnValue(null);
  render(<OpeningHoursEvidenceQueueView />);
  expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
  expect(mockList).not.toHaveBeenCalled();
});
