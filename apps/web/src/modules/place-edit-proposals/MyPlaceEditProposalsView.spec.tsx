/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MyPlaceEditProposalsView } from './MyPlaceEditProposalsView';
import { readSession } from '@/modules/auth/session';
import { listMyPlaceEditProposals } from './api/place-edit-proposals.api';
import { ApiError } from '@/lib/http';
import type { MyPlaceEditProposal } from './types';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/place-edit-proposals.api', () => ({ listMyPlaceEditProposals: jest.fn() }));

const mockReadSession = readSession as jest.Mock;
const mockListMine = listMyPlaceEditProposals as jest.Mock;

const SESSION = { accessToken: 'tok', refreshToken: 'r', expiresAt: 0, user: { id: 'u1', email: 'a@b.c', displayName: 'A', avatarUrl: null } };

function proposal(overrides: Partial<MyPlaceEditProposal> = {}): MyPlaceEditProposal {
  return {
    id: 'pe1',
    place_id: 'p1',
    place_name: 'La Veranda Resort',
    place_slug: 'la-veranda-resort',
    field_key: 'address',
    locale_code: null,
    proposed_value: '123 Trần Hưng Đạo',
    reason: 'Địa chỉ cũ sai',
    source_url: null,
    status: 'pending',
    reviewed_at: null,
    review_note: null,
    created_at: '2026-09-14T00:00:00.000Z',
    updated_at: '2026-09-14T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  mockReadSession.mockReset().mockReturnValue(SESSION);
  mockListMine.mockReset().mockResolvedValue([]);
});

describe('MyPlaceEditProposalsView — chưa đăng nhập', () => {
  it('không có session → hiển thị yêu cầu đăng nhập, không gọi API', async () => {
    mockReadSession.mockReturnValue(null);
    render(<MyPlaceEditProposalsView />);
    await waitFor(() => expect(screen.getByText('Cần đăng nhập')).toBeInTheDocument());
    expect(mockListMine).not.toHaveBeenCalled();
  });
});

describe('MyPlaceEditProposalsView — lỗi tải', () => {
  it('API lỗi 4xx → hiển thị thông báo lỗi + nút Thử lại tải lại', async () => {
    mockListMine.mockRejectedValueOnce(new ApiError('sự cố', 400));
    render(<MyPlaceEditProposalsView />);
    await waitFor(() => expect(screen.getByText('Không tải được danh sách')).toBeInTheDocument());

    mockListMine.mockResolvedValueOnce([proposal()]);
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(screen.getByText(/La Veranda Resort/)).toBeInTheDocument());
  });

  it('lỗi 5xx → thông báo lỗi chung (không lộ message backend)', async () => {
    mockListMine.mockRejectedValueOnce(new ApiError('internal', 500));
    render(<MyPlaceEditProposalsView />);
    await waitFor(() =>
      expect(screen.getByText('Đã xảy ra lỗi khi tải danh sách đề xuất. Vui lòng thử lại.')).toBeInTheDocument(),
    );
  });
});

