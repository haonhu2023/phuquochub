/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AdminJobListingsView } from './AdminJobListingsView';
import { readSession } from '@/modules/auth/session';
import { closeJobListing, listJobListingsForAdmin, reopenJobListing } from './api/job-listings.api';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/job-listings.api', () => ({
  listJobListingsForAdmin: jest.fn(),
  closeJobListing: jest.fn(),
  reopenJobListing: jest.fn(),
}));
jest.mock('@/lib/listingExpiry', () => ({
  ...jest.requireActual('@/lib/listingExpiry'),
  useTodayInVietnam: () => '2026-06-15',
}));

const mockReadSession = readSession as jest.Mock;
const mockList = listJobListingsForAdmin as jest.Mock;
const mockClose = closeJobListing as jest.Mock;
const mockReopen = reopenJobListing as jest.Mock;

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    place_id: null,
    employer_name: 'Nhà hàng Biển Xanh',
    employer_role: null,
    title: 'Phục vụ bàn',
    job_category: 'F&B',
    ward: 'An Thới',
    work_location: 'An Thới, Phú Quốc',
    employment_type: 'full_time',
    salary_min: null,
    salary_max: null,
    salary_negotiable: true,
    salary_currency: null,
    salary_period: null,
    shift_info: null,
    requirements: null,
    benefits: null,
    description: null,
    contact_method: 'phone',
    contact_value: '0909xxxxxx',
    expires_at: null,
    published_at: null,
    created_at: '2026-10-07T00:00:00.000Z',
    updated_at: '2026-10-07T00:00:00.000Z',
    status: 'published',
    review_note: null,
    reviewed_at: null,
    created_by: 'owner-1',
    reviewer_id: null,
    creator_email: 'owner1@test.com',
    creator_display_name: 'Chủ tin 1',
    ...overrides,
  };
}

function page(data: ReturnType<typeof row>[], total: number) {
  return { data, meta: { page: 1, pageSize: 50, total, totalPages: Math.ceil(total / 50), timestamp: '' } };
}

beforeEach(() => {
  mockReadSession.mockReturnValue({ accessToken: 'tok' });
});

afterEach(() => jest.clearAllMocks());

