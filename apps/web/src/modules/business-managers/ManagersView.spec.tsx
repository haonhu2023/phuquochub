/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ManagersView } from './ManagersView';
import { readSession } from '@/modules/auth/session';
import {
  assignBusinessManager,
  listBusinessManagers,
  lookupBusinessUserByEmail,
  revokeBusinessManager,
} from './api/business-managers.api';
import { ApiError } from '@/lib/http';
import type { BusinessManager } from './types';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/business-managers.api', () => ({
  listBusinessManagers: jest.fn(),
  lookupBusinessUserByEmail: jest.fn(),
  assignBusinessManager: jest.fn(),
  revokeBusinessManager: jest.fn(),
}));

const mockReadSession = readSession as jest.Mock;
const mockList = listBusinessManagers as jest.Mock;
const mockLookup = lookupBusinessUserByEmail as jest.Mock;
const mockAssign = assignBusinessManager as jest.Mock;
const mockRevoke = revokeBusinessManager as jest.Mock;

const SESSION = { accessToken: 'tok', refreshToken: 'r', expiresAt: 0, user: { id: 'u1', email: 'a@b.c', displayName: 'A', avatarUrl: null } };

function manager(overrides: Partial<BusinessManager> = {}): BusinessManager {
  return {
    user_id: 'u9',
    display_name: 'Manager Chín',
    email: 'manager9@phuquochub.test',
    role: 'manager',
    granted_at: '2026-08-10T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  mockReadSession.mockReset().mockReturnValue(SESSION);
  mockList.mockReset().mockResolvedValue([]);
  mockLookup.mockReset();
  mockAssign.mockReset().mockResolvedValue(undefined);
  mockRevoke.mockReset().mockResolvedValue(null);
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => jest.restoreAllMocks());

describe('ManagersView — chưa đăng nhập', () => {
  it('không có session → hiển thị yêu cầu đăng nhập, không gọi API', async () => {
    mockReadSession.mockReturnValue(null);
    render(<ManagersView placeId="place-1" />);
    await waitFor(() => expect(screen.getByText('Cần đăng nhập')).toBeInTheDocument());
    expect(mockList).not.toHaveBeenCalled();
  });
});

describe('ManagersView — không có quyền / không tồn tại', () => {
  it('API trả 403 → hiển thị "Không tìm thấy địa điểm" (không phân biệt lý do)', async () => {
    mockList.mockRejectedValue(new ApiError('forbidden', 403));
    render(<ManagersView placeId="place-1" />);
    await waitFor(() => expect(screen.getByText('Không tìm thấy địa điểm')).toBeInTheDocument());
    expect(screen.getByText(/không tồn tại, hoặc bạn không có quyền/)).toBeInTheDocument();
  });
});

describe('ManagersView — lỗi tải khác', () => {
  it('API lỗi 5xx → thông báo lỗi chung + nút Thử lại', async () => {
    mockList.mockRejectedValueOnce(new ApiError('internal', 500));
    render(<ManagersView placeId="place-1" />);
    await waitFor(() => expect(screen.getByText('Không tải được danh sách')).toBeInTheDocument());

    mockList.mockResolvedValueOnce([manager()]);
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(screen.getByText('Manager Chín')).toBeInTheDocument());
  });
});

describe('ManagersView — rỗng', () => {
  it('chưa có quản lý viên nào → trạng thái rỗng, form gán vẫn hiển thị', async () => {
    render(<ManagersView placeId="place-1" />);
    await waitFor(() => expect(screen.getByText('Chưa có quản lý viên nào')).toBeInTheDocument());
    expect(screen.getByLabelText('Email người dùng')).toBeInTheDocument();
  });
});

