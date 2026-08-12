/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ModerationDecisionForm } from './ModerationDecisionForm';
import { decideModerationCase } from './api/moderation.api';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import type { ModerationCaseDetail, ModerationTargetPreview } from './types';

jest.mock('./api/moderation.api', () => ({ decideModerationCase: jest.fn() }));
jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));

const mockDecide = decideModerationCase as jest.Mock;
const mockSession = readSession as jest.Mock;

function detail(preview: ModerationTargetPreview, over: Partial<ModerationCaseDetail> = {}): ModerationCaseDetail {
  return {
    id: 'c1',
    target_type: preview.target_type,
    target_id: 't1',
    status: 'open',
    source: 'new_content',
    severity: 'normal',
    priority: 50,
    report_count: 0,
    assigned_to: null,
    claimed_at: null,
    decision: null,
    reason: null,
    reason_code: null,
    resolved_by: null,
    resolved_at: null,
    created_at: 't',
    updated_at: 't',
    reports: [],
    target_preview: preview,
    ...over,
  };
}

const mediaPreview = (status: string): ModerationTargetPreview => ({
  found: true,
  target_type: 'media',
  target_id: 'm1',
  media_type: 'image',
  status,
  uploaded_by: 'u1',
  created_at: 't',
  place_id: null,
  place_name: null,
  preview_url: null,
});
const reviewPreview = (status: string): ModerationTargetPreview => ({
  found: true,
  target_type: 'review',
  target_id: 'r1',
  status,
  rating: 4,
  content: 'x',
  place_id: 'p',
  user_id: 'u',
  created_at: 't',
});

beforeEach(() => {
  mockDecide.mockReset().mockResolvedValue(null);
  mockSession
    .mockReset()
    .mockReturnValue({ accessToken: 'tok', refreshToken: 'r', expiresAt: Date.now() + 1e6, user: {} });
});

