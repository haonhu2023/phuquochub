/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ContactsView } from './ContactsView';
import { readSession } from '@/modules/auth/session';
import { listMyPlaces } from '@/modules/place-management/api/place-management.api';
import {
  createPlaceContact,
  deletePlaceContact,
  listPlaceContacts,
  updatePlaceContact,
} from './api/place-contacts.api';
import { ApiError } from '@/lib/http';
import type { ManagedPlace } from '@/modules/place-management/types';
import type { PlaceContact } from './types';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('@/modules/place-management/api/place-management.api', () => ({ listMyPlaces: jest.fn() }));
jest.mock('./api/place-contacts.api', () => ({
  listPlaceContacts: jest.fn(),
  createPlaceContact: jest.fn(),
  updatePlaceContact: jest.fn(),
  deletePlaceContact: jest.fn(),
}));

const mockReadSession = readSession as jest.Mock;
const mockListMyPlaces = listMyPlaces as jest.Mock;
const mockListContacts = listPlaceContacts as jest.Mock;
const mockCreate = createPlaceContact as jest.Mock;
const mockUpdate = updatePlaceContact as jest.Mock;
const mockDelete = deletePlaceContact as jest.Mock;

const SESSION = { accessToken: 'tok', refreshToken: 'r', expiresAt: 0, user: { id: 'u1', email: 'a@b.c', displayName: 'A', avatarUrl: null } };