describe('ManagersView — danh sách', () => {
  it('render tên, email, ngày gán của từng quản lý viên', async () => {
    mockList.mockResolvedValue([manager()]);
    render(<ManagersView placeId="place-1" />);

    await waitFor(() => expect(screen.getByText('Manager Chín')).toBeInTheDocument());
    expect(screen.getByText('manager9@phuquochub.test')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thu hồi' })).toBeInTheDocument();
  });
});

describe('ManagersView — tìm & gán', () => {
  it('tìm email không tồn tại (404) → hiển thị lỗi, KHÔNG hiện nút gán', async () => {
    mockList.mockResolvedValue([]);
    mockLookup.mockRejectedValue(new ApiError('not found', 404));
    render(<ManagersView placeId="place-1" />);
    await waitFor(() => expect(screen.getByText('Chưa có quản lý viên nào')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Email người dùng'), { target: { value: 'missing@x.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm người dùng' }));

    await waitFor(() => expect(screen.getByText('Không tìm thấy người dùng với email này.')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Gán làm quản lý' })).not.toBeInTheDocument();
  });

  it('tìm thấy → hiện tên + nút Gán làm quản lý; gán thành công → thông báo thành công + danh sách tải lại', async () => {
    mockList
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([manager({ user_id: 'u9', display_name: 'Người Mới' })]);
    mockLookup.mockResolvedValue({ user_id: 'u9', display_name: 'Người Mới' });
    render(<ManagersView placeId="place-1" />);
    await waitFor(() => expect(screen.getByText('Chưa có quản lý viên nào')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Email người dùng'), { target: { value: 'moi@x.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm người dùng' }));
    await waitFor(() => expect(screen.getByText('Người Mới')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Gán làm quản lý' }));

    await waitFor(() => expect(mockAssign).toHaveBeenCalledWith('place-1', 'u9', 'tok'));
    await waitFor(() => expect(screen.getByText(/Đã gán Người Mới làm quản lý viên/)).toBeInTheDocument());
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  });

  it('gán thất bại (409 đã có vai trò) → hiển thị lỗi rõ ràng', async () => {
    mockList.mockResolvedValue([]);
    mockLookup.mockResolvedValue({ user_id: 'u9', display_name: 'Người Mới' });
    mockAssign.mockRejectedValue(new ApiError('conflict', 409));
    render(<ManagersView placeId="place-1" />);
    await waitFor(() => expect(screen.getByText('Chưa có quản lý viên nào')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Email người dùng'), { target: { value: 'moi@x.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm người dùng' }));
    await waitFor(() => screen.getByText('Người Mới'));
    fireEvent.click(screen.getByRole('button', { name: 'Gán làm quản lý' }));

    await waitFor(() =>
      expect(screen.getByText('Người này đã có vai trò (chủ hoặc quản lý) tại cơ sở này.')).toBeInTheDocument(),
    );
  });

  it('Huỷ sau khi tìm thấy → ẩn hàng xác nhận, xoá email đã nhập', async () => {
    mockList.mockResolvedValue([]);
    mockLookup.mockResolvedValue({ user_id: 'u9', display_name: 'Người Mới' });
    render(<ManagersView placeId="place-1" />);
    await waitFor(() => expect(screen.getByText('Chưa có quản lý viên nào')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Email người dùng'), { target: { value: 'moi@x.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm người dùng' }));
    await waitFor(() => screen.getByText('Người Mới'));

    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(screen.queryByText('Người Mới')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Email người dùng')).toHaveValue('');
  });
});

describe('ManagersView — thu hồi', () => {
  it('xác nhận → gọi revokeBusinessManager rồi tải lại danh sách', async () => {
    mockList.mockResolvedValueOnce([manager()]).mockResolvedValueOnce([]);
    render(<ManagersView placeId="place-1" />);
    await waitFor(() => expect(screen.getByText('Manager Chín')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Thu hồi' }));

    await waitFor(() => expect(mockRevoke).toHaveBeenCalledWith('place-1', 'u9', 'tok'));
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  });

  it('huỷ xác nhận → KHÔNG gọi revokeBusinessManager', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    mockList.mockResolvedValue([manager()]);
    render(<ManagersView placeId="place-1" />);
    await waitFor(() => expect(screen.getByText('Manager Chín')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Thu hồi' }));

    expect(mockRevoke).not.toHaveBeenCalled();
  });

  it('backend từ chối 404 (đã bị thu hồi trước đó) → thông báo rõ ràng', async () => {
    mockList.mockResolvedValue([manager()]);
    mockRevoke.mockRejectedValue(new ApiError('not found', 404));
    render(<ManagersView placeId="place-1" />);
    await waitFor(() => expect(screen.getByText('Manager Chín')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Thu hồi' }));

    await waitFor(() =>
      expect(screen.getByText('Không tìm thấy quản lý viên này (có thể đã bị thu hồi trước đó).')).toBeInTheDocument(),
    );
  });
});
