/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MyJobListingsView } from './MyJobListingsView';
import { readSession } from '@/modules/auth/session';
import { closeJobListing, listMyJobListings, submitJobListing } from './api/job-listings.api';
import { confirmListingStillValid, listMyOpenListingReports } from '@/modules/listing-reports/api/listing-reports.api';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/job-listings.api', () => ({
  listMyJobListings: jest.fn(),
  submitJobListing: jest.fn(),
  closeJobListing: jest.fn(),
  reopenJobListing: jest.fn(),
}));
jest.mock('@/modules/listing-reports/api/listing-reports.api', () => ({
  listMyOpenListingReports: jest.fn(),
  confirmListingStillValid: jest.fn(),
}));
// Cố định "hôm nay" cho các test hạn/bộ lọc — mock THẲNG `useTodayInVietnam()` (component gọi hook
// này, không gọi `todayInVietnam()` trực tiếp nữa — mock export kia không có tác dụng vì closure
// nội bộ của hook thật vẫn trỏ về `todayInVietnam` gốc, không phải bản bị mock cùng module). Giữ
// nguyên mọi export khác thật. KHÔNG dùng jest.useFakeTimers(): @testing-library/react dùng timer
// thật nội bộ cho waitFor/findBy*, giả lập timer toàn cục sẽ làm các truy vấn đó treo (đã gặp thật
// khi thử trước).
jest.mock('@/lib/listingExpiry', () => ({
  ...jest.requireActual('@/lib/listingExpiry'),
  useTodayInVietnam: () => '2026-06-15',
}));

const mockReadSession = readSession as jest.Mock;
const mockList = listMyJobListings as jest.Mock;
const mockSubmit = submitJobListing as jest.Mock;
const mockClose = closeJobListing as jest.Mock;
const mockListReports = listMyOpenListingReports as jest.Mock;
const mockConfirmStillValid = confirmListingStillValid as jest.Mock;

beforeEach(() => {
  mockReadSession.mockReturnValue({ accessToken: 'tok' });
  // Mặc định không có báo cáo nào — các test ngoài mục "giai đoạn 2" dưới đây không cần quan tâm.
  mockListReports.mockResolvedValue([]);
});

afterEach(() => jest.clearAllMocks());

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
    status: 'draft',
    review_note: null,
    reviewed_at: null,
    ...overrides,
  };
}

describe('MyJobListingsView — Tin tuyển dụng của tôi', () => {
  it('rỗng → trạng thái rỗng, không báo lỗi', async () => {
    mockList.mockResolvedValue([]);
    render(<MyJobListingsView />);
    expect(await screen.findByText('Chưa có tin nào')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lỗi tải → báo lỗi rõ, không hiện như danh sách rỗng', async () => {
    mockList.mockRejectedValue(new Error('down'));
    render(<MyJobListingsView />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được danh sách');
    expect(screen.queryByText('Chưa có tin nào')).toBeNull();
  });

  it('tin rejected hiện lý do từ chối và nút Gửi duyệt, KHÔNG nút Đóng/Mở lại', async () => {
    mockList.mockResolvedValue([row({ status: 'rejected', review_note: 'Thiếu số điện thoại rõ ràng' })]);
    render(<MyJobListingsView />);
    expect(await screen.findByText(/Thiếu số điện thoại rõ ràng/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi duyệt' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đóng tin' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Mở lại/ })).toBeNull();
  });

  it('tin published hiện nút Đóng tin, bấm gọi closeJobListing đúng id', async () => {
    mockList.mockResolvedValue([row({ status: 'published' })]);
    mockClose.mockResolvedValue(row({ status: 'closed' }));
    render(<MyJobListingsView />);
    const btn = await screen.findByRole('button', { name: 'Đóng tin' });
    fireEvent.click(btn);
    await waitFor(() => expect(mockClose).toHaveBeenCalledWith('job-1', 'tok'));
  });

  // Gói B (17/10/2026), điểm hẹp owner chỉ ra: "làm rõ thao tác trên UI" khi tin đã đóng — không
  // sửa trực tiếp được (update() chặn CLOSED ở service), phải Mở lại trước.
  it('tin closed: hiện nút "Mở lại", KHÔNG hiện nút "Sửa", và có ghi chú giải thích phải mở lại trước khi sửa', async () => {
    mockList.mockResolvedValue([row({ status: 'closed' })]);
    render(<MyJobListingsView />);
    expect(await screen.findByRole('button', { name: /Mở lại/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Sửa/ })).toBeNull();
    expect(screen.getByText(/không sửa trực tiếp được/)).toBeInTheDocument();
  });

  it('tin draft hiện nút Gửi duyệt, bấm gọi submitJobListing đúng id', async () => {
    mockList.mockResolvedValue([row({ status: 'draft' })]);
    mockSubmit.mockResolvedValue(row({ status: 'pending' }));
    render(<MyJobListingsView />);
    const btn = await screen.findByRole('button', { name: 'Gửi duyệt' });
    fireEvent.click(btn);
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledWith('job-1', 'tok'));
  });
});

