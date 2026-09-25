/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react';
import { PlaceEditProposalsQueueView } from './PlaceEditProposalsQueueView';
import { listPlaceEditProposals } from './api/place-edit-proposals.api';
import { previewPlace } from '@/modules/place-management/api/place-management.api';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import type { PlaceEditProposalView } from './types';

jest.mock('./api/place-edit-proposals.api', () => ({ listPlaceEditProposals: jest.fn() }));
jest.mock('@/modules/place-management/api/place-management.api', () => ({ previewPlace: jest.fn() }));
jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
// Decision form không phải đối tượng test ở đây (có spec riêng) — thay bằng stub tối giản để cô lập.
jest.mock('./PlaceEditProposalDecisionForm', () => ({
  PlaceEditProposalDecisionForm: ({ proposal }: { proposal: PlaceEditProposalView }) => (
    <div data-testid={`decision-form-${proposal.id}`} />
  ),
}));

const mockList = listPlaceEditProposals as jest.Mock;
const mockPreview = previewPlace as jest.Mock;
const mockSession = readSession as jest.Mock;

const anItem = (over: Partial<PlaceEditProposalView> = {}): PlaceEditProposalView => ({
  id: 'prop-1',
  place_id: 'place-1',
  field_key: 'address',
  locale_code: null,
  proposed_value: 'Địa chỉ mới',
  reason: 'Vừa ghé thấy đổi',
  source_url: 'https://maps.example/p',
  status: 'pending',
  proposer_id: 'u1',
  reviewer_id: null,
  reviewed_at: null,
  review_note: null,
  created_at: '2026-09-24T00:00:00.000Z',
  updated_at: '2026-09-24T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  mockSession.mockReset().mockReturnValue({ accessToken: 'tok' });
  mockList.mockReset();
  mockPreview.mockReset().mockResolvedValue({
    name: 'Bãi Sao',
    slug: 'bai-sao',
    address: 'Địa chỉ cũ',
    short_description: null,
    opening_hours: null,
  });
});

it('render danh sách kèm giá trị hiện tại (từ previewPlace) và giá trị đề xuất', async () => {
  mockList.mockResolvedValue([anItem()]);
  render(<PlaceEditProposalsQueueView />);

  expect(await screen.findByText(/Địa chỉ — Bãi Sao/)).toBeInTheDocument();
  expect(screen.getByText('Địa chỉ cũ')).toBeInTheDocument();
  expect(screen.getByText('Địa chỉ mới')).toBeInTheDocument();
  expect(screen.getByText(/Vừa ghé thấy đổi/)).toBeInTheDocument();
  expect(screen.getByTestId('decision-form-prop-1')).toBeInTheDocument();
});

it('chỉ gọi previewPlace một lần cho mỗi place_id KHÁC NHAU, dù nhiều đề xuất cùng place', async () => {
  mockList.mockResolvedValue([
    anItem({ id: 'p1', place_id: 'place-1', field_key: 'address' }),
    anItem({ id: 'p2', place_id: 'place-1', field_key: 'short_description' }),
  ]);
  render(<PlaceEditProposalsQueueView />);

  await screen.findByTestId('decision-form-p1');
  expect(mockPreview).toHaveBeenCalledTimes(1);
});

it('hiển thị empty state khi hàng chờ trống', async () => {
  mockList.mockResolvedValue([]);
  render(<PlaceEditProposalsQueueView />);
  expect(await screen.findByText('Hàng chờ trống')).toBeInTheDocument();
});

it('403 → forbidden state, nêu đúng permission PlaceEditProposal.Moderate', async () => {
  mockList.mockRejectedValue(new ApiError('forbidden', 403));
  render(<PlaceEditProposalsQueueView />);
  expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
  expect(screen.getByText('PlaceEditProposal.Moderate')).toBeInTheDocument();
});

it('lỗi server → error state + retry gọi lại API', async () => {
  mockList.mockRejectedValueOnce(new ApiError('boom', 500)).mockResolvedValueOnce([anItem()]);
  render(<PlaceEditProposalsQueueView />);
  const retry = await screen.findByRole('button', { name: 'Thử lại' });
  fireEvent.click(retry);
  expect(await screen.findByTestId('decision-form-prop-1')).toBeInTheDocument();
  expect(mockList).toHaveBeenCalledTimes(2);
});

it('previewPlace lỗi cho một place -> vẫn hiện đề xuất, ghi rõ không tải được', async () => {
  mockList.mockResolvedValue([anItem()]);
  mockPreview.mockRejectedValue(new Error('boom'));
  render(<PlaceEditProposalsQueueView />);

  expect(await screen.findByText(/không tải được tên địa điểm/)).toBeInTheDocument();
});
