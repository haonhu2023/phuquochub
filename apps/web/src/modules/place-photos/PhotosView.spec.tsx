/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PhotosView } from './PhotosView';
import {
  deletePlacePhoto,
  listPlacePhotos,
  presignPlacePhoto,
  registerPlacePhoto,
  reorderPlacePhotos,
  setPlacePhotoCover,
} from './api/place-photos.api';
import { readSession } from '@/modules/auth/session';
import { ApiError } from '@/lib/http';
import type { PlacePhoto } from './types';

jest.mock('./api/place-photos.api', () => ({
  listPlacePhotos: jest.fn(),
  presignPlacePhoto: jest.fn(),
  registerPlacePhoto: jest.fn(),
  deletePlacePhoto: jest.fn(),
  reorderPlacePhotos: jest.fn(),
  setPlacePhotoCover: jest.fn(),
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

const mockList = listPlacePhotos as jest.Mock;
const mockPresign = presignPlacePhoto as jest.Mock;
const mockRegister = registerPlacePhoto as jest.Mock;
const mockDelete = deletePlacePhoto as jest.Mock;
const mockReorder = reorderPlacePhotos as jest.Mock;
const mockSetCover = setPlacePhotoCover as jest.Mock;
const mockSession = readSession as jest.Mock;

const PLACE_ID = 'place-1';
const SESSION = {
  accessToken: 'tok',
  refreshToken: 'r',
  expiresAt: 0,
  user: { id: 'u1', email: 'a@b.c', displayName: 'A', avatarUrl: null },
};

function photo(overrides: Partial<PlacePhoto> = {}): PlacePhoto {
  const id = overrides.id ?? 'm1';
  return {
    id,
    status: 'pending',
    caption: null,
    alt_text: null,
    created_at: '2026-08-11T00:00:00.000Z',
    url: `/api/places/${PLACE_ID}/media/${id}/file`,
    sort_order: null,
    is_cover: false,
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
  mockPresign.mockReset().mockResolvedValue({ key: 'media/x.jpg', upload_url: 'https://s/put', expires_in: 600 });
  mockRegister.mockReset().mockResolvedValue(photo());
  mockDelete.mockReset().mockResolvedValue(null);
  mockReorder.mockReset().mockResolvedValue([]);
  mockSetCover.mockReset().mockResolvedValue([]);
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
  window.confirm = jest.fn().mockReturnValue(true);
});

describe('PhotosView — quyền truy cập', () => {
  it('chưa đăng nhập → yêu cầu đăng nhập, KHÔNG gọi API', async () => {
    mockSession.mockReturnValue(null);
    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() => expect(screen.getByText('Cần đăng nhập')).toBeInTheDocument());
    expect(mockList).not.toHaveBeenCalled();
  });

  it('403 → trạng thái không có quyền', async () => {
    mockList.mockRejectedValueOnce(new ApiError('Thiếu quyền', 403));
    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() => expect(screen.getByText('Không có quyền truy cập')).toBeInTheDocument());
  });

  it('lỗi 5xx → thông điệp chung, không lộ chi tiết kỹ thuật, có Thử lại', async () => {
    mockList.mockRejectedValueOnce(new ApiError('ECONNREFUSED internal', 500));
    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() =>
      expect(screen.getByText('Đã xảy ra lỗi khi tải danh sách ảnh. Vui lòng thử lại.')).toBeInTheDocument(),
    );
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();

    mockList.mockResolvedValueOnce([photo()]);
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(screen.getByText('Đang chờ duyệt')).toBeInTheDocument());
  });
});

