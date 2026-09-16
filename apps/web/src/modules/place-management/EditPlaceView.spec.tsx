/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditPlaceView } from './EditPlaceView';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import {
  listMyPlaces,
  publishPlaceDraft,
  saveDraftPlace,
  updatePlaceLegacyFields,
} from './api/place-management.api';
import { listCategories } from '@/modules/categories/api/categories.api';
import type { Category } from '@/modules/categories/api/categories.api';
import type { ManagedPlace } from './types';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/place-management.api', () => ({
  listMyPlaces: jest.fn(),
  saveDraftPlace: jest.fn(),
  publishPlaceDraft: jest.fn(),
  updatePlaceLegacyFields: jest.fn(),
}));
jest.mock('@/modules/categories/api/categories.api', () => ({ listCategories: jest.fn() }));

const mockSession = readSession as jest.Mock;
const mockListMyPlaces = listMyPlaces as jest.Mock;
const mockSaveDraft = saveDraftPlace as jest.Mock;
const mockPublishDraft = publishPlaceDraft as jest.Mock;
const mockUpdateLegacy = updatePlaceLegacyFields as jest.Mock;
const mockListCategories = listCategories as jest.Mock;

const SESSION = {
  accessToken: 'tok',
  refreshToken: 'r',
  expiresAt: 0,
  user: { id: 'u1', email: 'a@b.c', displayName: 'A', avatarUrl: null },
};

const CATEGORIES: Category[] = [{ id: 'c1', slug: 'hotel', name_vi: 'Khách sạn', name_en: 'Hotel', icon: null, parent_id: null }];

const PLACE: ManagedPlace = {
  id: 'p1',
  slug: 'novotel',
  name: 'Novotel',
  category_id: 'c1',
  category_slug: 'hotel',
  cover_image_url: null,
  rating_avg: 0,
  rating_count: 0,
  verification_status: 'pending',
  status: 'pending',
  location: { lat: 10.05, lng: 104.0 },
  address: 'Địa chỉ cũ',
  ward: null,
  province: null,
  admin_area: null,
  description: 'Mô tả cũ',
  short_description: 'Ngắn cũ',
  osm_id: null,
  opening_hours: { is_24h: false, regular: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] } },
  price_range: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  verified_at: null,
};

beforeEach(() => {
  mockSession.mockReset().mockReturnValue(SESSION);
  mockListMyPlaces.mockReset().mockResolvedValue([PLACE]);
  mockListCategories.mockReset().mockResolvedValue(CATEGORIES);
  mockSaveDraft.mockReset().mockResolvedValue({ id: 'rev1', revisionNumber: 1 });
  mockPublishDraft.mockReset().mockResolvedValue(PLACE);
  mockUpdateLegacy.mockReset().mockResolvedValue(PLACE);
});

async function renderReady() {
  render(<EditPlaceView placeId="p1" />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu thay đổi' })).toBeInTheDocument());
}

describe('EditPlaceView — chống ghi đè theo bảng chức năng (2026-09-17)', () => {
  it('sửa trường scalar (địa chỉ) -> saveDraftPlace rồi publishPlaceDraft, ĐÚNG payload scalar, KHÔNG kèm name/description', async () => {
    await renderReady();

    fireEvent.change(screen.getByLabelText(/Địa chỉ/), { target: { value: 'Địa chỉ mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() =>
      expect(mockSaveDraft).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ address: 'Địa chỉ mới', category_id: 'c1' }),
        'tok',
      ),
    );
    await waitFor(() => expect(mockPublishDraft).toHaveBeenCalledWith('p1', 'rev1', 'tok'));
  });

  it('publishPlaceDraft trả 409 -> thông điệp rõ ràng, KHÔNG gọi updatePlaceLegacyFields', async () => {
    mockPublishDraft.mockRejectedValueOnce(new ApiError('conflict', 409));
    await renderReady();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Địa điểm đã được người khác cập nhật — tải lại trang và thử lại.'),
    );
    expect(mockUpdateLegacy).not.toHaveBeenCalled();
  });

  it('sửa mô tả chi tiết -> CHẶN submit, KHÔNG gọi bất kỳ API ghi nào, hướng dẫn dùng nút ✏️', async () => {
    await renderReady();

    fireEvent.change(screen.getByLabelText('Mô tả chi tiết'), { target: { value: 'Mô tả mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/nút ✏️/));
    expect(mockSaveDraft).not.toHaveBeenCalled();
    expect(mockPublishDraft).not.toHaveBeenCalled();
    expect(mockUpdateLegacy).not.toHaveBeenCalled();
  });

  it('không đổi mô tả -> submit vẫn chạy bình thường (so sánh không tự dương tính giả)', async () => {
    await renderReady();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(mockSaveDraft).toHaveBeenCalled());
    await waitFor(() => expect(mockUpdateLegacy).toHaveBeenCalled());
  });

  it('sửa tên -> vẫn ghi qua updatePlaceLegacyFields (không CAS, hành vi cũ không đổi)', async () => {
    await renderReady();

    fireEvent.change(screen.getByLabelText(/Tên địa điểm/), { target: { value: 'Tên mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() =>
      expect(mockUpdateLegacy).toHaveBeenCalledWith(
        'p1',
        { name: 'Tên mới', short_description: 'Ngắn cũ', location: { lat: 10.05, lng: 104.0 } },
        'tok',
      ),
    );
  });
});
