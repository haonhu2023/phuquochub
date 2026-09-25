/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlaceEditProposalDecisionForm } from './PlaceEditProposalDecisionForm';
import { decidePlaceEditProposal } from './api/place-edit-proposals.api';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import type { PlaceEditProposalView } from './types';

jest.mock('./api/place-edit-proposals.api', () => ({ decidePlaceEditProposal: jest.fn() }));
jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));

const mockDecide = decidePlaceEditProposal as jest.Mock;
const mockSession = readSession as jest.Mock;
const onDecided = jest.fn();

const proposal: PlaceEditProposalView = {
  id: 'prop-1',
  place_id: 'place-1',
  field_key: 'address',
  locale_code: null,
  proposed_value: 'Địa chỉ mới',
  reason: 'Vừa ghé thấy đổi',
  source_url: null,
  status: 'pending',
  proposer_id: 'u1',
  reviewer_id: null,
  reviewed_at: null,
  review_note: null,
  created_at: '2026-09-24T00:00:00.000Z',
  updated_at: '2026-09-24T00:00:00.000Z',
};

beforeEach(() => {
  mockSession.mockReset().mockReturnValue({ accessToken: 'tok' });
  mockDecide.mockReset();
  onDecided.mockReset();
});

it('status không phải pending/needs_changes -> không render form nào (đã xử lý)', () => {
  const { container } = render(
    <PlaceEditProposalDecisionForm proposal={{ ...proposal, status: 'approved' }} onDecided={onDecided} />,
  );
  expect(container).toBeEmptyDOMElement();
});

it('chọn "Duyệt" không cần ghi chú -> gửi decision=approve, không kèm note', async () => {
  mockDecide.mockResolvedValue({ ...proposal, status: 'approved' });
  render(<PlaceEditProposalDecisionForm proposal={proposal} onDecided={onDecided} />);

  fireEvent.click(screen.getByRole('radio', { name: 'Duyệt — áp dụng ngay' }));
  fireEvent.click(screen.getByRole('button', { name: /Xác nhận/ }));

  await waitFor(() => expect(mockDecide).toHaveBeenCalledWith('prop-1', { decision: 'approve' }, 'tok'));
  expect(onDecided).toHaveBeenCalled();
});

it('chọn "Từ chối" mà chưa ghi lý do -> nút Xác nhận bị vô hiệu, không gửi được', () => {
  render(<PlaceEditProposalDecisionForm proposal={proposal} onDecided={onDecided} />);

  fireEvent.click(screen.getByRole('radio', { name: 'Từ chối' }));

  expect(screen.getByRole('button', { name: /Xác nhận/ })).toBeDisabled();
  expect(mockDecide).not.toHaveBeenCalled();
});

it('chọn "Từ chối" kèm lý do -> gửi decision=reject + note', async () => {
  mockDecide.mockResolvedValue({ ...proposal, status: 'rejected' });
  render(<PlaceEditProposalDecisionForm proposal={proposal} onDecided={onDecided} />);

  fireEvent.click(screen.getByRole('radio', { name: 'Từ chối' }));
  fireEvent.change(screen.getByLabelText('Lý do (bắt buộc)'), { target: { value: 'Không đúng' } });
  fireEvent.click(screen.getByRole('button', { name: /Xác nhận/ }));

  await waitFor(() =>
    expect(mockDecide).toHaveBeenCalledWith('prop-1', { decision: 'reject', note: 'Không đúng' }, 'tok'),
  );
});

it('kết quả trả về status=conflict -> báo rõ KHÔNG tự ghi đè, vẫn gọi onDecided để nạp lại', async () => {
  mockDecide.mockResolvedValue({ ...proposal, status: 'conflict' });
  render(<PlaceEditProposalDecisionForm proposal={proposal} onDecided={onDecided} />);

  fireEvent.click(screen.getByRole('radio', { name: 'Duyệt — áp dụng ngay' }));
  fireEvent.click(screen.getByRole('button', { name: /Xác nhận/ }));

  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('KHÔNG tự ghi đè'));
  expect(onDecided).toHaveBeenCalled();
});

it('409 (đã bị xử lý bởi người khác) -> thông báo rõ, không phải lỗi chung', async () => {
  mockDecide.mockRejectedValue(new ApiError('conflict', 409));
  render(<PlaceEditProposalDecisionForm proposal={proposal} onDecided={onDecided} />);

  fireEvent.click(screen.getByRole('radio', { name: 'Duyệt — áp dụng ngay' }));
  fireEvent.click(screen.getByRole('button', { name: /Xác nhận/ }));

  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('vừa được người khác xử lý'));
});

it('chưa đăng nhập -> báo phiên hết hạn, không gọi API', () => {
  mockSession.mockReturnValue(null);
  render(<PlaceEditProposalDecisionForm proposal={proposal} onDecided={onDecided} />);

  fireEvent.click(screen.getByRole('radio', { name: 'Duyệt — áp dụng ngay' }));
  fireEvent.click(screen.getByRole('button', { name: /Xác nhận/ }));

  expect(screen.getByRole('alert')).toHaveTextContent('Phiên đăng nhập đã hết hạn');
  expect(mockDecide).not.toHaveBeenCalled();
});
