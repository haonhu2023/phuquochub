/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProposeEditForm } from './ProposeEditForm';
import { readSession } from '@/modules/auth/session';
import { submitPlaceEditProposal } from './api/place-edit-proposals.api';
import { ApiError } from '@/lib/http';
import type { PlaceDetail } from '@/modules/places/types';
import type { CreatePlaceEditProposalInput } from './types';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/place-edit-proposals.api', () => ({ submitPlaceEditProposal: jest.fn() }));

const mockReadSession = readSession as jest.Mock;
const mockSubmit = submitPlaceEditProposal as jest.Mock;

const SESSION = {
  accessToken: 'tok',
  refreshToken: 'r',
  expiresAt: 0,
  user: { id: 'u1', email: 'a@b.c', displayName: 'A', avatarUrl: null },
};

function place(overrides: Partial<PlaceDetail> = {}): PlaceDetail {
  return {
    id: 'p1',
    name: 'Bãi Sao',
    slug: 'bai-sao',
    category_id: 'c1',
    category_slug: 'beach',
    short_description: 'Bãi biển cát trắng',
    price_range: null,
    cover_image_url: null,
    rating_avg: null,
    rating_count: 0,
    verification_status: 'pending',
    status: 'published',
    location: { lat: 10.0466, lng: 104.0281 },
    address: '123 Đường Cũ',
    ward: 'An Thới',
    province: null,
    admin_area: null,
    description: null,
    opening_hours: null,
    osm_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    verified_at: null,
    contacts: [],
    prices: [],
    media: [],
    faqs: [],
    trust_sources: [],
    ...overrides,
  };
}

beforeEach(() => {
  mockReadSession.mockReset().mockReturnValue(SESSION);
  mockSubmit.mockReset().mockResolvedValue(undefined);
});