// Khác JobListingModerationQueueView.spec.tsx (hàng chờ duyệt, chỉ pending): kiểm ĐÚNG điều owner
// yêu cầu — thấy tin MỌI status/MỌI người đăng, lọc "Hết hạn"/"Sắp hết hạn" theo trạng thái HIỆU
// LỰC (không phải cột status), phân trang rõ ràng (không để admin nhầm đã tìm hết), và hành động
// đóng/mở lại gọi đúng API (cùng API moderator đã dùng được từ trước).
describe('AdminJobListingsView — quản lý tất cả tin tuyển dụng', () => {
  it('không có session → trạng thái "không có quyền"', async () => {
    mockReadSession.mockReturnValue(null);
    render(<AdminJobListingsView />);
    expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
  });

  it('403 từ API → trạng thái "không có quyền" (chặn ở server, không chỉ web)', async () => {
    const { ApiError } = jest.requireActual('@/lib/http');
    mockList.mockRejectedValue(new ApiError('forbidden', 403));
    render(<AdminJobListingsView />);
    expect(await screen.findByText('Không có quyền truy cập')).toBeInTheDocument();
  });

  it('tải trang đầu: gọi API với page=1/limit=50, không status (bộ lọc mặc định "Tất cả")', async () => {
    mockList.mockResolvedValue(page([row()], 1));
    render(<AdminJobListingsView />);
    await screen.findByText(/Phục vụ bàn/);
    expect(mockList).toHaveBeenCalledWith({ status: undefined, page: 1, limit: 50 }, 'tok');
  });

  it('hiện tin của NHIỀU người đăng, NHIỀU trạng thái cùng lúc (khác hàng chờ duyệt chỉ-pending)', async () => {
    mockList.mockResolvedValue(
      page(
        [
          row({ id: 'job-pub', status: 'published', creator_display_name: 'Chủ tin 1' }),
          row({ id: 'job-closed', status: 'closed', title: 'Tin đã đóng', creator_display_name: 'Chủ tin 2', creator_email: 'owner2@test.com' }),
          row({ id: 'job-draft', status: 'draft', title: 'Tin nháp', creator_display_name: 'Chủ tin 3' }),
        ],
        3,
      ),
    );
    render(<AdminJobListingsView />);
    expect(await screen.findByText(/Tin đã đóng/)).toBeInTheDocument();
    expect(screen.getByText(/Tin nháp/)).toBeInTheDocument();
    expect(screen.getByText(/Chủ tin 1/)).toBeInTheDocument();
    expect(screen.getByText(/owner2@test.com/)).toBeInTheDocument();
  });

  it('người đăng đã bị xoá (creator_display_name null) → hiện ghi chú rõ, không crash', async () => {
    mockList.mockResolvedValue(page([row({ creator_display_name: null, creator_email: null })], 1));
    render(<AdminJobListingsView />);
    expect(await screen.findByText(/đã xoá tài khoản/)).toBeInTheDocument();
  });

  it('đổi bộ lọc sang status THẬT (Đã đóng) → gọi lại API với status đó', async () => {
    mockList.mockResolvedValue(page([row()], 1));
    render(<AdminJobListingsView />);
    await screen.findByText(/Phục vụ bàn/);
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'closed' } });
    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith({ status: 'closed', page: 1, limit: 50 }, 'tok'));
  });

  it('đổi bộ lọc sang "Đã hết hạn" (trạng thái SUY RA) → KHÔNG gửi status cho server, lọc CLIENT-SIDE theo trạng thái hiệu lực', async () => {
    mockList.mockResolvedValue(
      page(
        [
          row({ id: 'job-expired', status: 'published', expires_at: '2026-06-01', title: 'Tin đã hết hạn' }),
          row({ id: 'job-ok', status: 'published', expires_at: '2026-12-31', title: 'Tin còn hạn' }),
          row({ id: 'job-draft', status: 'draft', title: 'Tin nháp' }),
        ],
        3,
      ),
    );
    render(<AdminJobListingsView />);
    await screen.findByText(/Tin đã hết hạn/);
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'expired' } });
    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith({ status: undefined, page: 1, limit: 50 }, 'tok'));
    expect(screen.getByText(/Tin đã hết hạn/)).toBeInTheDocument();
    expect(screen.queryByText(/Tin còn hạn/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tin nháp/)).not.toBeInTheDocument();
  });

  it('lọc người đăng khớp đúng email → chỉ còn tin của người đó, KHÔNG gọi lại API (lọc client-side)', async () => {
    mockList.mockResolvedValue(
      page(
        [
          row({ id: 'job-a', title: 'Tin của A', creator_display_name: 'Người A', creator_email: 'a@test.com' }),
          row({ id: 'job-b', title: 'Tin của B', creator_display_name: 'Người B', creator_email: 'b@test.com' }),
        ],
        2,
      ),
    );
    render(<AdminJobListingsView />);
    await screen.findByText(/Tin của A/);
    const callsBefore = mockList.mock.calls.length;
    fireEvent.change(screen.getByLabelText('Người đăng (tên/email)'), { target: { value: 'a@test.com' } });
    expect(screen.getByText(/Tin của A/)).toBeInTheDocument();
    expect(screen.queryByText(/Tin của B/)).not.toBeInTheDocument();
    expect(mockList.mock.calls.length).toBe(callsBefore);
  });

  // Gói B (17/10/2026), điểm hẹp owner chỉ ra: lọc người đăng client-side có thể khiến admin nhầm
  // "đã tìm hết" khi chỉ mới tải một trang. Phải hiện rõ còn bao nhiêu CHƯA tải.
  it('tổng số (meta.total) nhiều hơn số đã tải + đang lọc người đăng → hiện cảnh báo rõ', async () => {
    mockList.mockResolvedValue(page([row({ id: 'job-a', creator_display_name: 'Người A' })], 120));
    render(<AdminJobListingsView />);
    await screen.findByText(/Đã tải 1\/120/);
    fireEvent.change(screen.getByLabelText('Người đăng (tên/email)'), { target: { value: 'ai đó' } });
    expect(screen.getByText(/còn 119 tin chưa tải/)).toBeInTheDocument();
  });

  it('không lọc người đăng → KHÔNG hiện cảnh báo, chỉ hiện số đã tải/tổng', async () => {
    mockList.mockResolvedValue(page([row()], 120));
    render(<AdminJobListingsView />);
    expect(await screen.findByText(/Đã tải 1\/120/)).toBeInTheDocument();
    expect(screen.queryByText(/chưa tải/)).not.toBeInTheDocument();
  });

  it('"Tải thêm" gọi API trang 2 và NỐI THÊM kết quả, không thay thế', async () => {
    mockList.mockResolvedValueOnce(page([row({ id: 'job-a', title: 'Tin trang 1' })], 2));
    render(<AdminJobListingsView />);
    await screen.findByText(/Tin trang 1/);
    mockList.mockResolvedValueOnce(page([row({ id: 'job-b', title: 'Tin trang 2' })], 2));
    fireEvent.click(screen.getByRole('button', { name: /Tải thêm/ }));
    await screen.findByText(/Tin trang 2/);
    expect(screen.getByText(/Tin trang 1/)).toBeInTheDocument(); // vẫn còn, không bị thay thế.
    expect(mockList).toHaveBeenLastCalledWith({ status: undefined, page: 2, limit: 50 }, 'tok');
  });

  it('đã tải hết (loaded === total) → KHÔNG hiện nút "Tải thêm"', async () => {
    mockList.mockResolvedValue(page([row()], 1));
    render(<AdminJobListingsView />);
    await screen.findByText(/Phục vụ bàn/);
    expect(screen.queryByRole('button', { name: /Tải thêm/ })).not.toBeInTheDocument();
  });

  it('tin published: nút "Đóng tin" gọi closeJobListing đúng id (cùng API moderator đã dùng được)', async () => {
    mockList.mockResolvedValue(page([row({ status: 'published' })], 1));
    mockClose.mockResolvedValue(row({ status: 'closed' }));
    render(<AdminJobListingsView />);
    const btn = await screen.findByRole('button', { name: 'Đóng tin' });
    fireEvent.click(btn);
    await waitFor(() => expect(mockClose).toHaveBeenCalledWith('job-1', 'tok'));
  });

  it('tin closed: nút "Mở lại" gọi reopenJobListing đúng id', async () => {
    mockList.mockResolvedValue(page([row({ status: 'closed' })], 1));
    mockReopen.mockResolvedValue(row({ status: 'pending' }));
    render(<AdminJobListingsView />);
    const btn = await screen.findByRole('button', { name: /Mở lại/ });
    fireEvent.click(btn);
    await waitFor(() => expect(mockReopen).toHaveBeenCalledWith('job-1', 'tok'));
  });
});
