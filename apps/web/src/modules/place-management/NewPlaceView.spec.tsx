/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NewPlaceView } from './NewPlaceView';
import { readSession } from '@/modules/auth/session';
import { createPlace } from './api/place-management.api';
import { listCategories } from '@/modules/categories/api/categories.api';
import type { ManagedPlace } from './types';

const replace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/place-management.api', () => ({ createPlace: jest.fn() }));
jest.mock('@/modules/categories/api/categories.api', () => ({ listCategories: jest.fn() }));

const mockReadSession = readSession as jest.Mock;
const mockCreatePlace = createPlace as jest.Mock;
const mockListCategories = listCategories as jest.Mock;

const SESSION = { accessToken: 'tok', refreshToken: 'r', expiresAt: 0, user: { id: 'u1', email: 'a@b.c', displayName: 'A', avatarUrl: null } };

function created(overrides: Partial<ManagedPlace> = {}): ManagedPlace {
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
    content_version: 1,
    status: 'pending',
    location: { lat: 10.05, lng: 104.0 },
    address: null,
    ward: null,
    province: null,
    admin_area: null,
    description: null,
    osm_id: null,
    opening_hours: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    verified_at: null,
    en_display_name_approved: false,
    en_short_description_approved: false,
    ...overrides,
  };
}

beforeEach(() => {
  replace.mockReset();
  mockReadSession.mockReset().mockReturnValue(SESSION);
  mockCreatePlace.mockReset();
  mockListCategories.mockReset().mockResolvedValue([{ id: 'c1', name_vi: 'Bãi biển', slug: 'beach' }]);
});

async function fillAndSubmit() {
  await waitFor(() => screen.getByLabelText(/Tên địa điểm/));
  fireEvent.change(screen.getByLabelText(/Tên địa điểm/), { target: { value: 'Bãi Sao' } });
  fireEvent.change(screen.getByLabelText(/Danh mục/), { target: { value: 'c1' } });
  fireEvent.change(screen.getByLabelText(/Vĩ độ/), { target: { value: '10.05' } });
  fireEvent.change(screen.getByLabelText(/Kinh độ/), { target: { value: '104.0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Tạo địa điểm' }));
}

describe('NewPlaceView — P1 self-publish redirect', () => {
  it('tạo place status=draft (người tạo giữ Place.Approve) → chuyển thẳng sang trang Sửa của place đó', async () => {
    mockCreatePlace.mockResolvedValue(created({ status: 'draft' }));
    render(<NewPlaceView />);

    await fillAndSubmit();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard/places/p1/edit'));
    // KHÔNG hiện màn "đã gửi, chờ kiểm duyệt" cho nhánh tự-xuất-bản.
    expect(screen.queryByText(/đang chờ kiểm duyệt/)).not.toBeInTheDocument();
  });

  it('tạo place status=pending (đóng góp cộng đồng) → hiện màn "đã gửi, chờ kiểm duyệt", KHÔNG điều hướng', async () => {
    mockCreatePlace.mockResolvedValue(created({ status: 'pending' }));
    render(<NewPlaceView />);

    await fillAndSubmit();

    await waitFor(() => expect(screen.getByText(/Đã gửi "Bãi Sao"/)).toBeInTheDocument());
    expect(replace).not.toHaveBeenCalled();
  });
});
