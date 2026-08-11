/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClaimsReviewView } from './ClaimsReviewView';
import { listBusinessClaims } from './api/business-claims.api';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import type { ModeratorBusinessClaim } from './types';

jest.mock('./api/business-claims.api', () => ({ listBusinessClaims: jest.fn() }));
jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
// Chuyển TIẾP mọi prop (không chỉ href/children): thanh lọc dựa vào `aria-current`/`className` để
// biểu đạt mục đang chọn — mock nuốt mất prop sẽ khiến test không nhìn thấy đúng thứ người dùng thấy.
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

let searchParamsString = '';
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchParamsString),
}));

const mockList = listBusinessClaims as jest.Mock;
const mockSession = readSession as jest.Mock;

const SESSION = {
  accessToken: 'tok',
  refreshToken: 'r',
  expiresAt: 0,
  user: { id: 'u1', email: 'a@b.c', displayName: 'A', avatarUrl: null },
};

const meta = (over = {}) => ({ timestamp: 't', page: 1, pageSize: 20, total: 1, totalPages: 1, ...over });

function claim(overrides: Partial<ModeratorBusinessClaim> = {}): ModeratorBusinessClaim {
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
    ...overrides,
  };
}

beforeEach(() => {
  searchParamsString = '';
  mockSession.mockReset().mockReturnValue(SESSION);
  mockList.mockReset().mockResolvedValue({ data: [], meta: meta({ total: 0, totalPages: 0 }) });
});

describe('ClaimsReviewView — quyền truy cập', () => {
  it('chưa đăng nhập → yêu cầu đăng nhập, KHÔNG gọi API', async () => {
    mockSession.mockReturnValue(null);
    render(<ClaimsReviewView />);
    await waitFor(() => expect(screen.getByText('Cần đăng nhập')).toBeInTheDocument());
    expect(mockList).not.toHaveBeenCalled();
  });

  it('403 từ backend → trạng thái không có quyền (nêu đúng permission Business.Verify)', async () => {
    mockList.mockRejectedValueOnce(new ApiError('Thiếu quyền', 403));
    render(<ClaimsReviewView />);
    await waitFor(() => expect(screen.getByText('Không có quyền truy cập')).toBeInTheDocument());
    expect(screen.getByText('Business.Verify')).toBeInTheDocument();
  });
});

describe('ClaimsReviewView — tải dữ liệu', () => {
  it('lỗi 5xx → thông báo chung (không lộ message backend) + Thử lại nạp lại', async () => {
    mockList.mockRejectedValueOnce(new ApiError('internal boom', 500));
    render(<ClaimsReviewView />);
    await waitFor(() =>
      expect(screen.getByText('Đã xảy ra lỗi khi tải hàng đợi. Vui lòng thử lại.')).toBeInTheDocument(),
    );
    expect(screen.queryByText('internal boom')).not.toBeInTheDocument();

    mockList.mockResolvedValueOnce({ data: [claim()], meta: meta() });
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(screen.getByText('Bãi Sao')).toBeInTheDocument());
  });

  it('hàng đợi rỗng → trạng thái rỗng', async () => {
    render(<ClaimsReviewView />);
    await waitFor(() => expect(screen.getByText('Không có yêu cầu nào')).toBeInTheDocument());
  });

  it('có yêu cầu → hiện TÊN cơ sở + tên người yêu cầu (không phải UUID) và link tới chi tiết', async () => {
    mockList.mockResolvedValueOnce({ data: [claim()], meta: meta() });
    render(<ClaimsReviewView />);

    await waitFor(() => expect(screen.getByText('Bãi Sao')).toBeInTheDocument());
    expect(screen.getByText('Người yêu cầu: Trần Văn A')).toBeInTheDocument();
    // UUID trần không được là thứ moderator phải đọc.
    expect(screen.queryByText('p1')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Xem/ })).toHaveAttribute(
      'href',
      '/dashboard/business-claims/review/c1',
    );
  });
});

describe('ClaimsReviewView — bộ lọc trạng thái', () => {
  it('không có status trên URL → KHÔNG ép status (backend mặc định pending)', async () => {
    render(<ClaimsReviewView />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(mockList.mock.calls[0][0]).toEqual({ status: undefined, page: undefined, limit: 20 });
  });

  it('status hợp lệ trên URL → truyền xuống API', async () => {
    searchParamsString = 'status=approved';
    render(<ClaimsReviewView />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(mockList.mock.calls[0][0]).toMatchObject({ status: 'approved' });
  });

  // Query string là dữ liệu do người dùng kiểm soát — chỉ 5 giá trị ClaimStatus thật được chuyển
  // tiếp; giá trị lạ bị bỏ qua thay vì gửi thẳng xuống API.
  it('status KHÔNG hợp lệ trên URL → bỏ qua, không gửi xuống API', async () => {
    searchParamsString = 'status=../../etc/passwd';
    render(<ClaimsReviewView />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(mockList.mock.calls[0][0].status).toBeUndefined();
  });

  it('page không hợp lệ → bỏ qua', async () => {
    searchParamsString = 'page=abc';
    render(<ClaimsReviewView />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(mockList.mock.calls[0][0].page).toBeUndefined();
  });
});

describe('ClaimsReviewView — thanh lọc trạng thái', () => {
  it('URL không có status → "Đang chờ xét duyệt" là mục đang chọn (backend mặc định pending)', async () => {
    render(<ClaimsReviewView />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    expect(screen.getByRole('link', { name: 'Đang chờ xét duyệt' })).toHaveAttribute('aria-current', 'page');
  });

  it('chỉ render đúng 5 trạng thái thật (backend không có lựa chọn "tất cả")', async () => {
    render(<ClaimsReviewView />);
    await waitFor(() => expect(mockList).toHaveBeenCalled());
    const filterNav = screen.getByRole('navigation', { name: 'Lọc theo trạng thái' });
    expect(filterNav.querySelectorAll('a')).toHaveLength(5);
  });
});