describe('PhotosView — hiển thị trạng thái', () => {
  it('gallery rỗng → trạng thái rỗng', async () => {
    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() => expect(screen.getByText('Chưa có ảnh nào')).toBeInTheDocument());
  });

  // Chủ cơ sở PHẢI hiểu ảnh chưa lên trang — đây là điểm dễ hiểu nhầm nhất của luồng này.
  it('ảnh pending → nhãn "Đang chờ duyệt" + nói rõ chưa hiển thị công khai', async () => {
    mockList.mockResolvedValueOnce([photo({ status: 'pending' })]);
    render(<PhotosView placeId={PLACE_ID} />);

    await waitFor(() => expect(screen.getByText('Đang chờ duyệt')).toBeInTheDocument());
    // Regex, không phải chuỗi khớp tuyệt đối: ghi chú này nay còn nói thêm về điều kiện làm ảnh bìa
    // (Owner Cover & Photo Ordering). Điều PHẢI đúng vẫn y nguyên — ảnh chưa lên trang.
    expect(screen.getByText(/Chưa hiển thị công khai\./)).toBeInTheDocument();
  });

  it('ảnh rejected → nhãn "Bị từ chối" + giải thích', async () => {
    mockList.mockResolvedValueOnce([photo({ id: 'm2', status: 'rejected' })]);
    render(<PhotosView placeId={PLACE_ID} />);

    await waitFor(() => expect(screen.getByText('Bị từ chối')).toBeInTheDocument());
    expect(screen.getByText(/Kiểm duyệt viên đã từ chối ảnh này\./)).toBeInTheDocument();
  });

  it('ảnh published → nhãn "Đã hiển thị", KHÔNG có ghi chú cảnh báo', async () => {
    mockList.mockResolvedValueOnce([photo({ id: 'm3', status: 'published' })]);
    render(<PhotosView placeId={PLACE_ID} />);

    await waitFor(() => expect(screen.getByText('Đã hiển thị')).toBeInTheDocument());
    expect(screen.queryByText('Chưa hiển thị công khai.')).not.toBeInTheDocument();
  });

  // Ảnh chưa duyệt không có URL công khai — src phải là kênh nội bộ theo cơ sở.
  it('ảnh dùng URL nội bộ theo cơ sở, không phải địa chỉ object storage', async () => {
    mockList.mockResolvedValueOnce([photo()]);
    render(<PhotosView placeId={PLACE_ID} />);

    const img = await screen.findByRole('img');
    expect(img).toHaveAttribute('src', `/api/places/${PLACE_ID}/media/m1/file`);
    expect(img.getAttribute('src')).not.toContain('minio');
    expect(img).toHaveAttribute('alt');
  });

  it('nhiều ảnh → render đủ', async () => {
    mockList.mockResolvedValueOnce([
      photo({ id: 'm1', status: 'pending' }),
      photo({ id: 'm2', status: 'published' }),
      photo({ id: 'm3', status: 'rejected' }),
    ]);
    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(3));
  });
});

describe('PhotosView — tải ảnh lên', () => {
  it('luồng đầy đủ: presign → PUT → register, rồi báo ảnh chờ duyệt và nạp lại danh sách', async () => {
    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() => expect(screen.getByText('Chưa có ảnh nào')).toBeInTheDocument());

    mockList.mockResolvedValueOnce([photo()]);
    selectFile();

    await waitFor(() => expect(mockRegister).toHaveBeenCalled());
    expect(mockPresign).toHaveBeenCalledWith(
      PLACE_ID,
      { content_type: 'image/jpeg', size: 1000, checksum_sha256: 'a'.repeat(64) },
      'tok',
    );
    expect(mockRegister).toHaveBeenCalledWith(PLACE_ID, 'media/x.jpg', 'tok');
    await waitFor(() =>
      expect(
        screen.getByText('Đã gửi ảnh. Ảnh sẽ hiển thị công khai sau khi được kiểm duyệt viên duyệt.'),
      ).toBeInTheDocument(),
    );
  });

  // Kiểm tra phía client chỉ để phản hồi nhanh — nhưng phải chặn TRƯỚC khi tốn một vòng presign.
  it('MIME không hỗ trợ → báo lỗi, KHÔNG gọi presign', async () => {
    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() => expect(screen.getByLabelText('Chọn ảnh để tải lên')).toBeInTheDocument());

    selectFile('doc.pdf', 'application/pdf');

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Chỉ hỗ trợ ảnh JPEG, PNG hoặc WebP.'),
    );
    expect(mockPresign).not.toHaveBeenCalled();
  });

  it('ảnh quá 10MB → báo lỗi, KHÔNG gọi presign', async () => {
    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() => expect(screen.getByLabelText('Chọn ảnh để tải lên')).toBeInTheDocument());

    selectFile('big.jpg', 'image/jpeg', 10 * 1024 * 1024 + 1);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Ảnh vượt quá dung lượng tối đa 10MB.'),
    );
    expect(mockPresign).not.toHaveBeenCalled();
  });

  it('presign 403 → thông điệp về quyền, KHÔNG gọi register', async () => {
    mockPresign.mockRejectedValueOnce(new ApiError('Thiếu quyền', 403));
    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() => expect(screen.getByLabelText('Chọn ảnh để tải lên')).toBeInTheDocument());

    selectFile();

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Bạn không có quyền đăng ảnh cho cơ sở này.'),
    );
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('PUT lên storage lỗi mạng → báo lỗi, KHÔNG gọi register', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() => expect(screen.getByLabelText('Chọn ảnh để tải lên')).toBeInTheDocument());

    selectFile();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('register trả 409 (trùng ảnh) → thông điệp dễ hiểu', async () => {
    mockRegister.mockRejectedValueOnce(new ApiError('trùng checksum', 409));
    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() => expect(screen.getByLabelText('Chọn ảnh để tải lên')).toBeInTheDocument());

    selectFile();

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Ảnh này bạn đã tải lên trước đó.'),
    );
  });

  it('đang tải → vô hiệu hoá ô chọn file (chặn gửi trùng)', async () => {
    let resolvePresign: (v: unknown) => void = () => {};
    mockPresign.mockReturnValueOnce(new Promise((r) => { resolvePresign = r; }));

    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() => expect(screen.getByLabelText('Chọn ảnh để tải lên')).toBeInTheDocument());

    selectFile();

    await waitFor(() => expect(screen.getByLabelText('Chọn ảnh để tải lên')).toBeDisabled());
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải ảnh lên…');

    resolvePresign({ key: 'media/x.jpg', upload_url: 'https://s/put', expires_in: 600 });
  });
});

