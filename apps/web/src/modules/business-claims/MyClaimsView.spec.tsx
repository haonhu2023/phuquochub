/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MyClaimsView } from './MyClaimsView';
import { readSession } from '@/modules/auth/session';
import { listMyBusinessClaims } from './api/business-claims.api';
import { ApiError } from '@/lib/http';
import type { OwnBusinessClaim } from './types';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/business-claims.api', () => ({ listMyBusinessClaims: jest.fn() }));

const mockReadSession = readSession as jest.Mock;
const mockListMyBusinessClaims = listMyBusinessClaims as jest.Mock;

const SESSION = { accessToken: 'tok', refreshToken: 'r', expiresAt: 0, user: { id: 'u1', email: 'a@b.c', displayName: 'A', avatarUrl: null } };

function claim(overrides: Partial<OwnBusinessClaim> = {}): OwnBusinessClaim {
  return {
    id: 'c1',
    place_id: 'p1',
    place_name: 'Bãi Sao',
    place_slug: 'bai-sao',
    status: 'pending',
    reason_code: null,
    decided_at: null,
    created_at: '2026-08-10T00:00:00.000Z',
    updated_at: '2026-08-10T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  mockReadSession.mockReset().mockReturnValue(SESSION);
  mockListMyBusinessClaims.mockReset().mockResolvedValue([]);
});

describe('MyClaimsView — chưa đăng nhập', () => {
  it('không có session → hiển thị yêu cầu đăng nhập, không gọi API', async () => {
    mockReadSession.mockReturnValue(null);
    render(<MyClaimsView />);
    await waitFor(() => expect(screen.getByText('Cần đăng nhập')).toBeInTheDocument());
    expect(mockListMyBusinessClaims).not.toHaveBeenCalled();
  });
});

describe('MyClaimsView — lỗi tải', () => {
  it('API lỗi 4xx → hiển thị thông báo lỗi + nút Thử lại tải lại', async () => {
    mockListMyBusinessClaims.mockRejectedValueOnce(new ApiError('sự cố', 400));
    render(<MyClaimsView />);
    await waitFor(() => expect(screen.getByText('Không tải được danh sách')).toBeInTheDocument());

    mockListMyBusinessClaims.mockResolvedValueOnce([claim()]);
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(screen.getByText('Bãi Sao')).toBeInTheDocument());
  });

  it('lỗi 5xx → thông báo lỗi chung (không lộ message backend)', async () => {
    mockListMyBusinessClaims.mockRejectedValueOnce(new ApiError('internal', 500));
    render(<MyClaimsView />);
    await waitFor(() =>
      expect(screen.getByText('Đã xảy ra lỗi khi tải danh sách yêu cầu. Vui lòng thử lại.')).toBeInTheDocument(),
    );
  });
});

describe('MyClaimsView — rỗng', () => {
  it('không có yêu cầu nào → trạng thái rỗng với liên kết tìm địa điểm', async () => {
    render(<MyClaimsView />);
    await waitFor(() => expect(screen.getByText('Chưa có yêu cầu nào')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Tìm địa điểm để xác nhận quyền quản lý' })).toHaveAttribute(
      'href',
      '/places',
    );
  });
});

describe('MyClaimsView — trạng thái pending', () => {
  it('render tên place, nhãn "Đang chờ xét duyệt", KHÔNG có nút hành động nào', async () => {
    mockListMyBusinessClaims.mockResolvedValue([claim({ status: 'pending' })]);
    render(<MyClaimsView />);

    await waitFor(() => expect(screen.getByText('Bãi Sao')).toBeInTheDocument());
    expect(screen.getByText('Đang chờ xét duyệt')).toBeInTheDocument();
    expect(screen.getByText('Yêu cầu đang chờ kiểm duyệt viên xem xét.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Gửi lại yêu cầu/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Quản lý địa điểm/ })).not.toBeInTheDocument();
  });
});

describe('MyClaimsView — trạng thái approved', () => {
  it('render nhãn "Đã được xác nhận" + liên kết quản lý đúng place_id', async () => {
    mockListMyBusinessClaims.mockResolvedValue([claim({ status: 'approved', decided_at: '2026-08-11T00:00:00.000Z' })]);
    render(<MyClaimsView />);

    await waitFor(() => expect(screen.getByText('Đã được xác nhận')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Quản lý địa điểm' })).toHaveAttribute(
      'href',
      '/dashboard/places/p1/edit',
    );
  });
});

describe('MyClaimsView — trạng thái rejected', () => {
  it('render nhãn "Bị từ chối" + lý do (reason_code) + liên kết gửi lại yêu cầu', async () => {
    mockListMyBusinessClaims.mockResolvedValue([
      claim({ status: 'rejected', reason_code: 'insufficient_evidence', decided_at: '2026-08-11T00:00:00.000Z' }),
    ]);
    render(<MyClaimsView />);

    await waitFor(() => expect(screen.getByText('Bị từ chối')).toBeInTheDocument());
    expect(screen.getByText(/Bằng chứng chưa đủ thuyết phục/)).toBeInTheDocument();
    const resubmit = screen.getByRole('link', { name: 'Gửi lại yêu cầu' });
    expect(resubmit).toHaveAttribute(
      'href',
      '/dashboard/business-claims/new?place_id=p1&place_name=B%C3%A3i%20Sao',
    );
  });

  it('KHÔNG render evidence/reviewer/decision_note dưới bất kỳ hình thức nào (những field này không tồn tại trên OwnBusinessClaim)', async () => {
    mockListMyBusinessClaims.mockResolvedValue([claim({ status: 'rejected', reason_code: 'fraud' })]);
    render(<MyClaimsView />);
    await waitFor(() => expect(screen.getByText('Bị từ chối')).toBeInTheDocument());
    expect(screen.queryByText(/reviewer/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/evidence/i)).not.toBeInTheDocument();
  });
});

describe('MyClaimsView — trạng thái disputed', () => {
  it('render nhãn "Đang tranh chấp" + giải thích, KHÔNG có nút hành động', async () => {
    mockListMyBusinessClaims.mockResolvedValue([claim({ status: 'disputed' })]);
    render(<MyClaimsView />);

    await waitFor(() => expect(screen.getByText('Đang tranh chấp')).toBeInTheDocument());
    expect(screen.getByText(/quản trị viên đang phân xử/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Gửi lại yêu cầu/ })).not.toBeInTheDocument();
  });
});

describe('MyClaimsView — trạng thái withdrawn', () => {
  it('render nhãn "Đã rút" + liên kết gửi lại yêu cầu', async () => {
    mockListMyBusinessClaims.mockResolvedValue([claim({ status: 'withdrawn' })]);
    render(<MyClaimsView />);

    await waitFor(() => expect(screen.getByText('Đã rút')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Gửi lại yêu cầu' })).toHaveAttribute(
      'href',
      '/dashboard/business-claims/new?place_id=p1&place_name=B%C3%A3i%20Sao',
    );
  });
});

describe('MyClaimsView — nhiều claim', () => {
  it('render tất cả claim trả về, mỗi cái đúng place_name riêng', async () => {
    mockListMyBusinessClaims.mockResolvedValue([
      claim({ id: 'c1', place_id: 'p1', place_name: 'Bãi Sao', status: 'pending' }),
      claim({ id: 'c2', place_id: 'p2', place_name: 'Nhà hàng ABC', status: 'approved' }),
    ]);
    render(<MyClaimsView />);

    await waitFor(() => expect(screen.getByText('Bãi Sao')).toBeInTheDocument());
    expect(screen.getByText('Nhà hàng ABC')).toBeInTheDocument();
  });
});
