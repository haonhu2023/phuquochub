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
    content_version: 1,
    status: 'pending',
    location: { lat: 10.05, lng: 104.0 },
    address: '123 đường ABC',
    ward: 'An Thới',
    province: null,
    admin_area: null,
    description: 'Mô tả chi tiết',
    osm_id: null,
    google_place_id: null,
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
    en_display_name_approved: false,
    en_short_description_approved: false,
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
    expect(screen.getByLabelText(/Tên địa điểm/)).toHaveAttribute('readonly');
    expect(screen.getByLabelText(/Mô tả ngắn/)).toHaveAttribute('readonly');
    expect(screen.getByText(/Sửa tên và mô tả VI\/EN/)).toBeInTheDocument();
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
      // SỬA 16/10/2026 (phát hiện thật khi nghiệm thu Ra Khơi): `opening_hours` KHÔNG còn nằm
      // trong `toEqual` ở trên — chưa từng đụng tới mục "Giờ mở cửa" (kể cả khi tạo mới) nghĩa là
      // field này bị OMIT hoàn toàn khỏi payload (xem openingHoursTouched/types.ts), không còn
      // luôn gửi object `{is_24h:false, 7 ngày rỗng}` như trước — tạo mới một place giờ bắt đầu
      // với opening_hours THẬT SỰ null (chưa khảo sát), không phải "đã khảo sát, đóng cửa cả
      // tuần" giả.
    });
    expect(payload).not.toHaveProperty('opening_hours');
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
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tạo' })).toBeEnabled());
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
    content_version: 1,
    status: 'pending',
    location: { lat: 10.05, lng: 104.0 },
    address: null,
    ward: null,
    province: null,
    admin_area: null,
    description: null,
    osm_id: null,
    google_place_id: null,
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
    en_display_name_approved: false,
    en_short_description_approved: false,
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
    expect(screen.getByLabelText('Giờ mở (HH:mm, 24 giờ) Thứ Hai khung 1')).toHaveValue('08:00');
    expect(screen.getByLabelText('Giờ đóng (HH:mm, 24 giờ) Thứ Hai khung 1')).toHaveValue('12:00');
    expect(screen.getByLabelText('Giờ mở (HH:mm, 24 giờ) Thứ Hai khung 2')).toHaveValue('13:30');
    expect(screen.getByLabelText('Giờ đóng (HH:mm, 24 giờ) Thứ Hai khung 2')).toHaveValue('22:00');

    // Thứ Tư: mảng rỗng -> "Đóng cửa", CHỈ đúng một ngày đóng cửa.
    expect(screen.getAllByText('Đóng cửa')).toHaveLength(1);

    expect(screen.getByLabelText(/Ghi chú giờ mở cửa/)).toHaveValue('Nghỉ lễ Tết');
    expect(screen.getByLabelText('Mở cửa 24 giờ mỗi ngày')).not.toBeChecked();
  });

  it('thêm khung giờ cho một ngày đang đóng cửa -> "Đóng cửa" biến mất, input giờ xuất hiện', async () => {
    await renderFresh();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm khung giờ cho Thứ Hai' }));
    expect(screen.getByLabelText('Giờ mở (HH:mm, 24 giờ) Thứ Hai khung 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Giờ đóng (HH:mm, 24 giờ) Thứ Hai khung 1')).toBeInTheDocument();
    // 6 ngày còn lại vẫn đóng cửa.
    expect(screen.getAllByText('Đóng cửa')).toHaveLength(6);
  });

  it('xoá khung giờ duy nhất của một ngày -> quay lại "Đóng cửa"', async () => {
    render(
      <PlaceForm initial={initialWithHours} submitLabel="Lưu" submittingLabel="Đang lưu…" onSubmit={jest.fn()} cancelHref="/x" />,
    );
    await waitFor(() => expect(screen.getByRole('option', { name: 'Bãi biển' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Xoá khung giờ 1 của Thứ Ba' }));

    expect(screen.queryByLabelText('Giờ mở (HH:mm, 24 giờ) Thứ Ba khung 1')).not.toBeInTheDocument();
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
    expect(payload.opening_hours).toBeDefined();
    expect(payload.opening_hours?.is_24h).toBe(true);
  });

  it('payload gửi ĐÚNG nhiều khung giờ/ngày + ghi chú khi có, khi NGƯỜI DÙNG có đụng tới mục giờ', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(
      <PlaceForm initial={initialWithHours} submitLabel="Lưu" submittingLabel="Đang lưu…" onSubmit={onSubmit} cancelHref="/x" />,
    );
    await waitFor(() => expect(screen.getByRole('option', { name: 'Bãi biển' })).toBeInTheDocument());

    // SỬA 16/10/2026: chỉ submit không đụng gì tới mục giờ giờ OMIT field này khỏi payload (xem
    // test "KHÔNG đụng tới mục giờ... payload OMIT opening_hours" bên dưới) — để test ĐÚNG mục
    // tiêu "payload gửi đúng dữ liệu phức tạp khi CÓ đụng tới", đánh dấu đã đụng bằng một tương
    // tác thật (thêm rồi xoá ngay một khung giờ cho Thứ Tư — ngày duy nhất đang "Đóng cửa" trong
    // fixture — không đổi NỘI DUNG lịch cuối cùng, chỉ đánh dấu openingHoursTouched=true).
    fireEvent.click(screen.getByRole('button', { name: 'Thêm khung giờ cho Thứ Tư' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xoá khung giờ 1 của Thứ Tư' }));
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

  // SỬA 16/10/2026 (phát hiện thật — nghiệm thu nhập liệu Ra Khơi, place THẬT có opening_hours
  // NULL bị đổi thành `{is_24h:false, 7 ngày rỗng}` chỉ vì lưu địa chỉ): "không làm mất giờ" giờ
  // đạt được bằng CÁCH KHÁC — OMIT hẳn field khỏi payload khi không đụng tới (PlaceForm không còn
  // tự resend "ảnh chụp" field đó), để backend (`buildDraftScalarPatch`: `dto.opening_hours !==
  // undefined`) tự giữ nguyên giá trị đang có. Test ở mức PlaceForm chỉ khoá đúng phần CỦA NÓ —
  // omit đúng field; phần "backend thực sự giữ nguyên" được khoá riêng ở mức HTTP/DB (xem
  // isolated-stack test 16/10/2026 trong tài liệu phát hành release-web-candidate-2026-10-04.md).
  it('sửa trường KHÔNG liên quan (tên), KHÔNG đụng mục giờ -> payload OMIT opening_hours (để backend tự giữ nguyên)', async () => {
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
    expect(payload).not.toHaveProperty('opening_hours');
  });

  it('khung giờ thiếu giờ đóng -> CHẶN submit, hiển thị lỗi, KHÔNG gọi onSubmit', async () => {
    const onSubmit = await renderFresh();
    await fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm khung giờ cho Thứ Hai' }));
    fireEvent.change(screen.getByLabelText('Giờ mở (HH:mm, 24 giờ) Thứ Hai khung 1'), { target: { value: '08:00' } });
    // Giờ đóng cửa CỐ TÌNH để trống.

    fireEvent.click(screen.getByRole('button', { name: 'Tạo' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Thứ Hai/));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('khung giờ qua đêm (22:00→02:00) được chấp nhận, KHÔNG bị chặn (backend cố tình không kiểm open<close)', async () => {
    const onSubmit = await renderFresh();
    await fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm khung giờ cho Thứ Bảy' }));
    fireEvent.change(screen.getByLabelText('Giờ mở (HH:mm, 24 giờ) Thứ Bảy khung 1'), { target: { value: '22:00' } });
    fireEvent.change(screen.getByLabelText('Giờ đóng (HH:mm, 24 giờ) Thứ Bảy khung 1'), { target: { value: '02:00' } });

    fireEvent.click(screen.getByRole('button', { name: 'Tạo' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as PlaceFormInput;
    expect(payload.opening_hours?.regular?.sat).toEqual([{ open: '22:00', close: '02:00' }]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // SỬA UX nhập giờ 16/10/2026 (owner báo lỗi thật: `<input type="time">` hiện đồng hồ 12 giờ
  // AM/PM, không gõ trực tiếp được 18:00 rõ ràng) — thay bằng ô text TimeOfDayField, các test dưới
  // khoá đúng hành vi mới: gõ trực tiếp HH:mm, chuẩn hoá lúc blur, chặn submit khi sai định dạng.
  it('gõ trực tiếp "6:00" (thiếu số 0) -> blur chuẩn hoá thành "06:00"', async () => {
    await renderFresh();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm khung giờ cho Thứ Hai' }));
    const openInput = screen.getByLabelText('Giờ mở (HH:mm, 24 giờ) Thứ Hai khung 1');
    fireEvent.change(openInput, { target: { value: '6:00' } });
    expect(openInput).toHaveValue('6:00'); // KHÔNG tự sửa trong lúc gõ
    fireEvent.blur(openInput);
    expect(openInput).toHaveValue('06:00');
  });

  it('gõ "1800" (không dấu hai chấm) -> blur chuẩn hoá thành "18:00"', async () => {
    await renderFresh();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm khung giờ cho Thứ Hai' }));
    const closeInput = screen.getByLabelText('Giờ đóng (HH:mm, 24 giờ) Thứ Hai khung 1');
    fireEvent.change(closeInput, { target: { value: '1800' } });
    fireEvent.blur(closeInput);
    expect(closeInput).toHaveValue('18:00');
  });

  it('gõ "25:00" (giờ sai) -> blur giữ nguyên nội dung, hiện lỗi tại ô, KHÔNG được gửi', async () => {
    const onSubmit = await renderFresh();
    await fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm khung giờ cho Thứ Hai' }));
    const openInput = screen.getByLabelText('Giờ mở (HH:mm, 24 giờ) Thứ Hai khung 1');
    const closeInput = screen.getByLabelText('Giờ đóng (HH:mm, 24 giờ) Thứ Hai khung 1');
    fireEvent.change(openInput, { target: { value: '25:00' } });
    fireEvent.blur(openInput);
    expect(openInput).toHaveValue('25:00'); // giữ nguyên, không xoá
    expect(screen.getByText(/Giờ không hợp lệ/)).toBeInTheDocument();
    fireEvent.change(closeInput, { target: { value: '18:00' } });

    fireEvent.click(screen.getByRole('button', { name: 'Tạo' }));

    expect(onSubmit).not.toHaveBeenCalled();
    // Hai cảnh báo cùng hiện: lỗi tại ô (TimeOfDayField, "Giờ không hợp lệ") + lỗi tổng ở đầu form
    // (PlaceForm, nêu đúng ngày) — kiểm riêng từng cái, không gộp bằng getByRole đơn.
    const alerts = screen.getAllByRole('alert');
    expect(alerts.some((a) => /Thứ Hai/.test(a.textContent ?? ''))).toBe(true);
  });

  it('gõ "18:70" (phút sai) -> hiện lỗi, KHÔNG được gửi', async () => {
    const onSubmit = await renderFresh();
    await fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm khung giờ cho Thứ Hai' }));
    const openInput = screen.getByLabelText('Giờ mở (HH:mm, 24 giờ) Thứ Hai khung 1');
    const closeInput = screen.getByLabelText('Giờ đóng (HH:mm, 24 giờ) Thứ Hai khung 1');
    fireEvent.change(openInput, { target: { value: '08:00' } });
    fireEvent.change(closeInput, { target: { value: '18:70' } });
    fireEvent.blur(closeInput);

    fireEvent.click(screen.getByRole('button', { name: 'Tạo' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sửa lại giờ đã nhập (xoá, gõ đè) -> payload đúng giá trị mới', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(
      <PlaceForm initial={initialWithHours} submitLabel="Lưu" submittingLabel="Đang lưu…" onSubmit={onSubmit} cancelHref="/x" />,
    );
    await waitFor(() => expect(screen.getByRole('option', { name: 'Bãi biển' })).toBeInTheDocument());
    const openInput = screen.getByLabelText('Giờ mở (HH:mm, 24 giờ) Thứ Hai khung 1');
    fireEvent.change(openInput, { target: { value: '' } });
    fireEvent.change(openInput, { target: { value: '09:15' } });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0] as PlaceFormInput;
    expect(payload.opening_hours?.regular?.mon?.[0]).toEqual({ open: '09:15', close: '12:00' });
  });
});
