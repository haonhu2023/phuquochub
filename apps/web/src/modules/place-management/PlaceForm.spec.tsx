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
    description: 'Mô tả chi tiết',
    osm_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
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
