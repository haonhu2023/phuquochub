/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlaceForm } from './PlaceForm';
import { ApiError } from '@/lib/http';
import { listCategories } from '@/modules/categories/api/categories.api';
import type { Category } from '@/modules/categories/api/categories.api';
import type { ManagedPlace, PlaceFormInput } from './types';

jest.mock('@/modules/categories/api/categories.api', () => ({
  listCategories: jest.fn(),
}));

const mockListCategories = listCategories as jest.Mock;

const CATEGORIES: Category[] = [
  { id: 'c1', slug: 'beach', name_vi: 'Bãi biển', name_en: 'Beach', icon: null, parent_id: null },
  { id: 'c2', slug: 'hotel', name_vi: 'Khách sạn', name_en: 'Hotel', icon: null, parent_id: null },
];

beforeEach(() => {
  mockListCategories.mockReset().mockResolvedValue(CATEGORIES);
});

async function fillRequiredFields() {
  await waitFor(() => expect(screen.getByRole('option', { name: 'Bãi biển' })).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText(/Tên địa điểm/), { target: { value: 'Bãi Sao' } });
  fireEvent.change(screen.getByLabelText(/Danh mục/), { target: { value: 'c1' } });
  fireEvent.change(screen.getByLabelText(/Vĩ độ/), { target: { value: '10.05' } });
  fireEvent.change(screen.getByLabelText(/Kinh độ/), { target: { value: '104' } });
}

describe('PlaceForm — trường bắt buộc (Place Content Management MVP)', () => {
  it('tên/danh mục/vĩ độ/kinh độ có thuộc tính required', async () => {
    render(<PlaceForm submitLabel="Tạo" submittingLabel="Đang tạo…" onSubmit={jest.fn()} cancelHref="/x" />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Bãi biển' })).toBeInTheDocument());
    expect(screen.getByLabelText(/Tên địa điểm/)).toBeRequired();
    expect(screen.getByLabelText(/Danh mục/)).toBeRequired();
    expect(screen.getByLabelText(/Vĩ độ/)).toBeRequired();
    expect(screen.getByLabelText(/Kinh độ/)).toBeRequired();
  });

  it('địa chỉ/mô tả/mức giá KHÔNG bắt buộc', async () => {
    render(<PlaceForm submitLabel="Tạo" submittingLabel="Đang tạo…" onSubmit={jest.fn()} cancelHref="/x" />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Bãi biển' })).toBeInTheDocument());
    expect(screen.getByLabelText(/Địa chỉ/)).not.toBeRequired();
    expect(screen.getByLabelText(/Mô tả ngắn/)).not.toBeRequired();
    expect(screen.getByLabelText(/Mức giá/)).not.toBeRequired();
  });
});

describe('PlaceForm — nạp danh mục', () => {
  it('render đủ option danh mục sau khi tải xong', async () => {
    render(<PlaceForm submitLabel="Tạo" submittingLabel="Đang tạo…" onSubmit={jest.fn()} cancelHref="/x" />);
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Bãi biển' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Khách sạn' })).toBeInTheDocument();
    });
  });

  it('lỗi tải danh mục → hiển thị thông báo, không chặn phần còn lại của form', async () => {
    mockListCategories.mockReset().mockRejectedValue(new Error('network'));
    render(<PlaceForm submitLabel="Tạo" submittingLabel="Đang tạo…" onSubmit={jest.fn()} cancelHref="/x" />);
    await waitFor(() => expect(screen.getByText(/Không tải được danh mục/)).toBeInTheDocument());
    expect(screen.getByLabelText(/Tên địa điểm/)).toBeInTheDocument();
  });
});