function place(overrides: Partial<ManagedPlace> = {}): ManagedPlace {
  return {
    id: 'place-1',
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
    ward: null,
    description: null,
    osm_id: null,
    opening_hours: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function contact(overrides: Partial<PlaceContact> = {}): PlaceContact {
  return {
    id: 'c1',
    contact_type: 'PHONE',
    value: '0909123456',
    label: null,
    is_primary: false,
    verification_status: 'pending',
    display_order: 0,
    ...overrides,
  };
}

beforeEach(() => {
  mockReadSession.mockReset().mockReturnValue(SESSION);
  mockListMyPlaces.mockReset().mockResolvedValue([place()]);
  mockListContacts.mockReset().mockResolvedValue([]);
  mockCreate.mockReset().mockResolvedValue(undefined);
  mockUpdate.mockReset().mockResolvedValue(undefined);
  mockDelete.mockReset().mockResolvedValue(null);
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => jest.restoreAllMocks());

describe('ContactsView — chưa đăng nhập', () => {
  it('không có session → hiển thị yêu cầu đăng nhập, không gọi API', async () => {
    mockReadSession.mockReturnValue(null);
    render(<ContactsView placeId="place-1" />);
    await waitFor(() => expect(screen.getByText('Cần đăng nhập')).toBeInTheDocument());
    expect(mockListMyPlaces).not.toHaveBeenCalled();
    expect(mockListContacts).not.toHaveBeenCalled();
  });
});

describe('ContactsView — không quản lý được cơ sở này', () => {
  it('placeId không nằm trong GET /places/mine → "Không tìm thấy địa điểm"', async () => {
    mockListMyPlaces.mockResolvedValue([place({ id: 'other-place' })]);
    render(<ContactsView placeId="place-1" />);
    await waitFor(() => expect(screen.getByText('Không tìm thấy địa điểm')).toBeInTheDocument());
    expect(screen.getByText(/không tồn tại, hoặc bạn không có quyền/)).toBeInTheDocument();
  });
});

describe('ContactsView — lỗi tải', () => {
  it('API lỗi → thông báo lỗi + nút Thử lại', async () => {
    mockListContacts.mockRejectedValueOnce(new ApiError('sự cố', 500));
    render(<ContactsView placeId="place-1" />);
    await waitFor(() => expect(screen.getByText('Không tải được liên hệ')).toBeInTheDocument());

    mockListContacts.mockResolvedValueOnce([contact()]);
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(screen.getByText('0909123456')).toBeInTheDocument());
  });
});

describe('ContactsView — rỗng', () => {
  it('chưa có liên hệ nào → trạng thái rỗng, form thêm vẫn hiển thị', async () => {
    render(<ContactsView placeId="place-1" />);
    await waitFor(() => expect(screen.getByText('Chưa có liên hệ nào')).toBeInTheDocument());
    expect(screen.getByLabelText(/Nội dung/)).toBeInTheDocument();
  });
});

describe('ContactsView — danh sách', () => {
  it('render loại, giá trị, nhãn, huy hiệu "Liên hệ chính"', async () => {
    mockListContacts.mockResolvedValue([
      contact({ id: 'c1', contact_type: 'EMAIL', value: 'lienhe@quan.test', label: 'Đặt bàn', is_primary: true }),
    ]);
    render(<ContactsView placeId="place-1" />);

    await waitFor(() => expect(screen.getByText('Đặt bàn')).toBeInTheDocument());
    // Scoped trong đúng hàng — "Email" cũng là một <option> trong <select> của form thêm mới ở
    // trên, getByText không scoped sẽ khớp nhầm cả hai.
    const row = screen.getByText('Đặt bàn').parentElement as HTMLElement;
    expect(within(row).getByText('Email')).toBeInTheDocument();
    expect(within(row).getByText('lienhe@quan.test')).toBeInTheDocument();
    expect(within(row).getByText('Liên hệ chính')).toBeInTheDocument();
  });

  it('liên hệ không phải chính → KHÔNG có huy hiệu', async () => {
    mockListContacts.mockResolvedValue([contact({ is_primary: false })]);
    render(<ContactsView placeId="place-1" />);
    await waitFor(() => expect(screen.getByText('0909123456')).toBeInTheDocument());
    expect(screen.queryByText('Liên hệ chính')).not.toBeInTheDocument();
  });
});

describe('ContactsView — loại liên hệ đổi kiểu input', () => {
  it('EMAIL -> input type=email; WEBSITE -> type=url; PHONE -> type=tel', async () => {
    render(<ContactsView placeId="place-1" />);
    await waitFor(() => expect(screen.getByText('Chưa có liên hệ nào')).toBeInTheDocument());

    const valueInput = screen.getByLabelText(/Nội dung/) as HTMLInputElement;
    expect(valueInput.type).toBe('tel'); // mặc định CONTACT_TYPES[0] = HOTLINE -> tel

    fireEvent.change(screen.getByLabelText('Loại liên hệ'), { target: { value: 'EMAIL' } });
    expect((screen.getByLabelText(/Nội dung/) as HTMLInputElement).type).toBe('email');

    fireEvent.change(screen.getByLabelText('Loại liên hệ'), { target: { value: 'WEBSITE' } });
    expect((screen.getByLabelText(/Nội dung/) as HTMLInputElement).type).toBe('url');
  });
});

describe('ContactsView — thêm liên hệ', () => {
  it('điền hợp lệ -> gọi createPlaceContact ĐÚNG payload, hiển thị thông báo thành công, tải lại danh sách', async () => {
    mockListContacts.mockResolvedValueOnce([]).mockResolvedValueOnce([contact()]);
    render(<ContactsView placeId="place-1" />);
    await waitFor(() => expect(screen.getByText('Chưa có liên hệ nào')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Loại liên hệ'), { target: { value: 'PHONE' } });
    fireEvent.change(screen.getByLabelText(/Nội dung/), { target: { value: '0909123456' } });
    fireEvent.change(screen.getByLabelText(/Nhãn/), { target: { value: 'Lễ tân' } });
    fireEvent.click(screen.getByLabelText('Đặt làm liên hệ chính cho loại này'));

    fireEvent.click(screen.getByRole('button', { name: 'Thêm liên hệ' }));

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(
        'place-1',
        { contact_type: 'PHONE', value: '0909123456', label: 'Lễ tân', is_primary: true },
        'tok',
      ),
    );
    await waitFor(() => expect(screen.getByText('Đã thêm liên hệ.')).toBeInTheDocument());
    await waitFor(() => expect(mockListContacts).toHaveBeenCalledTimes(2));
  });

  it('nội dung toàn khoảng trắng -> CHẶN submit, KHÔNG gọi createPlaceContact', async () => {
    // HTML `required` chỉ chặn chuỗi rỗng thật (jsdom tự chặn submit trước khi handler chạy nếu để
    // trống hẳn), KHÔNG chặn chuỗi toàn khoảng trắng — cùng lý do ClaimForm.tsx tự kiểm thêm ở JS
    // thay vì chỉ dựa vào `required`.
    render(<ContactsView placeId="place-1" />);
    await waitFor(() => expect(screen.getByText('Chưa có liên hệ nào')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/Nội dung/), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm liên hệ' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Vui lòng nhập nội dung liên hệ.'));
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('nút thêm bị vô hiệu hoá trong lúc đang gửi', async () => {
    let resolveCreate: () => void = () => {};
    mockCreate.mockImplementation(() => new Promise<void>((resolve) => { resolveCreate = resolve; }));
    render(<ContactsView placeId="place-1" />);
    await waitFor(() => expect(screen.getByText('Chưa có liên hệ nào')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/Nội dung/), { target: { value: '0909123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm liên hệ' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Đang thêm…' })).toBeDisabled());
    resolveCreate();
    await waitFor(() => expect(screen.getByText('Đã thêm liên hệ.')).toBeInTheDocument());
  });

  it('backend từ chối 403 -> thông báo rõ ràng, KHÔNG âm thầm coi là thành công', async () => {
    mockCreate.mockRejectedValue(new ApiError('forbidden', 403));
    render(<ContactsView placeId="place-1" />);
    await waitFor(() => expect(screen.getByText('Chưa có liên hệ nào')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/Nội dung/), { target: { value: '0909123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm liên hệ' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Bạn không có quyền chỉnh sửa liên hệ của địa điểm này.'),
    );
    expect(screen.queryByText('Đã thêm liên hệ.')).not.toBeInTheDocument();
  });
});

describe('ContactsView — sửa liên hệ', () => {
  it('bấm "Sửa" -> hiện form điền sẵn; lưu -> gọi updatePlaceContact ĐÚNG payload', async () => {
    mockListContacts.mockResolvedValue([
      contact({ id: 'c1', contact_type: 'PHONE', value: '0909123456', label: 'Lễ tân', is_primary: false }),
    ]);
    render(<ContactsView placeId="place-1" />);
    await waitFor(() => expect(screen.getAllByText('0909123456')[0]).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));

    const editValueInputs = screen.getAllByLabelText(/Nội dung/);
    const editValue = editValueInputs[editValueInputs.length - 1];
    expect(editValue).toHaveValue('0909123456');

    fireEvent.change(editValue, { target: { value: '0912345678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        'c1',
        { contact_type: 'PHONE', value: '0912345678', label: 'Lễ tân', is_primary: false },
        'tok',
      ),
    );
  });

  it('bấm "Huỷ" trong lúc sửa -> quay lại hiển thị bình thường, KHÔNG gọi updatePlaceContact', async () => {
    mockListContacts.mockResolvedValue([contact()]);
    render(<ContactsView placeId="place-1" />);
    await waitFor(() => expect(screen.getAllByText('0909123456')[0]).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));

    expect(screen.queryByRole('button', { name: 'Lưu' })).not.toBeInTheDocument();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('ContactsView — xoá liên hệ', () => {
  it('xác nhận -> gọi deletePlaceContact rồi tải lại danh sách', async () => {
    mockListContacts.mockResolvedValueOnce([contact()]).mockResolvedValueOnce([]);
    render(<ContactsView placeId="place-1" />);
    await waitFor(() => expect(screen.getAllByText('0909123456')[0]).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Xoá' }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('c1', 'tok'));
    await waitFor(() => expect(screen.getByText('Chưa có liên hệ nào')).toBeInTheDocument());
  });

  it('huỷ xác nhận -> KHÔNG gọi deletePlaceContact', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    mockListContacts.mockResolvedValue([contact()]);
    render(<ContactsView placeId="place-1" />);
    await waitFor(() => expect(screen.getAllByText('0909123456')[0]).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Xoá' }));

    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('backend từ chối -> thông báo lỗi, KHÔNG âm thầm coi là đã xoá', async () => {
    mockListContacts.mockResolvedValue([contact()]);
    mockDelete.mockRejectedValue(new ApiError('not found', 404));
    render(<ContactsView placeId="place-1" />);
    await waitFor(() => expect(screen.getAllByText('0909123456')[0]).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Xoá' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Không tìm thấy liên hệ này (có thể đã bị xoá trước đó).'),
    );
    // Vẫn còn trong danh sách — KHÔNG âm thầm coi như đã xoá.
    expect(screen.getAllByText('0909123456')[0]).toBeInTheDocument();
  });
});