describe('PhotosView — gỡ ảnh', () => {
  it('xác nhận → gọi API đúng place/media rồi nạp lại', async () => {
    mockList.mockResolvedValueOnce([photo()]);
    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Gỡ ảnh' })).toBeInTheDocument());

    mockList.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ ảnh' }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith(PLACE_ID, 'm1', 'tok'));
    await waitFor(() => expect(screen.getByText('Đã gỡ ảnh.')).toBeInTheDocument());
  });

  it('huỷ hộp thoại → KHÔNG gọi API', async () => {
    window.confirm = jest.fn().mockReturnValue(false);
    mockList.mockResolvedValueOnce([photo()]);
    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Gỡ ảnh' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Gỡ ảnh' }));
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('gỡ thất bại → hiện lỗi, ảnh vẫn còn', async () => {
    mockList.mockResolvedValue([photo()]);
    mockDelete.mockRejectedValueOnce(new ApiError('Không tìm thấy', 404));
    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Gỡ ảnh' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Gỡ ảnh' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('img')).toBeInTheDocument();
  });
});

// Owner Cover & Photo Ordering (2026-08-12).
function published(id: string, overrides: Partial<PlacePhoto> = {}): PlacePhoto {
  return photo({ id, status: 'published', ...overrides });
}

const upButtons = () => screen.getAllByRole('button', { name: /Di chuyển ảnh \d+ lên trước/ });
const downButtons = () => screen.getAllByRole('button', { name: /Di chuyển ảnh \d+ xuống sau/ });