describe('ProposeEditForm — hiển thị giá trị hiện tại để so sánh', () => {
  it('field mặc định là address → hiện giá trị hiện tại của address', () => {
    render(
      <ProposeEditForm placeId="p1" placeName="Bãi Sao" currentPlace={place()} onSubmitted={jest.fn()} />,
    );
    expect(screen.getByText('Hiện tại: 123 Đường Cũ')).toBeInTheDocument();
  });

  it('không có currentPlace (không lấy được dữ liệu) → vẫn render form, không có dòng "Hiện tại"', () => {
    render(<ProposeEditForm placeId="p1" placeName="Bãi Sao" currentPlace={null} onSubmitted={jest.fn()} />);
    expect(screen.queryByText(/^Hiện tại:/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Địa chỉ đề xuất')).toBeInTheDocument();
  });
});

describe('ProposeEditForm — gửi đề xuất theo field_key', () => {
  it('address: điền hợp lệ → gọi API với field_key=address, proposed_value đã trim', async () => {
    render(
      <ProposeEditForm placeId="p1" placeName="Bãi Sao" currentPlace={place()} onSubmitted={jest.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Địa chỉ đề xuất'), { target: { value: '  456 Đường Mới  ' } });
    fireEvent.change(screen.getByLabelText('Vì sao bạn nghĩ nên sửa'), { target: { value: 'Đã chuyển địa chỉ' } });

    fireEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất' }));

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    const [placeId, payload, token] = mockSubmit.mock.calls[0] as [string, CreatePlaceEditProposalInput, string];
    expect(placeId).toBe('p1');
    expect(token).toBe('tok');
    expect(payload).toEqual({ field_key: 'address', proposed_value: '456 Đường Mới', reason: 'Đã chuyển địa chỉ' });
  });

  it('address trống → báo lỗi, KHÔNG gọi API', async () => {
    render(
      <ProposeEditForm placeId="p1" placeName="Bãi Sao" currentPlace={place()} onSubmitted={jest.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Địa chỉ đề xuất'), { target: { value: '   ' } });
    fireEvent.change(screen.getByLabelText('Vì sao bạn nghĩ nên sửa'), { target: { value: 'lý do' } });

    fireEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('không được để trống'));
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('thiếu lý do → báo lỗi, KHÔNG gọi API (dù đã điền giá trị đề xuất)', async () => {
    render(
      <ProposeEditForm placeId="p1" placeName="Bãi Sao" currentPlace={place()} onSubmitted={jest.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Địa chỉ đề xuất'), { target: { value: 'Địa chỉ mới' } });

    fireEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('lý do'));
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('chuyển sang short_description và gửi → field_key=short_description, KHÔNG gửi kèm address', async () => {
    render(
      <ProposeEditForm placeId="p1" placeName="Bãi Sao" currentPlace={place()} onSubmitted={jest.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Trường dữ liệu'), { target: { value: 'short_description' } });
    fireEvent.change(screen.getByLabelText('Mô tả ngắn đề xuất'), { target: { value: 'Bãi biển đẹp nhất đảo' } });
    fireEvent.change(screen.getByLabelText('Vì sao bạn nghĩ nên sửa'), { target: { value: 'Mô tả cũ chưa hấp dẫn' } });

    fireEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất' }));

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    const [, payload] = mockSubmit.mock.calls[0] as [string, CreatePlaceEditProposalInput];
    expect(payload).toEqual({
      field_key: 'short_description',
      proposed_value: 'Bãi biển đẹp nhất đảo',
      reason: 'Mô tả cũ chưa hấp dẫn',
    });
  });

  it('chuyển sang opening_hours, bật 24h và gửi → proposed_value.is_24h = true', async () => {
    render(
      <ProposeEditForm placeId="p1" placeName="Bãi Sao" currentPlace={place()} onSubmitted={jest.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Trường dữ liệu'), { target: { value: 'opening_hours' } });
    fireEvent.click(screen.getByLabelText('Mở cửa 24 giờ mỗi ngày'));
    fireEvent.change(screen.getByLabelText('Vì sao bạn nghĩ nên sửa'), { target: { value: 'Mở cửa cả ngày rồi' } });

    fireEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất' }));

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    const [, payload] = mockSubmit.mock.calls[0] as [string, CreatePlaceEditProposalInput];
    expect(payload.field_key).toBe('opening_hours');
    expect((payload.proposed_value as { is_24h: boolean }).is_24h).toBe(true);
  });

  it('nguồn tham khảo không bắt buộc: bỏ trống → payload không có source_url', async () => {
    render(
      <ProposeEditForm placeId="p1" placeName="Bãi Sao" currentPlace={place()} onSubmitted={jest.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Địa chỉ đề xuất'), { target: { value: 'Địa chỉ mới' } });
    fireEvent.change(screen.getByLabelText('Vì sao bạn nghĩ nên sửa'), { target: { value: 'lý do' } });

    fireEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất' }));

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    const [, payload] = mockSubmit.mock.calls[0] as [string, CreatePlaceEditProposalInput];
    expect(payload.source_url).toBeUndefined();
  });

  it('không có session → báo lỗi, KHÔNG gọi API', async () => {
    mockReadSession.mockReturnValue(null);
    render(
      <ProposeEditForm placeId="p1" placeName="Bãi Sao" currentPlace={place()} onSubmitted={jest.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Địa chỉ đề xuất'), { target: { value: 'Địa chỉ mới' } });
    fireEvent.change(screen.getByLabelText('Vì sao bạn nghĩ nên sửa'), { target: { value: 'lý do' } });

    fireEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Phiên đăng nhập đã hết hạn'));
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('backend 409 (đã có đề xuất pending) → thông báo rõ ràng', async () => {
    mockSubmit.mockRejectedValue(new ApiError('conflict', 409));
    render(
      <ProposeEditForm placeId="p1" placeName="Bãi Sao" currentPlace={place()} onSubmitted={jest.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('Địa chỉ đề xuất'), { target: { value: 'Địa chỉ mới' } });
    fireEvent.change(screen.getByLabelText('Vì sao bạn nghĩ nên sửa'), { target: { value: 'lý do' } });

    fireEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('đang chờ xử lý'));
  });

  it('gửi thành công → onSubmitted được gọi', async () => {
    const onSubmitted = jest.fn();
    render(
      <ProposeEditForm placeId="p1" placeName="Bãi Sao" currentPlace={place()} onSubmitted={onSubmitted} />,
    );
    fireEvent.change(screen.getByLabelText('Địa chỉ đề xuất'), { target: { value: 'Địa chỉ mới' } });
    fireEvent.change(screen.getByLabelText('Vì sao bạn nghĩ nên sửa'), { target: { value: 'lý do' } });

    fireEvent.click(screen.getByRole('button', { name: 'Gửi đề xuất' }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
  });
});
