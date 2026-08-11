/** @jest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import { ClaimReviewDetail } from './ClaimReviewDetail';
import { getBusinessClaim } from './api/business-claims.api';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import type { ModeratorBusinessClaimDetail } from './types';

jest.mock('./api/business-claims.api', () => ({
  getBusinessClaim: jest.fn(),
  decideBusinessClaim: jest.fn(),
}));
jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const mockGet = getBusinessClaim as jest.Mock;
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
    evidence: [
      { type: 'business_license', reference: 'GP-2026-123', note: 'Bản sao công chứng' },
      { type: 'phone_verification', reference: '0901234567' },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  mockSession.mockReset().mockReturnValue(SESSION);
  mockGet.mockReset().mockResolvedValue(claim());
});

describe('ClaimReviewDetail — quyền truy cập', () => {
  it('chưa đăng nhập → yêu cầu đăng nhập, KHÔNG gọi API', async () => {
    mockSession.mockReturnValue(null);
    render(<ClaimReviewDetail claimId="c1" />);
    await waitFor(() => expect(screen.getByText('Cần đăng nhập')).toBeInTheDocument());
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('403 → trạng thái không có quyền', async () => {
    mockGet.mockRejectedValueOnce(new ApiError('Thiếu quyền', 403));
    render(<ClaimReviewDetail claimId="c1" />);
    await waitFor(() => expect(screen.getByText('Không có quyền truy cập')).toBeInTheDocument());
  });

  it('404 → trạng thái không tìm thấy, có đường về hàng đợi', async () => {
    mockGet.mockRejectedValueOnce(new ApiError('Không tìm thấy claim', 404));
    render(<ClaimReviewDetail claimId="c1" />);
    await waitFor(() => expect(screen.getByText('Không tìm thấy yêu cầu')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: '← Về hàng đợi' })).toHaveAttribute(
      'href',
      '/dashboard/business-claims/review',
    );
  });
});

describe('ClaimReviewDetail — nội dung', () => {
  it('hiện tên cơ sở, người yêu cầu và link tới trang công khai của cơ sở', async () => {
    render(<ClaimReviewDetail claimId="c1" />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Bãi Sao' })).toBeInTheDocument());
    expect(screen.getByText('Trần Văn A')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Bãi Sao/ })).toHaveAttribute('href', '/places/bai-sao');
  });

  it('hiện đầy đủ bằng chứng (nhãn tiếng Việt + tham chiếu + ghi chú)', async () => {
    render(<ClaimReviewDetail claimId="c1" />);

    await waitFor(() => expect(screen.getByText('Giấy phép kinh doanh')).toBeInTheDocument());
    expect(screen.getByText('GP-2026-123')).toBeInTheDocument();
    expect(screen.getByText('Bản sao công chứng')).toBeInTheDocument();
    expect(screen.getByText('Xác minh số điện thoại')).toBeInTheDocument();
    expect(screen.getByText('0901234567')).toBeInTheDocument();
  });

  // `reference` là chuỗi tự do do người lạ nhập — không bao giờ được dựng thành liên kết bấm được
  // trong công cụ duyệt (bề mặt phishing). Hiển thị nguyên văn.
  it('tham chiếu bằng chứng dạng URL KHÔNG trở thành liên kết bấm được', async () => {
    mockGet.mockResolvedValueOnce(
      claim({ evidence: [{ type: 'other', reference: 'https://evil.example.com/phish' }] }),
    );
    render(<ClaimReviewDetail claimId="c1" />);

    await waitFor(() => expect(screen.getByText('https://evil.example.com/phish')).toBeInTheDocument());
    expect(
      screen.queryByRole('link', { name: 'https://evil.example.com/phish' }),
    ).not.toBeInTheDocument();
  });

  it('không có bằng chứng → nêu rõ, không vỡ giao diện', async () => {
    mockGet.mockResolvedValueOnce(claim({ evidence: [] }));
    render(<ClaimReviewDetail claimId="c1" />);
    await waitFor(() =>
      expect(screen.getByText('Yêu cầu này không kèm bằng chứng nào.')).toBeInTheDocument(),
    );
  });

  it('claim đã xử lý → hiện lý do và KHÔNG có form quyết định', async () => {
    mockGet.mockResolvedValueOnce(
      claim({ status: 'rejected', reason_code: 'fraud', decided_at: '2026-08-11T00:00:00.000Z' }),
    );
    render(<ClaimReviewDetail claimId="c1" />);

    await waitFor(() => expect(screen.getByText('Nghi ngờ gian lận')).toBeInTheDocument());
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });
});