// Gói B (17/10/2026) — dashboard trước đây không hiện expires_at dù API đã trả sẵn, và không có
// cách lọc/biết vì sao một tin "Đang đăng" không còn công khai sau khi hết hạn (status cột không tự
// đổi — đúng thiết kế, xem listingExpiry.ts). Cố định "hôm nay" bằng fake timer để test không phụ
// thuộc ngày chạy thật.
describe('MyJobListingsView — hạn tuyển + bộ lọc (Gói B)', () => {
  it('có expires_at → hiện đúng ngày dạng dd/mm/yyyy', async () => {
    mockList.mockResolvedValue([row({ status: 'published', expires_at: '2026-12-31' })]);
    render(<MyJobListingsView />);
    expect(await screen.findByText(/hạn tuyển 31\/12\/2026/)).toBeInTheDocument();
  });

  it('published + hạn đã qua → nhãn "Đã hết hạn" + ghi chú giải thích, KHÔNG đổi status hiển thị', async () => {
    mockList.mockResolvedValue([row({ status: 'published', expires_at: '2026-06-01' })]);
    render(<MyJobListingsView />);
    // `{ selector: 'span' }` loại trừ <option value="expired">Đã hết hạn</option> của bộ lọc.
    expect(await screen.findByText(/Đã hết hạn/, { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(/Tin đã quá hạn tuyển/)).toBeInTheDocument();
    // Status hiển thị (kiểm duyệt) KHÔNG đổi chỉ vì đã hết hạn — vẫn "Đang đăng", cộng thêm nhãn hạn.
    expect(screen.getByText(/Phục vụ bàn — Đang đăng/)).toBeInTheDocument();
  });

  it('published + còn ≤ 7 ngày → nhãn "Sắp hết hạn"', async () => {
    mockList.mockResolvedValue([row({ status: 'published', expires_at: '2026-06-20' })]);
    render(<MyJobListingsView />);
    expect(await screen.findByText(/Sắp hết hạn/, { selector: 'span' })).toBeInTheDocument();
  });

  it('published + còn hạn xa → KHÔNG hiện nhãn sắp/đã hết hạn nào', async () => {
    mockList.mockResolvedValue([row({ status: 'published', expires_at: '2026-12-31' })]);
    render(<MyJobListingsView />);
    await screen.findByText(/hạn tuyển/);
    expect(screen.queryByText(/Sắp hết hạn/, { selector: 'span' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Đã hết hạn/, { selector: 'span' })).not.toBeInTheDocument();
  });

  it('bộ lọc "Đã hết hạn" chỉ hiện tin published đã quá expires_at, ẩn tin khác', async () => {
    mockList.mockResolvedValue([
      row({ id: 'expired-1', title: 'Tin đã hết hạn', status: 'published', expires_at: '2026-06-01' }),
      row({ id: 'ok-1', title: 'Tin còn hạn', status: 'published', expires_at: '2026-12-31' }),
      row({ id: 'draft-1', title: 'Tin nháp', status: 'draft' }),
    ]);
    render(<MyJobListingsView />);
    await screen.findByText(/Tin đã hết hạn/);
    fireEvent.change(screen.getByLabelText('Lọc theo trạng thái'), { target: { value: 'expired' } });
    expect(screen.getByText(/Tin đã hết hạn/)).toBeInTheDocument();
    expect(screen.queryByText(/Tin còn hạn/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tin nháp/)).not.toBeInTheDocument();
  });

  it('bộ lọc "Sắp hết hạn" chỉ hiện đúng tin trong ngưỡng cảnh báo', async () => {
    mockList.mockResolvedValue([
      row({ id: 'soon-1', title: 'Tin sắp hết hạn', status: 'published', expires_at: '2026-06-18' }),
      row({ id: 'ok-1', title: 'Tin còn hạn xa', status: 'published', expires_at: '2026-12-31' }),
    ]);
    render(<MyJobListingsView />);
    await screen.findByText(/Tin sắp hết hạn/);
    fireEvent.change(screen.getByLabelText('Lọc theo trạng thái'), { target: { value: 'expiring_soon' } });
    expect(screen.getByText(/Tin sắp hết hạn/)).toBeInTheDocument();
    expect(screen.queryByText(/Tin còn hạn xa/)).not.toBeInTheDocument();
  });

  it('không có tin nào khớp bộ lọc → thông báo rõ, không báo lỗi', async () => {
    mockList.mockResolvedValue([row({ status: 'draft' })]);
    render(<MyJobListingsView />);
    fireEvent.change(await screen.findByLabelText('Lọc theo trạng thái'), { target: { value: 'expired' } });
    expect(screen.getByText('Không có tin nào khớp bộ lọc')).toBeInTheDocument();
  });
});

function report(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lr-1',
    target_type: 'job_listing',
    target_id: 'job-1',
    reason: 'not_reachable',
    description: null,
    status: 'open',
    resolved_at: null,
    created_at: '2026-06-10T00:00:00.000Z',
    listing: null,
    ...overrides,
  };
}

// Giai đoạn 2 (21/10/2026) — vòng lặp "còn đúng không?".
describe('MyJobListingsView — xác nhận "vẫn đang tuyển" (giai đoạn 2, 21/10/2026)', () => {
  it('không có báo cáo nào đang mở → KHÔNG hiện khối cảnh báo', async () => {
    mockList.mockResolvedValue([row({ status: 'published' })]);
    mockListReports.mockResolvedValue([]);
    render(<MyJobListingsView />);
    await screen.findByText('Phục vụ bàn — Đang đăng');
    expect(screen.queryByRole('button', { name: 'Xác nhận vẫn đang tuyển' })).not.toBeInTheDocument();
  });

  it('có báo cáo đang mở trên tin của mình → hiện đúng lý do + nút xác nhận', async () => {
    mockList.mockResolvedValue([row({ status: 'published' })]);
    mockListReports.mockResolvedValue([report({ reason: 'not_reachable' }), report({ id: 'lr-2', reason: 'no_longer_available' })]);
    render(<MyJobListingsView />);
    expect(await screen.findByText(/2 người báo: Không liên hệ được, Đã hết \/ đã tuyển đủ/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận vẫn đang tuyển' })).toBeInTheDocument();
  });

  it('báo cáo của TIN KHÁC không hiện lẫn vào tin này (lọc đúng target_id)', async () => {
    mockList.mockResolvedValue([row({ id: 'job-1', status: 'published' })]);
    mockListReports.mockResolvedValue([report({ target_id: 'job-OTHER' })]);
    render(<MyJobListingsView />);
    await screen.findByText('Phục vụ bàn — Đang đăng');
    expect(screen.queryByRole('button', { name: 'Xác nhận vẫn đang tuyển' })).not.toBeInTheDocument();
  });

  it('bấm "Xác nhận vẫn đang tuyển" → gọi confirmListingStillValid cho ĐÚNG từng report id, rồi tải lại', async () => {
    mockList.mockResolvedValueOnce([row({ status: 'published' })]).mockResolvedValueOnce([row({ status: 'published' })]);
    mockListReports.mockResolvedValue([report({ id: 'lr-a' }), report({ id: 'lr-b' })]);
    mockConfirmStillValid.mockResolvedValue(report({ status: 'self_confirmed' }));
    render(<MyJobListingsView />);
    const btn = await screen.findByRole('button', { name: 'Xác nhận vẫn đang tuyển' });
    fireEvent.click(btn);
    await waitFor(() => expect(mockConfirmStillValid).toHaveBeenNthCalledWith(1, 'lr-a', 'tok'));
    await waitFor(() => expect(mockConfirmStillValid).toHaveBeenNthCalledWith(2, 'lr-b', 'tok'));
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  });

  it('lỗi khi tải báo cáo không chặn trang chính (danh sách tin vẫn hiện bình thường)', async () => {
    mockList.mockResolvedValue([row({ status: 'published' })]);
    mockListReports.mockRejectedValue(new Error('network down'));
    render(<MyJobListingsView />);
    expect(await screen.findByText('Phục vụ bàn — Đang đăng')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
