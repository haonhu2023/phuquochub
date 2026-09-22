/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditPlaceView } from './EditPlaceView';
import { readSession } from '@/modules/auth/session';
import { previewPlace, publishPlace, unpublishPlace, updatePlace } from './api/place-management.api';
import { listCategories } from '@/modules/categories/api/categories.api';
import { ApiError } from '@/lib/http';
import type { ManagedPlace } from './types';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/place-management.api', () => ({
  previewPlace: jest.fn(),
  publishPlace: jest.fn(),
  unpublishPlace: jest.fn(),
  updatePlace: jest.fn(),
}));
jest.mock('@/modules/categories/api/categories.api', () => ({ listCategories: jest.fn() }));

const mockReadSession = readSession as jest.Mock;
const mockPreviewPlace = previewPlace as jest.Mock;
const mockPublishPlace = publishPlace as jest.Mock;
const mockUnpublishPlace = unpublishPlace as jest.Mock;
const mockUpdatePlace = updatePlace as jest.Mock;
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
    content_version: 3,
    status: 'draft',
    location: { lat: 10.05, lng: 104.0 },
    address: null,
    ward: 'An Thới',
    province: null,
    admin_area: null,
    description: null,
    osm_id: null,
    opening_hours: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-05T00:00:00.000Z',
    verified_at: null,
    en_display_name_approved: false,
    en_short_description_approved: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockReadSession.mockReset().mockReturnValue(SESSION);
  mockPreviewPlace.mockReset();
  mockPublishPlace.mockReset();
  mockUnpublishPlace.mockReset();
  mockUpdatePlace.mockReset();
  mockListCategories.mockReset().mockResolvedValue([{ id: 'c1', name_vi: 'Bãi biển', slug: 'beach' }]);
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => jest.restoreAllMocks());

describe('EditPlaceView — tải dữ liệu', () => {
  it('tải qua previewPlace (P3) — KHÔNG qua listMyPlaces (content_owner không có gì ở đó)', async () => {
    mockPreviewPlace.mockResolvedValue(place());
    render(<EditPlaceView placeId="p1" />);

    await waitFor(() => expect(screen.getByText(/Sửa: Bãi Sao/)).toBeInTheDocument());
    expect(mockPreviewPlace).toHaveBeenCalledWith('p1', 'tok');
  });

  it('preview trả 403/404 → "không tìm thấy" (không phân biệt lý do)', async () => {
    mockPreviewPlace.mockRejectedValue(new ApiError('forbidden', 403));
    render(<EditPlaceView placeId="p1" />);

    await waitFor(() => expect(screen.getByText('Không tìm thấy địa điểm')).toBeInTheDocument());
  });
});

describe('EditPlaceView — xuất bản / gỡ công khai (P1)', () => {
  it('place draft → hiện nút "Xuất bản", KHÔNG hiện "Gỡ công khai"', async () => {
    mockPreviewPlace.mockResolvedValue(place({ status: 'draft' }));
    render(<EditPlaceView placeId="p1" />);

    await waitFor(() => expect(screen.getByRole('button', { name: /Xuất bản/ })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Gỡ công khai/ })).not.toBeInTheDocument();
  });

  it('bấm Xuất bản → gọi publishPlace rồi tải lại', async () => {
    mockPreviewPlace.mockResolvedValueOnce(place({ status: 'draft' })).mockResolvedValueOnce(place({ status: 'published' }));
    mockPublishPlace.mockResolvedValue(null);
    render(<EditPlaceView placeId="p1" />);

    await waitFor(() => screen.getByRole('button', { name: /Xuất bản/ }));
    fireEvent.click(screen.getByRole('button', { name: /Xuất bản/ }));

    await waitFor(() => expect(mockPublishPlace).toHaveBeenCalledWith('p1', 'tok'));
    await waitFor(() => expect(mockPreviewPlace).toHaveBeenCalledTimes(2));
  });

  it('place published → hiện nút "Gỡ công khai"; xác nhận trước khi gọi API', async () => {
    mockPreviewPlace.mockResolvedValue(place({ status: 'published' }));
    mockUnpublishPlace.mockResolvedValue(null);
    render(<EditPlaceView placeId="p1" />);

    await waitFor(() => screen.getByRole('button', { name: /Gỡ công khai/ }));
    fireEvent.click(screen.getByRole('button', { name: /Gỡ công khai/ }));

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(mockUnpublishPlace).toHaveBeenCalledWith('p1', 'tok'));
  });

  it('huỷ hộp thoại xác nhận → KHÔNG gọi unpublishPlace', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    mockPreviewPlace.mockResolvedValue(place({ status: 'published' }));
    render(<EditPlaceView placeId="p1" />);

    await waitFor(() => screen.getByRole('button', { name: /Gỡ công khai/ }));
    fireEvent.click(screen.getByRole('button', { name: /Gỡ công khai/ }));

    expect(mockUnpublishPlace).not.toHaveBeenCalled();
  });

  it('publishPlace lỗi 403 → thông báo rõ, KHÔNG âm thầm nuốt lỗi', async () => {
    mockPreviewPlace.mockResolvedValue(place({ status: 'draft' }));
    mockPublishPlace.mockRejectedValue(new ApiError('forbidden', 403));
    render(<EditPlaceView placeId="p1" />);

    await waitFor(() => screen.getByRole('button', { name: /Xuất bản/ }));
    fireEvent.click(screen.getByRole('button', { name: /Xuất bản/ }));

    await waitFor(() =>
      expect(screen.getByText(/Bạn không có quyền xuất bản/)).toBeInTheDocument(),
    );
  });
});

describe('EditPlaceView — xung đột content_version (P2)', () => {
  it('lưu thành công → gọi updatePlace với expected_content_version từ place vừa tải', async () => {
    mockPreviewPlace.mockResolvedValue(place({ content_version: 5 }));
    mockUpdatePlace.mockResolvedValue(place({ content_version: 6 }));
    render(<EditPlaceView placeId="p1" />);

    await waitFor(() => screen.getByRole('button', { name: 'Lưu thay đổi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() =>
      expect(mockUpdatePlace).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ expected_content_version: 5 }),
        'tok',
      ),
    );
  });

  it('409 (token cũ) → thông báo tải lại, KHÔNG throw ra ngoài form', async () => {
    mockPreviewPlace.mockResolvedValue(place({ content_version: 5 }));
    mockUpdatePlace.mockRejectedValue(new ApiError('conflict', 409));
    render(<EditPlaceView placeId="p1" />);

    await waitFor(() => screen.getByRole('button', { name: 'Lưu thay đổi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() =>
      expect(screen.getByText(/vừa được sửa bởi người khác/)).toBeInTheDocument(),
    );
    // Dữ liệu người dùng đang nhập vẫn còn trên form — tên vẫn hiển thị đúng giá trị cũ, chưa mất.
    expect(screen.getByDisplayValue('Bãi Sao')).toBeInTheDocument();
  });
});