describe('PhotosView — ảnh bìa', () => {
  it('ảnh đang là bìa → nhãn "Ảnh bìa", KHÔNG mời đặt lại làm bìa', async () => {
    mockList.mockResolvedValueOnce([published('m1', { is_cover: true })]);
    render(<PhotosView placeId={PLACE_ID} />);

    await waitFor(() => expect(screen.getByText('Ảnh bìa')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Đặt làm ảnh bìa' })).not.toBeInTheDocument();
  });

  it('ảnh đã duyệt, chưa phải bìa → có nút đặt bìa; bấm → gọi API rồi hiện trạng thái mới', async () => {
    mockList.mockResolvedValueOnce([published('m1'), published('m2')]);
    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Đặt làm ảnh bìa' })).toHaveLength(2));

    mockSetCover.mockResolvedValueOnce([published('m1'), published('m2', { is_cover: true })]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Đặt làm ảnh bìa' })[1]);

    await waitFor(() => expect(mockSetCover).toHaveBeenCalledWith(PLACE_ID, 'm2', 'tok'));
    await waitFor(() => expect(screen.getByText('Đã đặt ảnh bìa.')).toBeInTheDocument());
    expect(screen.getByText('Ảnh bìa')).toBeInTheDocument();
    // Danh sách render lại từ response của server, không phải đoán phía client.
    expect(screen.getAllByRole('button', { name: 'Đặt làm ảnh bìa' })).toHaveLength(1);
  });

  // Chốt chặn thật nằm ở backend; giao diện chỉ không mời gọi thao tác chắc chắn bị từ chối.
  it('ảnh PENDING → không có nút đặt bìa, nói rõ phải được duyệt trước', async () => {
    mockList.mockResolvedValueOnce([photo({ id: 'm1', status: 'pending' })]);
    render(<PhotosView placeId={PLACE_ID} />);

    await waitFor(() => expect(screen.getByText('Đang chờ duyệt')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Đặt làm ảnh bìa' })).not.toBeInTheDocument();
    expect(screen.getByText(/Ảnh phải được duyệt trước khi làm ảnh bìa/)).toBeInTheDocument();
  });

  it('ảnh REJECTED → không có nút đặt bìa', async () => {
    mockList.mockResolvedValueOnce([photo({ id: 'm1', status: 'rejected' })]);
    render(<PhotosView placeId={PLACE_ID} />);

    await waitFor(() => expect(screen.getByText('Bị từ chối')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Đặt làm ảnh bìa' })).not.toBeInTheDocument();
  });

  it('ảnh HIDDEN → không có nút đặt bìa', async () => {
    mockList.mockResolvedValueOnce([photo({ id: 'm1', status: 'hidden' })]);
    render(<PhotosView placeId={PLACE_ID} />);

    await waitFor(() => expect(screen.getByText('Đã bị ẩn')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Đặt làm ảnh bìa' })).not.toBeInTheDocument();
  });

  it('API trả 422 → giải thích đúng lý do, danh sách KHÔNG đổi', async () => {
    mockList.mockResolvedValue([published('m1')]);
    mockSetCover.mockRejectedValueOnce(new ApiError('không đủ điều kiện', 422));
    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Đặt làm ảnh bìa' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Đặt làm ảnh bìa' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Chỉ ảnh đã được kiểm duyệt viên duyệt mới đặt được làm ảnh bìa.',
      ),
    );
    expect(screen.queryByText('Ảnh bìa')).not.toBeInTheDocument();
  });

  it('API trả 403 → thông điệp về quyền', async () => {
    mockList.mockResolvedValue([published('m1')]);
    mockSetCover.mockRejectedValueOnce(new ApiError('Thiếu quyền', 403));
    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Đặt làm ảnh bìa' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Đặt làm ảnh bìa' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Bạn không có quyền quản lý ảnh của cơ sở này.'),
    );
  });
});

describe('PhotosView — sắp xếp ảnh', () => {
  const three = () => [published('m1'), published('m2'), published('m3')];
  const srcs = () => screen.getAllByRole('img').map((img) => img.getAttribute('src'));
  const src = (id: string) => `/api/places/${PLACE_ID}/media/${id}/file`;

  it('bấm "Xuống" → gửi TOÀN BỘ danh sách theo thứ tự mới', async () => {
    mockList.mockResolvedValueOnce(three());
    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() => expect(downButtons()).toHaveLength(3));

    mockReorder.mockResolvedValueOnce([published('m2'), published('m1'), published('m3')]);
    fireEvent.click(downButtons()[0]);

    await waitFor(() => expect(mockReorder).toHaveBeenCalledWith(PLACE_ID, ['m2', 'm1', 'm3'], 'tok'));
    await waitFor(() => expect(screen.getByText('Đã lưu thứ tự ảnh.')).toBeInTheDocument());
  });

  it('bấm "Lên" → đổi chỗ với ảnh liền trước', async () => {
    mockList.mockResolvedValueOnce(three());
    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() => expect(upButtons()).toHaveLength(3));

    fireEvent.click(upButtons()[2]);

    await waitFor(() => expect(mockReorder).toHaveBeenCalledWith(PLACE_ID, ['m1', 'm3', 'm2'], 'tok'));
  });

  // Ở biên không có gì để đổi chỗ — nút phải VÔ HIỆU HOÁ, không phải im lặng không làm gì.
  it('ảnh đầu không "Lên" được, ảnh cuối không "Xuống" được', async () => {
    mockList.mockResolvedValueOnce(three());
    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() => expect(upButtons()).toHaveLength(3));

    expect(upButtons()[0]).toBeDisabled();
    expect(downButtons()[2]).toBeDisabled();
    expect(upButtons()[1]).toBeEnabled();
    expect(downButtons()[1]).toBeEnabled();
  });

  it('chỉ có MỘT ảnh → cả hai nút đều vô hiệu hoá', async () => {
    mockList.mockResolvedValueOnce([published('m1')]);
    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() => expect(upButtons()).toHaveLength(1));

    expect(upButtons()[0]).toBeDisabled();
    expect(downButtons()[0]).toBeDisabled();
  });

  it('danh sách render lại theo ĐÚNG thứ tự server trả về', async () => {
    mockList.mockResolvedValueOnce(three());
    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() => expect(downButtons()).toHaveLength(3));

    mockReorder.mockResolvedValueOnce([published('m3'), published('m2'), published('m1')]);
    fireEvent.click(downButtons()[0]);

    await waitFor(() => expect(srcs()).toEqual([src('m3'), src('m2'), src('m1')]));
  });

  it('lưu thất bại → báo lỗi và GIỮ NGUYÊN thứ tự cũ (không hiện thứ tự chưa được lưu)', async () => {
    mockList.mockResolvedValue(three());
    mockReorder.mockRejectedValueOnce(new ApiError('lệch danh sách', 422));
    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() => expect(downButtons()).toHaveLength(3));

    fireEvent.click(downButtons()[0]);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Danh sách ảnh đã thay đổi. Vui lòng tải lại trang rồi thử lại.',
      ),
    );
    expect(srcs()).toEqual([src('m1'), src('m2'), src('m3')]);
  });

  it('lỗi 5xx → thông điệp chung, không lộ chi tiết kỹ thuật', async () => {
    mockList.mockResolvedValue(three());
    mockReorder.mockRejectedValueOnce(new ApiError('ECONNREFUSED internal', 500));
    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() => expect(downButtons()).toHaveLength(3));

    fireEvent.click(downButtons()[0]);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Không lưu được thứ tự ảnh. Vui lòng thử lại.'),
    );
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();
  });

  // Hai thao tác cùng ghi lên một tài nguyên — chạy song song thì hai response ghi đè nhau.
  it('đang lưu → vô hiệu hoá MỌI nút của gallery và báo trạng thái', async () => {
    let resolveReorder: (v: unknown) => void = () => {};
    mockList.mockResolvedValueOnce([published('m1'), published('m2')]);
    mockReorder.mockReturnValueOnce(new Promise((r) => { resolveReorder = r; }));

    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() => expect(downButtons()).toHaveLength(2));

    fireEvent.click(downButtons()[0]);

    await waitFor(() => expect(downButtons()[0]).toBeDisabled());
    expect(upButtons()[1]).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Đặt làm ảnh bìa' })[0]).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Gỡ ảnh' })[0]).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Đang lưu…');

    resolveReorder([published('m2'), published('m1')]);
    await waitFor(() => expect(screen.getByText('Đã lưu thứ tự ảnh.')).toBeInTheDocument());
  });

  // Sắp xếp phải dùng được bằng bàn phím: <button> thật nên nhận focus và Enter tự phát click.
  it('dùng được bằng BÀN PHÍM: nút nhận focus và kích hoạt được', async () => {
    mockList.mockResolvedValueOnce(three());
    render(<PhotosView placeId={PLACE_ID} />);
    await waitFor(() => expect(downButtons()).toHaveLength(3));

    const btn = downButtons()[0];
    btn.focus();
    expect(btn).toHaveFocus();
    expect(btn.tagName).toBe('BUTTON');
    expect(btn).not.toHaveAttribute('tabindex', '-1');

    fireEvent.click(btn);
    await waitFor(() => expect(mockReorder).toHaveBeenCalledWith(PLACE_ID, ['m2', 'm1', 'm3'], 'tok'));
  });

  it('nhãn nút nêu rõ vị trí ảnh (người dùng trình đọc màn hình phân biệt được)', async () => {
    mockList.mockResolvedValueOnce(three());
    render(<PhotosView placeId={PLACE_ID} />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Di chuyển ảnh 2 lên trước' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Di chuyển ảnh 2 xuống sau' })).toBeInTheDocument();
  });
});
