/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RealEstateListingPhotosManager } from './RealEstateListingPhotosManager';
import {
  deleteRealEstateListingPhoto,
  listMyRealEstateListingPhotos,
  presignRealEstateListingPhoto,
  registerRealEstateListingPhoto,
} from './api/real-estate-listing-photos.api';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import type { RealEstateListingPhoto } from './types';

jest.mock('./api/real-estate-listing-photos.api', () => ({
  listMyRealEstateListingPhotos: jest.fn(),
  presignRealEstateListingPhoto: jest.fn(),
  registerRealEstateListingPhoto: jest.fn(),
  deleteRealEstateListingPhoto: jest.fn(),
}));
jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('@/lib/sha256', () => ({ sha256Hex: jest.fn().mockResolvedValue('a'.repeat(64)) }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockList = listMyRealEstateListingPhotos as jest.Mock;
const mockPresign = presignRealEstateListingPhoto as jest.Mock;
const mockRegister = registerRealEstateListingPhoto as jest.Mock;
const mockDelete = deleteRealEstateListingPhoto as jest.Mock;
const mockSession = readSession as jest.Mock;

const LISTING_ID = 'rel-1';
const SESSION = {
  accessToken: 'tok',
  refreshToken: 'r',
  expiresAt: 0,
  user: { id: 'u1', email: 'a@b.c', displayName: 'A', avatarUrl: null },
};

function photo(overrides: Partial<RealEstateListingPhoto> = {}): RealEstateListingPhoto {
  const id = overrides.id ?? 'p1';
  return {
    id,
    sort_order: 0,
    url: `/api/real-estate-listings/${LISTING_ID}/photos/${id}/owner-file`,
    created_at: '2026-10-08T00:00:00.000Z',
    ...overrides,
  };
}

function selectFile(name = 'photo.jpg', type = 'image/jpeg', size = 1000) {
  const input = screen.getByLabelText('Chọn ảnh để tải lên');
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

beforeEach(() => {
  mockSession.mockReset().mockReturnValue(SESSION);
  mockList.mockReset().mockResolvedValue([]);
  mockPresign.mockReset().mockResolvedValue({ key: 'real-estate-listing-photos/x.jpg', upload_url: 'https://s/put', expires_in: 600 });
  mockRegister.mockReset().mockResolvedValue(photo());
  mockDelete.mockReset().mockResolvedValue(null);
  // Dùng chung cho PUT ảnh lên presigned URL VÀ tải thumbnail qua kênh có xác thực (cùng pattern
  // PhotosView.spec.tsx của place-photos).
  global.fetch = jest.fn((url: RequestInfo | URL) =>
    Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve({ __url: String(url) }) }),
  ) as unknown as typeof fetch;
  global.URL.createObjectURL = jest.fn((blob: unknown) => `blob:${(blob as { __url: string }).__url}`);
  global.URL.revokeObjectURL = jest.fn();
  window.confirm = jest.fn().mockReturnValue(true);
});

describe('RealEstateListingPhotosManager — quyền truy cập', () => {
  it('chưa đăng nhập → yêu cầu đăng nhập, KHÔNG gọi API', async () => {
    mockSession.mockReturnValue(null);
    render(<RealEstateListingPhotosManager listingId={LISTING_ID} />);
    await waitFor(() => expect(screen.getByText('Cần đăng nhập')).toBeInTheDocument());
    expect(mockList).not.toHaveBeenCalled();
  });

  it('403 → trạng thái không có quyền', async () => {
    mockList.mockRejectedValueOnce(new ApiError('Thiếu quyền', 403));
    render(<RealEstateListingPhotosManager listingId={LISTING_ID} />);
    await waitFor(() => expect(screen.getByText('Không có quyền truy cập')).toBeInTheDocument());
  });
});

describe('RealEstateListingPhotosManager — hiển thị & gỡ ảnh', () => {
  it('rỗng → trạng thái rỗng', async () => {
    render(<RealEstateListingPhotosManager listingId={LISTING_ID} />);
    await waitFor(() => expect(screen.getByText('Chưa có ảnh nào')).toBeInTheDocument());
  });

  it('có ảnh → hiện nút "Gỡ ảnh"; bấm + xác nhận → gọi deleteRealEstateListingPhoto đúng listing/photo', async () => {
    mockList.mockResolvedValueOnce([photo({ id: 'p1' })]);
    render(<RealEstateListingPhotosManager listingId={LISTING_ID} />);

    const btn = await screen.findByRole('button', { name: 'Gỡ ảnh' });
    mockList.mockResolvedValueOnce([]);
    fireEvent.click(btn);

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith(LISTING_ID, 'p1', 'tok'));
    await waitFor(() => expect(screen.getByText('Đã gỡ ảnh.')).toBeInTheDocument());
  });

  it('huỷ xác nhận → KHÔNG gọi deleteRealEstateListingPhoto', async () => {
    window.confirm = jest.fn().mockReturnValue(false);
    mockList.mockResolvedValueOnce([photo({ id: 'p1' })]);
    render(<RealEstateListingPhotosManager listingId={LISTING_ID} />);

    const btn = await screen.findByRole('button', { name: 'Gỡ ảnh' });
    fireEvent.click(btn);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

describe('RealEstateListingPhotosManager — tải ảnh lên', () => {
  it('chọn ảnh hợp lệ → presign rồi register đúng listingId, hiện thông báo, tải lại danh sách', async () => {
    render(<RealEstateListingPhotosManager listingId={LISTING_ID} />);
    await waitFor(() => expect(screen.getByText('Chưa có ảnh nào')).toBeInTheDocument());

    mockList.mockResolvedValueOnce([photo()]);
    selectFile();

    await waitFor(() => expect(mockPresign).toHaveBeenCalledWith(LISTING_ID, expect.objectContaining({ content_type: 'image/jpeg' }), 'tok'));
    await waitFor(() => expect(mockRegister).toHaveBeenCalledWith(LISTING_ID, 'real-estate-listing-photos/x.jpg', 'tok'));
    await waitFor(() => expect(screen.getByText('Đã thêm ảnh.')).toBeInTheDocument());
  });

  it('ảnh có GPS EXIF (422 từ backend) → hiện đúng thông điệp backend trả về', async () => {
    mockPresign.mockResolvedValueOnce({ key: 'real-estate-listing-photos/y.jpg', upload_url: 'https://s/put', expires_in: 600 });
    mockRegister.mockRejectedValueOnce(new ApiError('Ảnh này có chứa toạ độ GPS (EXIF)…', 422));
    render(<RealEstateListingPhotosManager listingId={LISTING_ID} />);
    await waitFor(() => expect(screen.getByText('Chưa có ảnh nào')).toBeInTheDocument());

    selectFile();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Ảnh này có chứa toạ độ GPS (EXIF)…'));
  });

  it('đã đủ 10 ảnh → chặn ngay phía client, KHÔNG gọi presign', async () => {
    mockList.mockResolvedValueOnce(Array.from({ length: 10 }, (_, i) => photo({ id: `p${i}` })));
    render(<RealEstateListingPhotosManager listingId={LISTING_ID} />);
    await screen.findAllByRole('button', { name: 'Gỡ ảnh' });

    selectFile();

    expect(await screen.findByRole('alert')).toHaveTextContent('Tối đa 10 ảnh mỗi tin');
    expect(mockPresign).not.toHaveBeenCalled();
  });

  it('tệp không phải ảnh hợp lệ → chặn phía client, KHÔNG gọi presign', async () => {
    render(<RealEstateListingPhotosManager listingId={LISTING_ID} />);
    await waitFor(() => expect(screen.getByText('Chưa có ảnh nào')).toBeInTheDocument());

    selectFile('doc.pdf', 'application/pdf');

    expect(await screen.findByRole('alert')).toHaveTextContent('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.');
    expect(mockPresign).not.toHaveBeenCalled();
  });
});
