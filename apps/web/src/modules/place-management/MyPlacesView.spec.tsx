/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MyPlacesView } from './MyPlacesView';
import { readSession } from '@/modules/auth/session';
import { listMyPlaces, archivePlace } from './api/place-management.api';
import { listCategories } from '@/modules/categories/api/categories.api';
import { ApiError } from '@/lib/http';
import type { ManagedPlace } from './types';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/place-management.api', () => ({
  listMyPlaces: jest.fn(),
  archivePlace: jest.fn(),
}));
jest.mock('@/modules/categories/api/categories.api', () => ({ listCategories: jest.fn() }));

const mockReadSession = readSession as jest.Mock;
const mockListMyPlaces = listMyPlaces as jest.Mock;
const mockArchivePlace = archivePlace as jest.Mock;
const mockListCategories = listCategories as jest.Mock;

const SESSION = { accessToken: 'tok', refreshToken: 'r', expiresAt: 0, user: { id: 'u1', email: 'a@b.c', displayName: 'A', avatarUrl: null } };

function place(overrides: Partial<ManagedPlace> = {}): ManagedPlace {
  return {
    id: 'p1',
    name: 'Bãi Sao',
    slug: 'bai-sao',
    category_id: 'c1',
    category_slug: 'beach',
    short_description: null,
    price_range: null,
    cover_image_url: null,
    rating_avg: null,
    rating_count: 0,
    verification_status: 'pending',
    status: 'pending',
    location: { lat: 10.05, lng: 104.0 },
    address: null,
    ward: 'An Thới',
    description: null,
    osm_id: null,
    opening_hours: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-05T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  mockReadSession.mockReset().mockReturnValue(SESSION);
  mockListMyPlaces.mockReset().mockResolvedValue([]);
  mockArchivePlace.mockReset().mockResolvedValue(null);
  mockListCategories.mockReset().mockResolvedValue([]);
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => jest.restoreAllMocks());

describe('MyPlacesView — chưa đăng nhập', () => {
  it('không có session → hiển thị yêu cầu đăng nhập, không gọi API', async () => {
    mockReadSession.mockReturnValue(null);
    render(<MyPlacesView />);
    await waitFor(() => expect(screen.getByText('Cần đăng nhập')).toBeInTheDocument());
    expect(mockListMyPlaces).not.toHaveBeenCalled();
  });
});

describe('MyPlacesView — lỗi tải', () => {
  it('API lỗi 4xx → hiển thị thông báo lỗi + nút Thử lại tải lại', async () => {
    mockListMyPlaces.mockRejectedValueOnce(new ApiError('sự cố', 400));
    render(<MyPlacesView />);
    await waitFor(() => expect(screen.getByText('Không tải được danh sách')).toBeInTheDocument());

    mockListMyPlaces.mockResolvedValueOnce([place()]);
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(screen.getByText('Bãi Sao')).toBeInTheDocument());
  });
});

describe('MyPlacesView — rỗng', () => {
  it('không có địa điểm nào → trạng thái rỗng với liên kết thêm địa điểm', async () => {
    render(<MyPlacesView />);
    await waitFor(() => expect(screen.getByText('Chưa có địa điểm nào')).toBeInTheDocument());
    expect(screen.getAllByRole('link', { name: /Thêm địa điểm/ })[0]).toHaveAttribute(
      'href',
      '/dashboard/places/new',
    );
  });
});

describe('MyPlacesView — danh sách', () => {
  it('render tên, trạng thái, khu vực, ngày cập nhật, liên kết sửa đúng id', async () => {
    mockListMyPlaces.mockResolvedValue([place({ id: 'p1', status: 'published' })]);
    render(<MyPlacesView />);

    await waitFor(() => expect(screen.getByText('Bãi Sao')).toBeInTheDocument());
    expect(screen.getByText('Đã duyệt')).toBeInTheDocument();
    expect(screen.getByText('An Thới')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sửa' })).toHaveAttribute('href', '/dashboard/places/p1/edit');
  });
});

describe('MyPlacesView — lưu trữ (archive)', () => {
  it('xác nhận → gọi archivePlace rồi tải lại danh sách', async () => {
    mockListMyPlaces
      .mockResolvedValueOnce([place({ id: 'p1' })])
      .mockResolvedValueOnce([]);
    render(<MyPlacesView />);
    await waitFor(() => expect(screen.getByText('Bãi Sao')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));

    await waitFor(() => expect(mockArchivePlace).toHaveBeenCalledWith('p1', 'tok'));
    await waitFor(() => expect(mockListMyPlaces).toHaveBeenCalledTimes(2));
  });

  it('huỷ xác nhận → KHÔNG gọi archivePlace', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    mockListMyPlaces.mockResolvedValue([place({ id: 'p1' })]);
    render(<MyPlacesView />);
    await waitFor(() => expect(screen.getByText('Bãi Sao')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));

    expect(mockArchivePlace).not.toHaveBeenCalled();
  });

  it('backend từ chối 403 (đúng thực tế: business role chưa có Place.Archive.Managed) → thông báo rõ ràng', async () => {
    mockListMyPlaces.mockResolvedValue([place({ id: 'p1' })]);
    mockArchivePlace.mockRejectedValue(new ApiError('forbidden', 403));
    render(<MyPlacesView />);
    await waitFor(() => expect(screen.getByText('Bãi Sao')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Lưu trữ' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('chỉ kiểm duyệt viên'));
  });
});
