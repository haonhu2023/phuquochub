/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditPlaceView } from './EditPlaceView';
import { readSession } from '@/modules/auth/session';
import { previewPlace, publishPlace, publishPlaceDraft, saveDraftPlace, unpublishPlace } from './api/place-management.api';
import { listCategories } from '@/modules/categories/api/categories.api';
import { ApiError } from '@/lib/http';
import { triggerRevalidate } from '@/lib/revalidate';
import type { ManagedPlace } from './types';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/place-management.api', () => ({
  previewPlace: jest.fn(),
  publishPlace: jest.fn(),
  unpublishPlace: jest.fn(),
  saveDraftPlace: jest.fn(),
  publishPlaceDraft: jest.fn(),
}));
jest.mock('@/modules/categories/api/categories.api', () => ({ listCategories: jest.fn() }));
jest.mock('@/lib/revalidate', () => ({ triggerRevalidate: jest.fn() }));

const mockReadSession = readSession as jest.Mock;
const mockPreviewPlace = previewPlace as jest.Mock;
const mockPublishPlace = publishPlace as jest.Mock;
const mockUnpublishPlace = unpublishPlace as jest.Mock;
const mockSaveDraft = saveDraftPlace as jest.Mock;
const mockPublishDraft = publishPlaceDraft as jest.Mock;
const mockListCategories = listCategories as jest.Mock;
const mockTriggerRevalidate = triggerRevalidate as jest.Mock;

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
    opening_hours: { is_24h: false, regular: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] } },
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
  mockSaveDraft.mockReset().mockResolvedValue({ id: 'rev1', revisionNumber: 1 });
  mockPublishDraft.mockReset().mockResolvedValue(place());
  mockListCategories.mockReset().mockResolvedValue([{ id: 'c1', name_vi: 'Bãi biển', slug: 'beach' }]);
  mockTriggerRevalidate.mockReset();
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => jest.restoreAllMocks());