describe('PlaceForm — điền sẵn khi sửa', () => {
  const initial: ManagedPlace = {
    id: 'p1',
    name: 'Bãi Sao',
    slug: 'bai-sao',
    category_id: 'c1',
    category_slug: 'beach',
    short_description: 'Bãi biển đẹp',
    price_range: 'high',
    cover_image_url: null,
    rating_avg: null,
    rating_count: 0,
    verification_status: 'pending',
    status: 'pending',
    location: { lat: 10.05, lng: 104.0 },
    address: '123 đường ABC',
    ward: 'An Thới',
    province: null,
    admin_area: null,
    description: 'Mô tả chi tiết',
    osm_id: null,
    opening_hours: {
      is_24h: false,
      note: 'Nghỉ lễ Tết',
      regular: {
        mon: [{ open: '08:00', close: '12:00' }, { open: '13:30', close: '22:00' }],
        tue: [{ open: '08:00', close: '22:00' }],
        wed: [],
        thu: [{ open: '08:00', close: '22:00' }],
        fri: [{ open: '08:00', close: '22:00' }],
        sat: [{ open: '08:00', close: '22:00' }],
        sun: [{ open: '08:00', close: '22:00' }],
      },
    },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    verified_at: null,
  };

  it('điền đúng giá trị hiện có vào từng trường', async () => {
    render(
      <PlaceForm initial={initial} submitLabel="Lưu" submittingLabel="Đang lưu…" onSubmit={jest.fn()} cancelHref="/x" />,
    );
    await waitFor(() => expect(screen.getByRole('option', { name: 'Bãi biển' })).toBeInTheDocument());
    expect(screen.getByLabelText(/Tên địa điểm/)).toHaveValue('Bãi Sao');
    expect(screen.getByLabelText(/Địa chỉ/)).toHaveValue('123 đường ABC');
    expect(screen.getByLabelText(/Vĩ độ/)).toHaveValue(10.05);
    expect(screen.getByLabelText(/Kinh độ/)).toHaveValue(104);
    expect(screen.getByLabelText(/Mô tả ngắn/)).toHaveValue('Bãi biển đẹp');
  });
});

describe('PlaceForm — gửi form', () => {
  it('điền hợp lệ → onSubmit nhận đúng payload (khớp CreatePlaceDto/UpdatePlaceDto)', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<PlaceForm submitLabel="Tạo" submittingLabel="Đang tạo…" onSubmit={onSubmit} cancelHref="/x" />);
    await fillRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: 'Tạo' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as PlaceFormInput;
    // Trường tuỳ chọn để trống gửi `null` (KHÔNG `undefined`) — form này GHI ĐÈ toàn bộ mỗi lần
    // lưu, `undefined` bị JSON.stringify loại bỏ nên PATCH sẽ ÂM THẦM giữ nguyên giá trị cũ thay
    // vì xoá nó (xem types.ts). Test này khoá đúng hành vi đó.
    expect(payload).toEqual({
      name: 'Bãi Sao',
      category_id: 'c1',
      location: { lat: 10.05, lng: 104 },
      address: null,
      ward: null,
      description: null,
      short_description: null,
      price_range: null,
      // Chưa từng điền gì ở "Giờ mở cửa" (place mới) — vẫn LUÔN gửi object hợp lệ (KHÔNG null),
      // 7 ngày rỗng = đóng cửa cả tuần, is_24h=false, KHÔNG có note (rỗng bị bỏ qua).
      opening_hours: { is_24h: false, regular: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] } },
    });
  });

  it('nút submit bị vô hiệu hoá trong lúc đang gửi (chống double-submit)', async () => {
    let resolveSubmit: () => void = () => {};
    const onSubmit = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    render(<PlaceForm submitLabel="Tạo" submittingLabel="Đang tạo…" onSubmit={onSubmit} cancelHref="/x" />);
    await fillRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: 'Tạo' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Đang tạo…' })).toBeDisabled());
    resolveSubmit();
    await waitFor(() => expect(screen.getByText('Đã lưu thành công.')).toBeInTheDocument());
  });

  it('onSubmit ném ApiError 403 → hiển thị thông báo không có quyền', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new ApiError('forbidden', 403));
    render(<PlaceForm submitLabel="Tạo" submittingLabel="Đang tạo…" onSubmit={onSubmit} cancelHref="/x" />);
    await fillRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: 'Tạo' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Bạn không có quyền thực hiện thao tác này'),
    );
  });

  it('onSubmit ném lỗi 4xx khác (vd 400 validation) → hiển thị nguyên văn thông điệp backend', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new ApiError('category_id không tồn tại', 400));
    render(<PlaceForm submitLabel="Tạo" submittingLabel="Đang tạo…" onSubmit={onSubmit} cancelHref="/x" />);
    await fillRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: 'Tạo' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('category_id không tồn tại'));
  });
});

