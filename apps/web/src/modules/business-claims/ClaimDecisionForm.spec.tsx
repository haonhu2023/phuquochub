/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClaimDecisionForm } from './ClaimDecisionForm';
import { decideBusinessClaim } from './api/business-claims.api';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import type { ModeratorBusinessClaimDetail } from './types';

jest.mock('./api/business-claims.api', () => ({ decideBusinessClaim: jest.fn() }));
jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));

const mockDecide = decideBusinessClaim as jest.Mock;
const mockSession = readSession as jest.Mock;

const SESSION = {
  accessToken: 'tok',
  refreshToken: 'r',
  expiresAt: 0,
  user: { id: 'u1', email: 'a@b.c', displayName: 'A', avatarUrl: null },
};

function claim(overrides: Partial<ModeratorBusinessClaimDetail> = {}): ModeratorBusinessClaimDetail {
  return {
    id: 'c1',
    place_id: 'p1',
    place_name: 'Bãi Sao',
    place_slug: 'bai-sao',
    requester_id: 'u9',
    requester_display_name: 'Trần Văn A',
    status: 'pending',
    reviewer_id: null,
    reason_code: null,
    decision_note: null,
    decided_at: null,
    created_at: '2026-08-10T00:00:00.000Z',
    updated_at: '2026-08-10T00:00:00.000Z',
    evidence: [{ type: 'business_license', reference: 'GP-123' }],
    ...overrides,
  };
}

beforeEach(() => {
  mockSession.mockReset().mockReturnValue(SESSION);
  mockDecide.mockReset().mockResolvedValue({});
});

describe('ClaimDecisionForm — trạng thái không quyết định được', () => {
  it.each(['approved', 'rejected', 'disputed', 'withdrawn'] as const)(
    'claim %s → không hiện form (FSM backend chỉ cho quyết định khi pending)',
    (status) => {
      render(<ClaimDecisionForm claim={claim({ status })} onDecided={jest.fn()} />);
      expect(screen.getByText('Yêu cầu này đã được xử lý — không còn hành động nào.')).toBeInTheDocument();
      expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    },
  );
});

describe('ClaimDecisionForm — duyệt', () => {
  it('chưa chọn quyết định → nút gửi bị vô hiệu hoá', () => {
    render(<ClaimDecisionForm claim={claim()} onDecided={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Chọn một quyết định' })).toBeDisabled();
  });

  it('chọn Duyệt → cảnh báo hệ quả rõ ràng trước khi gửi', () => {
    render(<ClaimDecisionForm claim={claim()} onDecided={jest.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: /Duyệt/ }));
    expect(screen.getByText(/sẽ trở thành chủ cơ sở/)).toBeInTheDocument();
  });

  it('duyệt → gọi API đúng payload (KHÔNG reason_code) và báo cho cha nạp lại', async () => {
    const onDecided = jest.fn();
    render(<ClaimDecisionForm claim={claim()} onDecided={onDecided} />);

    fireEvent.click(screen.getByRole('radio', { name: /Duyệt/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt yêu cầu' }));

    await waitFor(() => expect(mockDecide).toHaveBeenCalledWith('c1', { decision: 'approve' }, 'tok'));
    await waitFor(() => expect(onDecided).toHaveBeenCalled());
  });
});

describe('ClaimDecisionForm — từ chối', () => {
  it('chọn Từ chối → bắt buộc chọn lý do, gửi kèm reason_code', async () => {
    render(<ClaimDecisionForm claim={claim()} onDecided={jest.fn()} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Từ chối' }));
    const select = screen.getByLabelText(/Lý do từ chối/);
    expect(select).toBeRequired();
    fireEvent.change(select, { target: { value: 'fraud' } });
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối yêu cầu' }));

    await waitFor(() =>
      expect(mockDecide).toHaveBeenCalledWith('c1', { decision: 'reject', reason_code: 'fraud' }, 'tok'),
    );
  });

  it('ghi chú chỉ có khoảng trắng → KHÔNG gửi decision_note', async () => {
    render(<ClaimDecisionForm claim={claim()} onDecided={jest.fn()} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Từ chối' }));
    fireEvent.change(screen.getByLabelText(/Ghi chú nội bộ/), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối yêu cầu' }));

    await waitFor(() => expect(mockDecide).toHaveBeenCalled());
    expect(mockDecide.mock.calls[0][1]).not.toHaveProperty('decision_note');
  });

  it('ghi chú có nội dung → gửi bản đã trim', async () => {
    render(<ClaimDecisionForm claim={claim()} onDecided={jest.fn()} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Từ chối' }));
    fireEvent.change(screen.getByLabelText(/Ghi chú nội bộ/), { target: { value: '  trùng hồ sơ  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Từ chối yêu cầu' }));

    await waitFor(() => expect(mockDecide).toHaveBeenCalled());
    expect(mockDecide.mock.calls[0][1].decision_note).toBe('trùng hồ sơ');
  });
});

describe('ClaimDecisionForm — lỗi', () => {
  it('403 (tự duyệt claim của chính mình) → thông điệp rõ, KHÔNG báo cha nạp lại', async () => {
    const onDecided = jest.fn();
    mockDecide.mockRejectedValueOnce(new ApiError('Không thể tự xác minh', 403));
    render(<ClaimDecisionForm claim={claim()} onDecided={onDecided} />);

    fireEvent.click(screen.getByRole('radio', { name: /Duyệt/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt yêu cầu' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/không đủ quyền/i));
    expect(onDecided).not.toHaveBeenCalled();
  });

  it('lỗi 5xx → thông điệp chung, không lộ chi tiết kỹ thuật', async () => {
    mockDecide.mockRejectedValueOnce(new ApiError('stack trace boom', 500));
    render(<ClaimDecisionForm claim={claim()} onDecided={jest.fn()} />);

    fireEvent.click(screen.getByRole('radio', { name: /Duyệt/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt yêu cầu' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Không ghi nhận được quyết định. Vui lòng thử lại.'),
    );
    expect(screen.queryByText(/stack trace boom/)).not.toBeInTheDocument();
  });

  it('phiên hết hạn → báo đăng nhập lại, KHÔNG gọi API', async () => {
    mockSession.mockReturnValue(null);
    render(<ClaimDecisionForm claim={claim()} onDecided={jest.fn()} />);

    fireEvent.click(screen.getByRole('radio', { name: /Duyệt/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt yêu cầu' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/hết hạn/));
    expect(mockDecide).not.toHaveBeenCalled();
  });
});
