/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MenuEditor } from './MenuEditor';
import { readSession } from '@/modules/auth/session';
import { getMenuManaged, updateMenu } from '@/modules/restaurants/api/restaurants.api';
import { createSource } from '@/modules/sources/api/sources.api';
import { ApiError } from '@/lib/http';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('@/modules/restaurants/api/restaurants.api', () => ({
  getMenuManaged: jest.fn(),
  updateMenu: jest.fn(),
}));
jest.mock('@/modules/sources/api/sources.api', () => ({ createSource: jest.fn() }));

const mockReadSession = readSession as jest.Mock;
const mockGet = getMenuManaged as jest.Mock;
const mockUpdate = updateMenu as jest.Mock;
const mockCreateSource = createSource as jest.Mock;
const mockOnVersionChange = jest.fn();

const MENU = [
  {
    id: 's1',
    name: 'Món chính',
    sort_order: 0,
    items: [
      {
        id: 'i1',
        name: 'Cá nướng synthetic',
        price: 150000,
        currency: 'VND',
        price_unit: 'phần',
        price_recorded_on: '2026-10-01',
        price_source: { id: 'src-old', title: 'Menu quán synthetic', url: null },
        tags: null,
        is_signature: true,
        sort_order: 0,
      },
      {
        id: 'i2',
        name: 'Canh chua synthetic',
        price: null,
        currency: 'VND',
        price_unit: null,
        price_recorded_on: null,
        price_source: null,
        tags: null,
        is_signature: false,
        sort_order: 1,
      },
    ],
  },
];

function renderEditor(contentVersion = 6) {
  return render(<MenuEditor placeId="rest-1" contentVersion={contentVersion} onVersionChange={mockOnVersionChange} />);
}

beforeEach(() => {
  mockReadSession.mockReturnValue({ accessToken: 'tok' });
});

afterEach(() => jest.clearAllMocks());

describe('MenuEditor — tải và hiển thị', () => {
  it('tải bằng route quản trị (giá thật) và hiện đơn vị/ngày/nguồn; món thiếu giá hiện "chưa có giá"', async () => {
    mockGet.mockResolvedValue(MENU);
    renderEditor();
    expect(await screen.findByText(/Cá nướng synthetic/)).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('rest-1', 'tok');
    expect(screen.getByText(/150\.000 VND \/ phần/)).toBeInTheDocument();
    expect(screen.getByText(/ghi nhận 2026-10-01/)).toBeInTheDocument();
    expect(screen.getAllByText(/chưa có giá/).length).toBeGreaterThan(0);
  });

  it('lỗi tải → không có nút lưu', async () => {
    mockGet.mockRejectedValue(new ApiError('down', 500));
    renderEditor();
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể lưu cho đến khi tải lại được');
    expect(screen.queryByRole('button', { name: 'Lưu thực đơn' })).toBeNull();
  });
});

describe('MenuEditor — lưu có CAS và giữ metadata', () => {
  it('lưu giữ đơn vị/ngày/nguồn của món cũ; món thiếu giá gửi null cho metadata và không gửi price', async () => {
    mockGet.mockResolvedValue(MENU);
    mockUpdate.mockResolvedValue({ sections: fromMenu(MENU), content_version: 7 });
    renderEditor(6);
    await screen.findByText(/Cá nướng synthetic/);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thực đơn' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1));
    const [placeId, sections, version] = mockUpdate.mock.calls[0];
    expect(placeId).toBe('rest-1');
    expect(version).toBe(6);
    const [cá, canh] = sections[0].items;
    expect(cá).toMatchObject({ name: 'Cá nướng synthetic', price: 150000, price_unit: 'phần', price_recorded_on: '2026-10-01', price_source_id: 'src-old' });
    expect(canh).toMatchObject({ name: 'Canh chua synthetic', price_unit: null, price_recorded_on: null, price_source_id: null });
    expect('price' in canh).toBe(false);
    await waitFor(() => expect(mockOnVersionChange).toHaveBeenCalledWith(7));
  });

  it('metadata nhập khi món chưa có giá → báo lỗi, KHÔNG gọi API', async () => {
    mockGet.mockResolvedValue([]);
    renderEditor();
    await screen.findByText(/Thực đơn/);
    fireEvent.change(screen.getByLabelText('Tên mục mới'), { target: { value: 'Khai vị' } });
    fireEvent.change(screen.getByLabelText('Tên món'), { target: { value: 'Gỏi synthetic' } });
    fireEvent.change(screen.getByLabelText('Đơn vị (suất/phần/kg…)'), { target: { value: 'đĩa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào bản nháp' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('chưa có giá nên không được nhập');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('nguồn mới được tạo đúng một lần; lưu lại sau lỗi 500 tái dùng nguồn (không tạo trùng)', async () => {
    mockGet.mockResolvedValue([]);
    mockCreateSource.mockResolvedValue({ id: 'src-new' });
    mockUpdate.mockRejectedValueOnce(new ApiError('server', 500)).mockResolvedValueOnce({ sections: [], content_version: 7 });
    renderEditor();
    await screen.findByText(/Thực đơn/);
    fireEvent.change(screen.getByLabelText('Tên mục mới'), { target: { value: 'Hải sản' } });
    fireEvent.change(screen.getByLabelText('Tên món'), { target: { value: 'Ghẹ synthetic' } });
    fireEvent.change(screen.getByLabelText('Giá (VND) — để trống nếu chưa có'), { target: { value: '200000' } });
    fireEvent.change(screen.getByLabelText('Nguồn giá — tiêu đề'), { target: { value: 'Bảng giá synthetic' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào bản nháp' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thực đơn' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bản nháp vẫn được giữ');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thực đơn' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2));
    expect(mockCreateSource).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[1][1][0].items[0].price_source_id).toBe('src-new');
  });

  it('409 → giữ nguyên bản nháp, không đổi version', async () => {
    mockGet.mockResolvedValue(MENU);
    mockUpdate.mockRejectedValue(new ApiError('Địa điểm vừa được người khác sửa.', 409));
    renderEditor();
    await screen.findByText(/Cá nướng synthetic/);
    fireEvent.change(screen.getByLabelText('Tên mục mới'), { target: { value: 'Món phụ' } });
    fireEvent.change(screen.getByLabelText('Tên món'), { target: { value: 'Nháp giữ lại' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào bản nháp' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thực đơn' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('người khác sửa');
    expect(screen.getByText(/Nháp giữ lại/)).toBeInTheDocument();
    expect(mockOnVersionChange).not.toHaveBeenCalled();
  });
});

// Chuyển menu tải về sang dạng API trả về sau khi lưu (chỉ để mô phỏng phản hồi của updateMenu).
function fromMenu(list: typeof MENU) {
  return list;
}

void within; // (giữ import cho các lần mở rộng test theo phạm vi dòng)