describe('MyPlaceEditProposalsView — rỗng', () => {
  it('không có đề xuất nào → trạng thái rỗng với liên kết tìm địa điểm', async () => {
    render(<MyPlaceEditProposalsView />);
    await waitFor(() => expect(screen.getByText('Chưa có đề xuất nào')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Tìm địa điểm để đề xuất chỉnh sửa' })).toHaveAttribute(
      'href',
      '/places',
    );
  });
});

describe('MyPlaceEditProposalsView — trạng thái pending', () => {
  it('render tên place + field, nhãn "Đang chờ xem xét", KHÔNG có link Xem địa điểm ẩn field lạ', async () => {
    mockListMine.mockResolvedValue([proposal({ status: 'pending' })]);
    render(<MyPlaceEditProposalsView />);

    await waitFor(() => expect(screen.getByText(/La Veranda Resort/)).toBeInTheDocument());
    expect(screen.getByText(/Địa chỉ/)).toBeInTheDocument();
    expect(screen.getByText('Đang chờ xem xét')).toBeInTheDocument();
    expect(screen.getByText('Đề xuất đang chờ kiểm duyệt viên xem xét.')).toBeInTheDocument();
  });
});

describe('MyPlaceEditProposalsView — trạng thái approved', () => {
  it('render nhãn "Đã áp dụng" + review_note nếu có', async () => {
    mockListMine.mockResolvedValue([
      proposal({ status: 'approved', reviewed_at: '2026-09-15T00:00:00.000Z', review_note: 'Đã xác minh qua Google Maps' }),
    ]);
    render(<MyPlaceEditProposalsView />);

    await waitFor(() => expect(screen.getByText('Đã áp dụng')).toBeInTheDocument());
    expect(screen.getByText(/Đã xác minh qua Google Maps/)).toBeInTheDocument();
  });
});

describe('MyPlaceEditProposalsView — trạng thái rejected', () => {
  it('render nhãn "Bị từ chối" + lý do xử lý (review_note)', async () => {
    mockListMine.mockResolvedValue([proposal({ status: 'rejected', review_note: 'Không đúng địa chỉ thật' })]);
    render(<MyPlaceEditProposalsView />);

    await waitFor(() => expect(screen.getByText('Bị từ chối')).toBeInTheDocument());
    expect(screen.getByText(/Không đúng địa chỉ thật/)).toBeInTheDocument();
  });

  it('KHÔNG render reviewer_id/proposer_id dưới bất kỳ hình thức nào (field này không tồn tại trên MyPlaceEditProposal)', async () => {
    mockListMine.mockResolvedValue([proposal({ status: 'rejected' })]);
    render(<MyPlaceEditProposalsView />);
    await waitFor(() => expect(screen.getByText('Bị từ chối')).toBeInTheDocument());
    expect(screen.queryByText(/reviewer/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/proposer/i)).not.toBeInTheDocument();
  });
});

describe('MyPlaceEditProposalsView — trạng thái needs_changes', () => {
  it('render nhãn "Cần bổ sung" + lý do', async () => {
    mockListMine.mockResolvedValue([proposal({ status: 'needs_changes', review_note: 'Cần nguồn tham khảo' })]);
    render(<MyPlaceEditProposalsView />);

    await waitFor(() => expect(screen.getByText('Cần bổ sung')).toBeInTheDocument());
    expect(screen.getByText(/Cần nguồn tham khảo/)).toBeInTheDocument();
  });
});

describe('MyPlaceEditProposalsView — trạng thái conflict', () => {
  it('render nhãn "Xung đột dữ liệu" + giải thích không tự động áp dụng', async () => {
    mockListMine.mockResolvedValue([proposal({ status: 'conflict' })]);
    render(<MyPlaceEditProposalsView />);

    await waitFor(() => expect(screen.getByText('Xung đột dữ liệu')).toBeInTheDocument());
    expect(screen.getByText(/không thể tự động áp dụng/)).toBeInTheDocument();
  });
});

describe('MyPlaceEditProposalsView — place đã bị xoá', () => {
  it('place_name/place_slug null → hiển thị placeholder, KHÔNG render link Xem địa điểm', async () => {
    mockListMine.mockResolvedValue([proposal({ place_name: null, place_slug: null })]);
    render(<MyPlaceEditProposalsView />);

    await waitFor(() => expect(screen.getByText(/Địa điểm không còn tồn tại/)).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Xem địa điểm' })).not.toBeInTheDocument();
  });
});

describe('MyPlaceEditProposalsView — nhiều đề xuất', () => {
  it('render tất cả đề xuất trả về, mỗi cái đúng place_name riêng', async () => {
    mockListMine.mockResolvedValue([
      proposal({ id: 'pe1', place_name: 'La Veranda Resort' }),
      proposal({ id: 'pe2', place_name: 'Novotel Phú Quốc', field_key: 'short_description' }),
    ]);
    render(<MyPlaceEditProposalsView />);

    await waitFor(() => expect(screen.getByText(/La Veranda Resort/)).toBeInTheDocument());
    expect(screen.getByText(/Novotel Phú Quốc/)).toBeInTheDocument();
  });
});