it('media pending: chỉ approve+reject, không render hide/restore', () => {
  render(<ModerationDecisionForm detail={detail(mediaPreview('pending'))} onDecided={jest.fn()} />);
  expect(screen.getByRole('radio', { name: 'Duyệt' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Từ chối' })).toBeInTheDocument();
  expect(screen.queryByRole('radio', { name: 'Ẩn' })).not.toBeInTheDocument();
  expect(screen.queryByRole('radio', { name: 'Khôi phục' })).not.toBeInTheDocument();
});

it('review pending: chỉ approve, không có reject', () => {
  render(<ModerationDecisionForm detail={detail(reviewPreview('pending'))} onDecided={jest.fn()} />);
  expect(screen.getByRole('radio', { name: 'Duyệt' })).toBeInTheDocument();
  expect(screen.queryByRole('radio', { name: 'Từ chối' })).not.toBeInTheDocument();
});

it('reject cần CẢ lý do lẫn mã lý do: submit disabled tới khi nhập đủ, rồi gửi đúng payload', async () => {
  const onDecided = jest.fn();
  render(<ModerationDecisionForm detail={detail(mediaPreview('pending'))} onDecided={onDecided} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Từ chối' }));
  const submit = screen.getByRole('button', { name: /Áp dụng: Từ chối/ });
  expect(submit).toBeDisabled();

  fireEvent.change(screen.getByLabelText('Ghi chú nội bộ (bắt buộc)'), { target: { value: 'spam rõ ràng' } });
  expect(submit).toBeDisabled(); // còn thiếu reason_code

  fireEvent.change(screen.getByLabelText('Mã lý do cho chủ cơ sở (bắt buộc)'), {
    target: { value: 'unrelated_to_place' },
  });
  expect(submit).toBeEnabled();

  fireEvent.click(submit);
  await waitFor(() =>
    expect(mockDecide).toHaveBeenCalledWith(
      'c1',
      { decision: 'reject', reason: 'spam rõ ràng', reason_code: 'unrelated_to_place' },
      'tok',
    ),
  );
  expect(onDecided).toHaveBeenCalled();
});

// Controlled Media Rejection Reason (2026-08-12) — picker CHỈ xuất hiện cho reject trên media.
describe('mã lý do cho chủ cơ sở (Controlled Media Rejection Reason)', () => {
  it('render đủ 5 lựa chọn taxonomy, không có lựa chọn thô/trùng', () => {
    render(<ModerationDecisionForm detail={detail(mediaPreview('pending'))} onDecided={jest.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Từ chối' }));

    const select = screen.getByLabelText('Mã lý do cho chủ cơ sở (bắt buộc)') as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value).filter((v) => v !== '');
    expect(values.sort()).toEqual(
      ['copyright', 'inappropriate_content', 'low_quality', 'other', 'unrelated_to_place'].sort(),
    );
    expect(screen.getByText('Chất lượng ảnh không đạt')).toBeInTheDocument();
  });

  it('media approve: KHÔNG render picker mã lý do', () => {
    render(<ModerationDecisionForm detail={detail(mediaPreview('pending'))} onDecided={jest.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Duyệt' }));
    expect(screen.queryByLabelText('Mã lý do cho chủ cơ sở (bắt buộc)')).not.toBeInTheDocument();
  });

  it('media hide (từ published): KHÔNG render picker mã lý do — chỉ reject mới có', async () => {
    render(<ModerationDecisionForm detail={detail(mediaPreview('published'))} onDecided={jest.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Ẩn' }));
    expect(screen.queryByLabelText('Mã lý do cho chủ cơ sở (bắt buộc)')).not.toBeInTheDocument();

    // hide vẫn gửi được bình thường, không kèm reason_code.
    fireEvent.change(screen.getByLabelText('Lý do (bắt buộc)'), { target: { value: 'vi phạm chính sách' } });
    fireEvent.click(screen.getByRole('button', { name: /Áp dụng: Ẩn/ }));
    await waitFor(() =>
      expect(mockDecide).toHaveBeenCalledWith(
        'c1',
        { decision: 'hide', reason: 'vi phạm chính sách' },
        'tok',
      ),
    );
  });

  it('media restore: KHÔNG render picker mã lý do', () => {
    render(<ModerationDecisionForm detail={detail(mediaPreview('hidden'))} onDecided={jest.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Khôi phục' }));
    expect(screen.queryByLabelText('Mã lý do cho chủ cơ sở (bắt buộc)')).not.toBeInTheDocument();
  });

  it('review hide: KHÔNG render picker mã lý do (taxonomy chỉ mô tả ảnh)', () => {
    render(<ModerationDecisionForm detail={detail(reviewPreview('published'))} onDecided={jest.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Ẩn' }));
    expect(screen.queryByLabelText('Mã lý do cho chủ cơ sở (bắt buộc)')).not.toBeInTheDocument();
  });
});

it('media restore: chọn target_status và gửi kèm', async () => {
  render(<ModerationDecisionForm detail={detail(mediaPreview('hidden'))} onDecided={jest.fn()} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Khôi phục' }));
  fireEvent.change(screen.getByLabelText('Khôi phục về'), { target: { value: 'pending' } });
  fireEvent.click(screen.getByRole('button', { name: /Áp dụng: Khôi phục/ }));
  await waitFor(() =>
    expect(mockDecide).toHaveBeenCalledWith('c1', { decision: 'restore', target_status: 'pending' }, 'tok'),
  );
});

it('thành công → xác nhận + onDecided', async () => {
  const onDecided = jest.fn();
  render(<ModerationDecisionForm detail={detail(mediaPreview('pending'))} onDecided={onDecided} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Duyệt' }));
  fireEvent.click(screen.getByRole('button', { name: /Áp dụng: Duyệt/ }));
  expect(await screen.findByRole('status')).toHaveTextContent(/Đã áp dụng/);
  expect(onDecided).toHaveBeenCalled();
});

it('409 → thông báo stale an toàn', async () => {
  mockDecide.mockRejectedValue(new ApiError('conflict', 409));
  render(<ModerationDecisionForm detail={detail(mediaPreview('pending'))} onDecided={jest.fn()} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Duyệt' }));
  fireEvent.click(screen.getByRole('button', { name: /Áp dụng: Duyệt/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/đã được người khác xử lý/i);
});

it('422 → hiển thị thông điệp backend an toàn', async () => {
  mockDecide.mockRejectedValue(new ApiError('Không thể duyệt media: media đã công khai.', 422));
  render(<ModerationDecisionForm detail={detail(mediaPreview('pending'))} onDecided={jest.fn()} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Duyệt' }));
  fireEvent.click(screen.getByRole('button', { name: /Áp dụng: Duyệt/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/media đã công khai/);
});

it('chặn submit trùng lặp', async () => {
  let resolveDecide: (v: unknown) => void = () => {};
  mockDecide.mockImplementation(() => new Promise((res) => (resolveDecide = res)));
  render(<ModerationDecisionForm detail={detail(mediaPreview('pending'))} onDecided={jest.fn()} />);
  fireEvent.click(screen.getByRole('radio', { name: 'Duyệt' }));
  const submit = screen.getByRole('button', { name: /Áp dụng: Duyệt/ });
  fireEvent.click(submit);
  fireEvent.click(submit);
  expect(mockDecide).toHaveBeenCalledTimes(1);
  resolveDecide(null);
  await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
});

it('case đã xử lý → không có form quyết định', () => {
  render(
    <ModerationDecisionForm detail={detail(mediaPreview('pending'), { status: 'resolved' })} onDecided={jest.fn()} />,
  );
  expect(screen.getByText(/Case đã được xử lý/)).toBeInTheDocument();
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
});