async function renderReady(overrides: Partial<ManagedPlace> = {}) {
  mockPreviewPlace.mockResolvedValue(place(overrides));
  render(<EditPlaceView placeId="p1" />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeInTheDocument());
}

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

  // C1 (2026-09-22) — proof thật (curl trên production build thật, xem plan checkpoint) đã xác
  // nhận toàn bộ chu trình cache→mutate→revalidate→fresh hoạt động đúng; test dưới đây chỉ khoá
  // ĐÚNG các call site gọi triggerRevalidate với đúng tag, không thay thế cho proof thật đó.
  it('publish thành công → gọi triggerRevalidate với đúng tag places:list + place:<slug>', async () => {
    mockPreviewPlace.mockResolvedValueOnce(place({ status: 'draft', slug: 'bai-sao' })).mockResolvedValueOnce(place({ status: 'published', slug: 'bai-sao' }));
    mockPublishPlace.mockResolvedValue(null);
    render(<EditPlaceView placeId="p1" />);

    await waitFor(() => screen.getByRole('button', { name: /Xuất bản/ }));
    fireEvent.click(screen.getByRole('button', { name: /Xuất bản/ }));

    await waitFor(() => expect(mockTriggerRevalidate).toHaveBeenCalledWith({ entityType: 'place', slug: 'bai-sao' }, 'tok'));
  });

  it('unpublish thành công → gọi triggerRevalidate với đúng tag places:list + place:<slug>', async () => {
    mockPreviewPlace.mockResolvedValue(place({ status: 'published', slug: 'bai-sao' }));
    mockUnpublishPlace.mockResolvedValue(null);
    render(<EditPlaceView placeId="p1" />);

    await waitFor(() => screen.getByRole('button', { name: /Gỡ công khai/ }));
    fireEvent.click(screen.getByRole('button', { name: /Gỡ công khai/ }));

    await waitFor(() => expect(mockTriggerRevalidate).toHaveBeenCalledWith({ entityType: 'place', slug: 'bai-sao' }, 'tok'));
  });

  it('publishPlace thất bại → KHÔNG gọi triggerRevalidate (không invalidate sai khi mutation lỗi)', async () => {
    mockPreviewPlace.mockResolvedValue(place({ status: 'draft', slug: 'bai-sao' }));
    mockPublishPlace.mockRejectedValue(new ApiError('forbidden', 403));
    render(<EditPlaceView placeId="p1" />);

    await waitFor(() => screen.getByRole('button', { name: /Xuất bản/ }));
    fireEvent.click(screen.getByRole('button', { name: /Xuất bản/ }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(mockTriggerRevalidate).not.toHaveBeenCalled();
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

// Gộp nhánh production 2026-09-23: handleSubmit (nút "Lưu thay đổi") đi qua
// saveDraftPlace()->publishPlaceDraft() (xmin CAS, PlacesService.saveDraft/publishDraft) — KHÔNG
// còn qua updatePlace()/content_version trực tiếp cho luồng NÀY (content_version CAS vẫn tồn tại ở
// backend/place-management.api.ts, nhưng EditPlaceView không phải caller của nó nữa sau khi gộp).
describe('EditPlaceView — chống ghi đè theo bảng chức năng (hoàn tất 2026-09-17, gộp 2026-09-23)', () => {
  it('sửa trường scalar (địa chỉ) → saveDraftPlace rồi publishPlaceDraft, kèm location hiện có', async () => {
    await renderReady();

    fireEvent.change(screen.getByLabelText(/Địa chỉ/), { target: { value: 'Địa chỉ mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() =>
      expect(mockSaveDraft).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ address: 'Địa chỉ mới', category_id: 'c1', location: { lat: 10.05, lng: 104.0 } }),
        'tok',
      ),
    );
    await waitFor(() => expect(mockPublishDraft).toHaveBeenCalledWith('p1', 'rev1', 'tok'));
  });

  it('publishPlaceDraft trả 409 → thông điệp rõ ràng', async () => {
    mockPublishDraft.mockRejectedValueOnce(new ApiError('conflict', 409));
    await renderReady();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Địa điểm đã được người khác cập nhật — tải lại trang và thử lại.'),
    );
  });

  it.each([
    ['Mô tả chi tiết', 'Mô tả mới'],
    ['Mô tả ngắn', 'Ngắn mới'],
    ['Tên địa điểm', 'Tên mới'],
  ])('sửa %s → CHẶN submit, KHÔNG gọi bất kỳ API ghi nào, hướng dẫn dùng nút ✏️', async (label, value) => {
    await renderReady();

    fireEvent.change(screen.getByLabelText(new RegExp(label)), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/nút ✏️/));
    expect(mockSaveDraft).not.toHaveBeenCalled();
    expect(mockPublishDraft).not.toHaveBeenCalled();
  });

  it('không đổi tên/mô tả ngắn/mô tả → submit vẫn chạy bình thường (so sánh không tự dương tính giả)', async () => {
    await renderReady();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(mockSaveDraft).toHaveBeenCalled());
    await waitFor(() => expect(mockPublishDraft).toHaveBeenCalled());
  });

  it('sửa toạ độ (location) → đi qua saveDraftPlace/publishPlaceDraft như mọi trường scalar khác (CAS thật, không còn PATCH trực tiếp)', async () => {
    await renderReady();

    fireEvent.change(screen.getByLabelText(/Vĩ độ/), { target: { value: '10.2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() =>
      expect(mockSaveDraft).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ location: { lat: 10.2, lng: 104.0 } }),
        'tok',
      ),
    );
  });

  // C1 — chỉ đáng invalidate cache công khai khi place ĐÃ published TRƯỚC lần sửa này.
  it('sửa place ĐÃ published → gọi triggerRevalidate (nội dung công khai vừa đổi)', async () => {
    await renderReady({ status: 'published', slug: 'bai-sao' });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(mockPublishDraft).toHaveBeenCalled());
    await waitFor(() => expect(mockTriggerRevalidate).toHaveBeenCalledWith({ entityType: 'place', slug: 'bai-sao' }, 'tok'));
  });

  it('sửa place CÒN draft → KHÔNG gọi triggerRevalidate (chưa từng có trong cache công khai)', async () => {
    await renderReady({ status: 'draft' });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(mockPublishDraft).toHaveBeenCalled());
    expect(mockTriggerRevalidate).not.toHaveBeenCalled();
  });

  // Bug thật tìm bằng Playwright T1 (2026-09-22): `<PlaceForm key={content_version} .../>` remount
  // PlaceForm ngay sau một lần lưu thành công, nên thông điệp "Đã lưu thành công." nội bộ của
  // PlaceForm (đặt SAU khi `onSubmit` resolve) không bao giờ kịp hiển thị — xác nhận bằng tay qua
  // trình duyệt thật (lưu thành công, content_version tăng, không thông báo nào hiện). Sửa bằng
  // cách đặt thông báo Ở EditPlaceView (không bị remount) — test này khoá đúng hành vi đó, nay qua
  // luồng saveDraftPlace/publishPlaceDraft (gộp nhánh 2026-09-23) thay vì updatePlace trực tiếp.
  it('lưu thành công → "Đã lưu thành công." hiện được (không bị remount PlaceForm nuốt mất)', async () => {
    await renderReady();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(screen.getByText('Đã lưu thành công.')).toBeInTheDocument());
  });
});
