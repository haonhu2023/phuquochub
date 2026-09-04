/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TranslationReviewDecisionForm } from './TranslationReviewDecisionForm';
import { reviewTranslation } from './api/translation-review.api';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import type { TranslationReviewQueueItem } from './types';

jest.mock('./api/translation-review.api', () => ({ reviewTranslation: jest.fn() }));
jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));

const mockReview = reviewTranslation as jest.Mock;
const mockSession = readSession as jest.Mock;

function item(overrides: Partial<TranslationReviewQueueItem> = {}): TranslationReviewQueueItem {
  return {
    id: 'translation-1',
    place_id: 'place-1',
    place_name: 'VinWonders Phú Quốc',
    place_slug: 'vinwonders-phu-quoc',
    field_key: 'short_description',
    locale_code: 'en',
    source_locale_code: 'vi',
    translated_text: 'The most beautiful beach in Phu Quoc',
    current_public_text: null,
    translation_method: 'human',
    translation_status: 'PENDING',
    human_review_status: 'PENDING',
    quality_gate: 'PASS',
    revision_id: 'rev-1',
    created_at: '2026-09-04T00:00:00.000Z',
    source_id: 'src-1',
    source_url: 'https://vinwonders.com/en/vinwonders-phu-quoc/',
    source_title: 'VinWonders — official EN',
    source_type: 'official_website',
    source_reliability: 5,
    ...overrides,
  };
}

beforeEach(() => {
  mockReview.mockReset().mockResolvedValue(null);
  mockSession
    .mockReset()
    .mockReturnValue({ accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 1e6, user: {} });
});

it('renders exactly the three decisions', () => {
  render(<TranslationReviewDecisionForm item={item()} onDecided={jest.fn()} />);
  expect(screen.getByRole('radio', { name: 'Duyệt' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Cần sửa lại' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Từ chối' })).toBeInTheDocument();
});

it('APPROVE gửi ĐÚNG {decision, notes} — không có reviewer_id/reviewed_at/is_public nào', async () => {
  const onDecided = jest.fn();
  render(<TranslationReviewDecisionForm item={item()} onDecided={onDecided} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Duyệt' }));
  fireEvent.click(screen.getByRole('button', { name: /Áp dụng: Duyệt/ }));

  await waitFor(() => expect(mockReview).toHaveBeenCalledTimes(1));
  const [id, body, token] = mockReview.mock.calls[0];
  expect(id).toBe('translation-1');
  expect(body).toEqual({ decision: 'APPROVED', notes: undefined });
  expect(Object.keys(body)).toEqual(['decision', 'notes']);
  expect(token).toBe('tok');
  await waitFor(() => expect(onDecided).toHaveBeenCalledTimes(1));
});

it('REJECTED: nút bị disable tới khi có ghi chú, rồi gửi đúng payload kèm notes', async () => {
  const onDecided = jest.fn();
  render(<TranslationReviewDecisionForm item={item()} onDecided={onDecided} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Từ chối' }));
  const submit = screen.getByRole('button', { name: /Áp dụng: Từ chối/ });
  expect(submit).toBeDisabled();

  fireEvent.change(screen.getByLabelText(/Ghi chú/), { target: { value: 'Sai thông tin giá.' } });
  expect(submit).not.toBeDisabled();
  fireEvent.click(submit);

  await waitFor(() => expect(mockReview).toHaveBeenCalledTimes(1));
  expect(mockReview.mock.calls[0][1]).toEqual({ decision: 'REJECTED', notes: 'Sai thông tin giá.' });
  await waitFor(() => expect(onDecided).toHaveBeenCalledTimes(1));
});

it('NEEDS_CHANGES: cũng bắt buộc ghi chú', () => {
  render(<TranslationReviewDecisionForm item={item()} onDecided={jest.fn()} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Cần sửa lại' }));
  expect(screen.getByRole('button', { name: /Áp dụng: Cần sửa lại/ })).toBeDisabled();
});

it('APPROVE không cần ghi chú', () => {
  render(<TranslationReviewDecisionForm item={item()} onDecided={jest.fn()} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Duyệt' }));
  expect(screen.getByRole('button', { name: /Áp dụng: Duyệt/ })).not.toBeDisabled();
});

it('DOUBLE_SUBMISSION_SAFE: nút bị disable ngay sau click đầu, không gửi lần hai trong lúc đang chờ', async () => {
  let resolveReview: (() => void) | undefined;
  mockReview.mockImplementation(() => new Promise((resolve) => { resolveReview = () => resolve(null); }));

  render(<TranslationReviewDecisionForm item={item()} onDecided={jest.fn()} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Duyệt' }));
  const submit = screen.getByRole('button', { name: /Áp dụng: Duyệt/ });

  fireEvent.click(submit);
  fireEvent.click(submit); // double-click trong lúc request đầu còn treo

  await waitFor(() => expect(screen.getByRole('button', { name: /Đang gửi/ })).toBeDisabled());
  expect(mockReview).toHaveBeenCalledTimes(1);

  resolveReview?.();
  await waitFor(() => expect(mockReview).toHaveBeenCalledTimes(1)); // vẫn đúng 1 lần sau khi hoàn tất
});

it('409 (stale/đã duyệt bởi người khác) hiện cảnh báo tải lại, KHÔNG tự thử lại', async () => {
  mockReview.mockRejectedValue(new ApiError('conflict', 409));
  const onDecided = jest.fn();
  render(<TranslationReviewDecisionForm item={item()} onDecided={onDecided} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Duyệt' }));
  fireEvent.click(screen.getByRole('button', { name: /Áp dụng: Duyệt/ }));

  await screen.findByRole('alert');
  expect(screen.getByText(/đã bị sửa hoặc đã được người khác duyệt/)).toBeInTheDocument();
  expect(mockReview).toHaveBeenCalledTimes(1); // không tự retry

  fireEvent.click(screen.getByRole('button', { name: 'Tải lại hàng chờ' }));
  expect(onDecided).toHaveBeenCalledTimes(1);
});

it('403 hiện thông báo không có quyền, không lộ chi tiết kỹ thuật', async () => {
  mockReview.mockRejectedValue(new ApiError('Forbidden', 403));
  render(<TranslationReviewDecisionForm item={item()} onDecided={jest.fn()} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Duyệt' }));
  fireEvent.click(screen.getByRole('button', { name: /Áp dụng: Duyệt/ }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Bạn không có quyền duyệt bản dịch này.');
});

it('đã có quyết định rồi (APPROVED) thì không render lại form quyết định', () => {
  render(<TranslationReviewDecisionForm item={item({ human_review_status: 'APPROVED' })} onDecided={jest.fn()} />);
  expect(screen.queryByRole('radio', { name: 'Duyệt' })).not.toBeInTheDocument();
  expect(screen.getByText(/Đã có quyết định/)).toBeInTheDocument();
});