describe('PlaceForm — giờ mở cửa', () => {
  const initialWithHours: ManagedPlace = {
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
    ward: null,
    province: null,
    admin_area: null,
    description: null,
    osm_id: null,
    opening_hours: {
      is_24h: false,
      note: 'Nghỉ lễ Tết',
      regular: {
        mon: [{ open: '08:00', close: '12:00' }, { open: '13:30', close: '22:00' }],
        tue: [{ open: '08:00', close: '22:00' }],
        wed: [],
        thu: [{ open: '08:00', close: '22:00' }],
        fri: [{ open: '08:00', close: '22:00' }],
        sat: [{ open: '08:00', close: '22:00' }],
        sun: [{ open: '08:00', close: '22:00' }],
      },
    },
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    verified_at: null,
  };

  async function renderFresh(onSubmit = jest.fn().mockResolvedValue(undefined)) {
    render(<PlaceForm submitLabel="Tạo" submittingLabel="Đang tạo…" onSubmit={onSubmit} cancelHref="/x" />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Bãi biển' })).toBeInTheDocument());
    return onSubmit;
  }

  it('render đủ 7 ngày trong tuần; place mới mặc định cả tuần "Đóng cửa"', async () => {
    await renderFresh();
    expect(screen.getByText('Giờ mở cửa')).toBeInTheDocument();
    for (const label of ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByText('Đóng cửa')).toHaveLength(7);
  });

  it('điền sẵn đúng khung giờ (kể cả nhiều khung/ngày), ngày đóng cửa, và ghi chú hiện có', async () => {
    render(
      <PlaceForm initial={initialWithHours} submitLabel="Lưu" submittingLabel="Đang lưu…" onSubmit={jest.fn()} cancelHref="/x" />,
    );
    await waitFor(() => expect(screen.getByRole('option', { name: 'Bãi biển' })).toBeInTheDocument());

    // Thứ Hai: 2 khung (nghỉ trưa).
    expect(screen.getByLabelText('Giờ mở cửa Thứ Hai khung 1')).toHaveValue('08:00');
    expect(screen.getByLabelText('Giờ đóng cửa Thứ Hai khung 1')).toHaveValue('12:00');
    expect(screen.getByLabelText('Giờ mở cửa Thứ Hai khung 2')).toHaveValue('13:30');
    expect(screen.getByLabelText('Giờ đóng cửa Thứ Hai khung 2')).toHaveValue('22:00');

    // Thứ Tư: mảng rỗng -> "Đóng cửa", CHỈ đúng một ngày đóng cửa.
    expect(screen.getAllByText('Đóng cửa')).toHaveLength(1);

    expect(screen.getByLabelText(/Ghi chú giờ mở cửa/)).toHaveValue('Nghỉ lễ Tết');
    expect(screen.getByLabelText('Mở cửa 24 giờ mỗi ngày')).not.toBeChecked();
  });

  it('thêm khung giờ cho một ngày đang đóng cửa -> "Đóng cửa" biến mất, input giờ xuất hiện', async () => {
    await renderFresh();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm khung giờ cho Thứ Hai' }));
    expect(screen.getByLabelText('Giờ mở cửa Thứ Hai khung 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Giờ đóng cửa Thứ Hai khung 1')).toBeInTheDocument();
    // 6 ngày còn lại vẫn đóng cửa.
    expect(screen.getAllByText('Đóng cửa')).toHaveLength(6);
  });

  it('xoá khung giờ duy nhất của một ngày -> quay lại "Đóng cửa"', async () => {
    render(
      <PlaceForm initial={initialWithHours} submitLabel="Lưu" submittingLabel="Đang lưu…" onSubmit={jest.fn()} cancelHref="/x" />,
    );
    await waitFor(() => expect(screen.getByRole('option', { name: 'Bãi biển' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Xoá khung giờ 1 của Thứ Ba' }));

    expect(screen.queryByLabelText('Giờ mở cửa Thứ Ba khung 1')).not.toBeInTheDocument();
    // Thứ Tư (đã đóng cửa từ đầu) + Thứ Ba (vừa xoá) = 2 ngày đóng cửa.
    expect(screen.getAllByText('Đóng cửa')).toHaveLength(2);
  });

  it('bật "Mở cửa 24 giờ mỗi ngày" -> payload gửi is_24h=true', async () => {
    const onSubmit = await renderFresh();
    await fillRequiredFields();
    fireEvent.click(screen.getByLabelText('Mở cửa 24 giờ mỗi ngày'));

    fireEvent.click(screen.getByRole('button', { name: 'Tạo' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as PlaceFormInput;
    expect(payload.opening_hours.is_24h).toBe(true);
  });

  it('payload gửi ĐÚNG nhiều khung giờ/ngày + ghi chú khi có', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(
      <PlaceForm initial={initialWithHours} submitLabel="Lưu" submittingLabel="Đang lưu…" onSubmit={onSubmit} cancelHref="/x" />,
    );
    await waitFor(() => expect(screen.getByRole('option', { name: 'Bãi biển' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as PlaceFormInput;
    expect(payload.opening_hours).toEqual({
      is_24h: false,
      note: 'Nghỉ lễ Tết',
      regular: {
        mon: [
          { open: '08:00', close: '12:00' },
          { open: '13:30', close: '22:00' },
        ],
        tue: [{ open: '08:00', close: '22:00' }],
        wed: [],
        thu: [{ open: '08:00', close: '22:00' }],
        fri: [{ open: '08:00', close: '22:00' }],
        sat: [{ open: '08:00', close: '22:00' }],
        sun: [{ open: '08:00', close: '22:00' }],
      },
    });
  });

  it('xoá ghi chú (để trống) -> payload KHÔNG có field note', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(
      <PlaceForm initial={initialWithHours} submitLabel="Lưu" submittingLabel="Đang lưu…" onSubmit={onSubmit} cancelHref="/x" />,
    );
    await waitFor(() => expect(screen.getByRole('option', { name: 'Bãi biển' })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/Ghi chú giờ mở cửa/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as PlaceFormInput;
    expect(payload.opening_hours).not.toHaveProperty('note');
  });

  it('sửa trường KHÔNG liên quan (tên) KHÔNG làm mất giờ mở cửa đã có', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(
      <PlaceForm initial={initialWithHours} submitLabel="Lưu" submittingLabel="Đang lưu…" onSubmit={onSubmit} cancelHref="/x" />,
    );
    await waitFor(() => expect(screen.getByRole('option', { name: 'Bãi biển' })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/Tên địa điểm/), { target: { value: 'Tên mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as PlaceFormInput;
    expect(payload.name).toBe('Tên mới');
    expect(payload.opening_hours.regular?.mon).toEqual([
      { open: '08:00', close: '12:00' },
      { open: '13:30', close: '22:00' },
    ]);
    expect(payload.opening_hours.note).toBe('Nghỉ lễ Tết');
  });

  it('khung giờ thiếu giờ đóng -> CHẶN submit, hiển thị lỗi, KHÔNG gọi onSubmit', async () => {
    const onSubmit = await renderFresh();
    await fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm khung giờ cho Thứ Hai' }));
    fireEvent.change(screen.getByLabelText('Giờ mở cửa Thứ Hai khung 1'), { target: { value: '08:00' } });
    // Giờ đóng cửa CỐ TÌNH để trống.

    fireEvent.click(screen.getByRole('button', { name: 'Tạo' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Thứ Hai/));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('khung giờ qua đêm (22:00→02:00) được chấp nhận, KHÔNG bị chặn (backend cố tình không kiểm open<close)', async () => {
    const onSubmit = await renderFresh();
    await fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm khung giờ cho Thứ Bảy' }));
    fireEvent.change(screen.getByLabelText('Giờ mở cửa Thứ Bảy khung 1'), { target: { value: '22:00' } });
    fireEvent.change(screen.getByLabelText('Giờ đóng cửa Thứ Bảy khung 1'), { target: { value: '02:00' } });

    fireEvent.click(screen.getByRole('button', { name: 'Tạo' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as PlaceFormInput;
    expect(payload.opening_hours.regular?.sat).toEqual([{ open: '22:00', close: '02:00' }]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
