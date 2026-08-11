/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClaimForm } from './ClaimForm';
import { readSession } from '@/modules/auth/session';
import { submitBusinessClaim } from './api/business-claims.api';
import { ApiError } from '@/lib/http';
import type { SubmitBusinessClaimInput } from './types';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/business-claims.api', () => ({ submitBusinessClaim: jest.fn() }));

const mockReadSession = readSession as jest.Mock;
const mockSubmit = submitBusinessClaim as jest.Mock;

const SESSION = { accessToken: 'tok', refreshToken: 'r', expiresAt: 0, user: { id: 'u1', email: 'a@b.c', displayName: 'A', avatarUrl: null } };

beforeEach(() => {
  mockReadSession.mockReset().mockReturnValue(SESSION);
  mockSubmit.mockReset().mockResolvedValue({
    id: 'claim1',
    place_id: 'p1',
    requester_id: 'u1',
    status: 'pending',
    reviewer_id: null,
    reason_code: null,
    decision_note: null,
    decided_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  });
});

describe('ClaimForm — hiển thị', () => {
  it('hiển thị tên địa điểm và một mục bằng chứng bắt buộc', () => {
    render(<ClaimForm placeId="p1" placeName="Bãi Sao" onSubmitted={jest.fn()} />);
    expect(screen.getByText('Bãi Sao')).toBeInTheDocument();
    expect(screen.getByText('Bằng chứng 1')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Nội dung/)[0]).toBeRequired();
    // Chỉ 1 mục → không có nút Xoá (không cho xoá mục cuối cùng)
    expect(screen.queryByRole('button', { name: 'Xoá' })).not.toBeInTheDocument();
  });
});

describe('ClaimForm — danh sách bằng chứng động', () => {
  it('thêm mục → xuất hiện mục mới, có nút Xoá', () => {
    render(<ClaimForm placeId="p1" placeName="Bãi Sao" onSubmitted={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm bằng chứng khác' }));
    expect(screen.getByText('Bằng chứng 2')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Xoá' })).toHaveLength(2);
  });

  it('xoá mục → còn lại đúng số mục, không xoá được khi chỉ còn 1', () => {
    render(<ClaimForm placeId="p1" placeName="Bãi Sao" onSubmitted={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Thêm bằng chứng khác' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Xoá' })[0]);
    expect(screen.queryByText('Bằng chứng 2')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xoá' })).not.toBeInTheDocument();
  });

  it('không thêm quá 10 mục (ArrayMaxSize business.dto.ts)', () => {
    render(<ClaimForm placeId="p1" placeName="Bãi Sao" onSubmitted={jest.fn()} />);
    const addBtn = screen.getByRole('button', { name: '+ Thêm bằng chứng khác' });
    for (let i = 0; i < 9; i++) fireEvent.click(addBtn);
    expect(screen.getByText('Bằng chứng 10')).toBeInTheDocument();
    expect(addBtn).toBeDisabled();
  });
});

describe('ClaimForm — gửi form', () => {
  it('điền hợp lệ → submitBusinessClaim nhận đúng payload (khớp SubmitBusinessClaimDto)', async () => {
    const onSubmitted = jest.fn();
    render(<ClaimForm placeId="p1" placeName="Bãi Sao" onSubmitted={onSubmitted} />);

    fireEvent.change(screen.getByLabelText(/Nội dung/), { target: { value: '  0909123456  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu xác nhận' }));

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1));
    const [payload, token] = mockSubmit.mock.calls[0] as [SubmitBusinessClaimInput, string];
    expect(token).toBe('tok');
    expect(payload).toEqual({
      place_id: 'p1',
      evidence: [{ type: 'storefront_photo', reference: '0909123456', note: undefined }],
    });
    expect(onSubmitted).toHaveBeenCalledWith(expect.objectContaining({ id: 'claim1', status: 'pending' }));
  });

  it('nút gửi bị vô hiệu hoá trong lúc đang gửi (chống double-submit)', async () => {
    let resolveSubmit: (v: unknown) => void = () => {};
    mockSubmit.mockImplementation(() => new Promise((resolve) => (resolveSubmit = resolve)));
    const onSubmitted = jest.fn();
    render(<ClaimForm placeId="p1" placeName="Bãi Sao" onSubmitted={onSubmitted} />);
    fireEvent.change(screen.getByLabelText(/Nội dung/), { target: { value: 'x' } });

    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu xác nhận' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Đang gửi…' })).toBeDisabled());
    resolveSubmit({ id: 'c1', status: 'pending' });
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
  });

  it('nội dung chỉ toàn khoảng trắng → báo lỗi, không gọi API (HTML required không chặn được)', async () => {
    render(<ClaimForm placeId="p1" placeName="Bãi Sao" onSubmitted={jest.fn()} />);
    fireEvent.change(screen.getByLabelText(/Nội dung/), { target: { value: '   ' } });

    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu xác nhận' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('không được để trống'));
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('không có session → báo lỗi, không gọi API', async () => {
    mockReadSession.mockReturnValue(null);
    render(<ClaimForm placeId="p1" placeName="Bãi Sao" onSubmitted={jest.fn()} />);
    fireEvent.change(screen.getByLabelText(/Nội dung/), { target: { value: 'x' } });

    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu xác nhận' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Phiên đăng nhập đã hết hạn'));
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('backend 404 (place chưa published) → thông báo rõ ràng', async () => {
    mockSubmit.mockRejectedValue(new ApiError('not found', 404));
    render(<ClaimForm placeId="p1" placeName="Bãi Sao" onSubmitted={jest.fn()} />);
    fireEvent.change(screen.getByLabelText(/Nội dung/), { target: { value: 'x' } });

    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu xác nhận' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('chưa được công khai'));
  });

  it('backend 409 (đã có claim pending) → hiển thị nguyên văn thông điệp backend', async () => {
    mockSubmit.mockRejectedValue(new ApiError('Bạn đã có một yêu cầu claim đang chờ xác minh cho cơ sở này.', 409));
    render(<ClaimForm placeId="p1" placeName="Bãi Sao" onSubmitted={jest.fn()} />);
    fireEvent.change(screen.getByLabelText(/Nội dung/), { target: { value: 'x' } });

    fireEvent.click(screen.getByRole('button', { name: 'Gửi yêu cầu xác nhận' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('đang chờ xác minh'));
  });
});
