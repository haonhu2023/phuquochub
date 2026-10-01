/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MenuEditor } from './MenuEditor';
import { readSession } from '@/modules/auth/session';
import { getMenu, updateMenu } from '@/modules/restaurants/api/restaurants.api';
import { ApiError } from '@/lib/http';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('@/modules/restaurants/api/restaurants.api', () => ({
  getMenu: jest.fn(),
  updateMenu: jest.fn(),
}));

const mockReadSession = readSession as jest.Mock;
const mockGetMenu = getMenu as jest.Mock;
const mockUpdateMenu = updateMenu as jest.Mock;

const mockOnVersionChange = jest.fn();

function renderEditor(placeId = 'place-1', contentVersion = 1) {
  return render(<MenuEditor placeId={placeId} contentVersion={contentVersion} onVersionChange={mockOnVersionChange} />);
}

beforeEach(() => {
  mockReadSession.mockReturnValue({ accessToken: 'tok' });
});

afterEach(() => jest.clearAllMocks());

describe('MenuEditor — tải thực đơn hiện có', () => {
  it('hiện đúng mục/món đã có, giá gắn nhãn "(nội bộ)"', async () => {
    mockGetMenu.mockResolvedValue([
      { id: 's1', name: 'Hải sản', sort_order: 0, items: [{ id: 'i1', name: 'Ghẹ rang muối', price: 250000, currency: 'VND', tags: null, is_signature: true, sort_order: 0 }] },
    ]);
    renderEditor();
    expect(await screen.findByText(/Ghẹ rang muối ★ — 250.000 VND \(nội bộ\)/)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Hải sản' })).toBeInTheDocument();
  });
});

describe('MenuEditor — thêm món (replace-all, gửi lại TOÀN BỘ sections)', () => {
  it('thêm món vào mục có sẵn -> updateMenu nhận đúng mảng sections đã gộp món mới', async () => {
    mockGetMenu.mockResolvedValue([
      { id: 's1', name: 'Hải sản', sort_order: 0, items: [{ id: 'i1', name: 'Ghẹ rang muối', price: 250000, currency: 'VND', tags: null, is_signature: false, sort_order: 0 }] },
    ]);
    mockUpdateMenu.mockResolvedValue({
      sections: [
        { id: 's1', name: 'Hải sản', sort_order: 0, items: [
          { id: 'i1', name: 'Ghẹ rang muối', price: 250000, currency: 'VND', tags: null, is_signature: false, sort_order: 0 },
          { id: 'i2', name: 'Tôm hùm nướng', price: 450000, currency: 'VND', tags: null, is_signature: false, sort_order: 1 },
        ] },
      ],
      content_version: 2,
    });

    renderEditor();
    await screen.findByRole('option', { name: 'Hải sản' });

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Hải sản' } });
    fireEvent.change(screen.getByPlaceholderText(/Ghẹ rang muối/), { target: { value: 'Tôm hùm nướng' } });
    fireEvent.change(screen.getByLabelText(/Giá \(VND/), { target: { value: '450000' } });
    fireEvent.click(screen.getByRole('button', { name: /Thêm món/ }));

    await waitFor(() =>
      expect(mockUpdateMenu).toHaveBeenCalledWith(
        'place-1',
        [
          {
            name: 'Hải sản',
            sort_order: 0,
            items: [
              { name: 'Ghẹ rang muối', price: 250000, currency: 'VND', tags: undefined, is_signature: false, sort_order: 0 },
              { name: 'Tôm hùm nướng', price: 450000, is_signature: false },
            ],
          },
        ],
        1,
        'tok',
      ),
    );
    expect(await screen.findByText(/Tôm hùm nướng/)).toBeInTheDocument();
    // CAS thật (2026-10-01) — content_version mới phải truyền ngược lên cha qua onVersionChange,
    // CÙNG khuôn AmenitiesEditor/HotelDetailsEditor, để editor anh em kế tiếp không dùng version cũ.
    expect(mockOnVersionChange).toHaveBeenCalledWith(2);

    // UpdateRestaurantMenuDto's MenuItemDto không có `id`, và ValidationPipe toàn cục dùng
    // forbidNonWhitelisted:true — gửi `id` sẽ bị API trả 400. Khoá lại không tái phát bug này.
    const sentSections = mockUpdateMenu.mock.calls[0][1] as Array<{ items: Array<Record<string, unknown>> }>;
    for (const section of sentSections) {
      for (const item of section.items) {
        expect(item).not.toHaveProperty('id');
      }
    }
  });

  it('mục mới chưa nhập tên -> báo lỗi, KHÔNG gọi updateMenu', async () => {
    mockGetMenu.mockResolvedValue([]);
    renderEditor();
    await waitFor(() => expect(mockGetMenu).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText(/Ghẹ rang muối/), { target: { value: 'Súp hải sản' } });
    fireEvent.click(screen.getByRole('button', { name: /Thêm món/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/tên mục/);
    expect(mockUpdateMenu).not.toHaveBeenCalled();
  });

  // CAS thật (2026-10-01) — BUG THẬT đã sửa: replace-all trước đây không có token xung đột, người
  // lưu sau âm thầm xoá sạch món của người lưu trước. Test này khoá lại component đọc đúng lỗi 409
  // từ backend, KHÔNG tự coi là thành công, KHÔNG gọi onVersionChange với version cũ.
  it('content_version lệch (ai đó vừa sửa) -> API trả 409 -> hiện đúng lỗi, KHÔNG đổi version', async () => {
    mockGetMenu.mockResolvedValue([]);
    mockUpdateMenu.mockRejectedValue(
      new ApiError('Địa điểm vừa được người khác sửa (mong đợi content_version=1) — tải lại và thử lại.', 409),
    );
    renderEditor();
    await waitFor(() => expect(mockGetMenu).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText(/Hải sản, Khai vị/), { target: { value: 'Khai vị' } });
    fireEvent.change(screen.getByPlaceholderText(/Ghẹ rang muối/), { target: { value: 'Súp hải sản' } });
    fireEvent.click(screen.getByRole('button', { name: /Thêm món/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/vừa được người khác sửa/);
    expect(mockOnVersionChange).not.toHaveBeenCalled();
  });
});
