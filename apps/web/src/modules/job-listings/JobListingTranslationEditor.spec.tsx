/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { JobListingTranslationEditor } from './JobListingTranslationEditor';
import { readSession } from '@/modules/auth/session';
import { getMyJobListingTranslation, saveJobListingTranslation, submitJobListingTranslation } from './api/job-listings.api';
import { ApiError } from '@/lib/http';
import type { JobListingSenderDetailView, JobListingTranslationView } from './types';

jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));
jest.mock('./api/job-listings.api', () => ({
  getMyJobListingTranslation: jest.fn(),
  saveJobListingTranslation: jest.fn(),
  submitJobListingTranslation: jest.fn(),
}));

const mockReadSession = readSession as jest.Mock;
const mockGet = getMyJobListingTranslation as jest.Mock;
const mockSave = saveJobListingTranslation as jest.Mock;
const mockSubmit = submitJobListingTranslation as jest.Mock;

function job(overrides: Partial<JobListingSenderDetailView> = {}): JobListingSenderDetailView {
  return {
    id: 'job-1',
    place: null,
    place_id: null,
    employer_name: 'Nhà hàng A',
    employer_role: null,
    title: 'Phục vụ bàn',
    job_category: 'F&B',
    ward: null,
    work_location: 'Dương Đông',
    employment_type: 'full_time',
    salary_min: null,
    salary_max: null,
    salary_negotiable: true,
    salary_currency: null,
    salary_period: null,
    shift_info: null,
    requirements: 'Nhiệt tình',
    benefits: 'Thưởng lễ',
    description: 'Mô tả tiếng Việt',
    contact_method: 'phone',
    contact_value: '0909000000',
    expires_at: null,
    published_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    status: 'published',
    review_note: null,
    reviewed_at: null,
    ...overrides,
  };
}

function translation(overrides: Partial<JobListingTranslationView> = {}): JobListingTranslationView {
  return {
    id: 'tr-1',
    job_listing_id: 'job-1',
    locale: 'en',
    title: 'Waiter',
    description: 'English description',
    requirements: null,
    benefits: null,
    status: 'draft',
    review_note: null,
    reviewed_at: null,
    has_published: false,
    published_at: null,
    content_version: 1,
    created_at: '2026-10-17T00:00:00.000Z',
    updated_at: '2026-10-17T00:00:00.000Z',
    is_stale: false,
    is_published_stale: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockReadSession.mockReturnValue({ accessToken: 'tok' });
});
afterEach(() => jest.clearAllMocks());

// Gói C (17/10/2026) — kiểm ĐÚNG điều owner yêu cầu: lưu nháp/gửi duyệt/hiện trạng thái+lý do từ
// chối, xử lý 409 GIỮ nội dung đang nhập (không xoá), và xem trước VI/EN.
describe('JobListingTranslationEditor', () => {
  it('chưa có bản dịch nào → các ô trống, nút Gửi duyệt bị khoá (thiếu tiêu đề/mô tả)', async () => {
    mockGet.mockResolvedValue(null);
    render(<JobListingTranslationEditor job={job()} />);
    expect(await screen.findByLabelText('Tiêu đề (tiếng Anh)')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Gửi duyệt bản dịch' })).toBeDisabled();
  });

  it('đã có bản dịch → prefill đúng nội dung + hiện trạng thái', async () => {
    mockGet.mockResolvedValue(translation());
    render(<JobListingTranslationEditor job={job()} />);
    expect(await screen.findByLabelText('Tiêu đề (tiếng Anh)')).toHaveValue('Waiter');
    expect(screen.getByText(/Nháp/)).toBeInTheDocument();
  });

  it('tin đang hiện công khai bằng bản ĐÃ DUYỆT, đang sửa tiếp (status=draft, has_published=true) → hiện ghi chú rõ không bị ảnh hưởng', async () => {
    mockGet.mockResolvedValue(translation({ status: 'draft', has_published: true }));
    render(<JobListingTranslationEditor job={job()} />);
    expect(await screen.findByText(/KHÔNG ảnh hưởng tới bản đó/)).toBeInTheDocument();
  });

  it('is_published_stale=true → hiện cảnh báo rà soát lại', async () => {
    mockGet.mockResolvedValue(translation({ has_published: true, is_published_stale: true }));
    render(<JobListingTranslationEditor job={job()} />);
    expect(await screen.findByText(/nên rà soát lại/)).toBeInTheDocument();
  });

  it('rejected kèm lý do từ chối → hiện rõ lý do', async () => {
    mockGet.mockResolvedValue(translation({ status: 'rejected', review_note: 'Dịch chưa tự nhiên' }));
    render(<JobListingTranslationEditor job={job()} />);
    expect(await screen.findByText(/Dịch chưa tự nhiên/)).toBeInTheDocument();
  });

  it('lưu nháp lần đầu (chưa có bản dịch) → gọi API KHÔNG kèm expected_content_version', async () => {
    mockGet.mockResolvedValue(null);
    mockSave.mockResolvedValue(translation());
    render(<JobListingTranslationEditor job={job()} />);
    await screen.findByLabelText('Tiêu đề (tiếng Anh)');
    fireEvent.change(screen.getByLabelText('Tiêu đề (tiếng Anh)'), { target: { value: 'Waiter' } });
    fireEvent.change(screen.getByLabelText('Mô tả công việc (tiếng Anh)'), { target: { value: 'English description' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp tiếng Anh' }));
    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith(
        'job-1',
        expect.objectContaining({ title: 'Waiter', description: 'English description', expected_content_version: undefined }),
        'tok',
      ),
    );
  });

  it('lưu nháp khi đã có bản dịch → gửi ĐÚNG content_version hiện tại', async () => {
    mockGet.mockResolvedValue(translation({ content_version: 3 }));
    mockSave.mockResolvedValue(translation({ content_version: 4 }));
    render(<JobListingTranslationEditor job={job()} />);
    await screen.findByLabelText('Tiêu đề (tiếng Anh)');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp tiếng Anh' }));
    await waitFor(() => expect(mockSave).toHaveBeenCalledWith('job-1', expect.objectContaining({ expected_content_version: 3 }), 'tok'));
  });

  // Điểm owner yêu cầu trực tiếp: 409 KHÔNG xoá nội dung người dùng đang nhập.
  it('409 Conflict → hiện lỗi rõ, GIỮ NGUYÊN nội dung đang nhập trong ô, hiện nút lấy phiên bản mới', async () => {
    mockGet.mockResolvedValue(translation({ content_version: 1 }));
    mockSave.mockRejectedValue(new ApiError('conflict', 409));
    render(<JobListingTranslationEditor job={job()} />);
    await screen.findByLabelText('Tiêu đề (tiếng Anh)');
    fireEvent.change(screen.getByLabelText('Tiêu đề (tiếng Anh)'), { target: { value: 'Đang gõ tiếp, chưa lưu được' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp tiếng Anh' }));
    await waitFor(() => expect(screen.getByText(/vừa bị sửa hoặc duyệt bởi người khác/)).toBeInTheDocument());
    // Nội dung KHÔNG bị xoá/ghi đè sau lỗi 409.
    expect(screen.getByLabelText('Tiêu đề (tiếng Anh)')).toHaveValue('Đang gõ tiếp, chưa lưu được');
    expect(screen.getByRole('button', { name: /Lấy phiên bản mới nhất/ })).toBeInTheDocument();
  });

  it('bấm "Lấy phiên bản mới nhất" sau 409 → gọi lại GET, KHÔNG đổi nội dung ô đang nhập', async () => {
    mockGet.mockResolvedValueOnce(translation({ content_version: 1 })).mockResolvedValueOnce(translation({ content_version: 5, title: 'Server đã đổi' }));
    mockSave.mockRejectedValue(new ApiError('conflict', 409));
    render(<JobListingTranslationEditor job={job()} />);
    await screen.findByLabelText('Tiêu đề (tiếng Anh)');
    fireEvent.change(screen.getByLabelText('Tiêu đề (tiếng Anh)'), { target: { value: 'Giữ nguyên nội dung này' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp tiếng Anh' }));
    const reloadBtn = await screen.findByRole('button', { name: /Lấy phiên bản mới nhất/ });
    fireEvent.click(reloadBtn);
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Tiêu đề (tiếng Anh)')).toHaveValue('Giữ nguyên nội dung này'); // KHÔNG bị ghi đè bởi 'Server đã đổi'.
  });

  it('gửi duyệt → gọi submitJobListingTranslation', async () => {
    mockGet.mockResolvedValue(translation({ title: 'Waiter', description: 'English description', status: 'draft' }));
    mockSubmit.mockResolvedValue(translation({ status: 'pending' }));
    render(<JobListingTranslationEditor job={job()} />);
    const btn = await screen.findByRole('button', { name: 'Gửi duyệt bản dịch' });
    fireEvent.click(btn);
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledWith('job-1', 'tok'));
    expect(await screen.findByText(/Đang chờ duyệt/)).toBeInTheDocument();
  });

  it('bấm "Xem trước VI/EN" → hiện đối chiếu tiếng Việt (bản gốc) và tiếng Anh (bản đang nhập)', async () => {
    mockGet.mockResolvedValue(translation({ title: 'Waiter', description: 'English description' }));
    render(<JobListingTranslationEditor job={job({ title: 'Phục vụ bàn', description: 'Mô tả tiếng Việt' })} />);
    await screen.findByLabelText('Tiêu đề (tiếng Anh)');
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước VI/EN' }));
    expect(screen.getByText('Phục vụ bàn')).toBeInTheDocument();
    expect(screen.getByText('Mô tả tiếng Việt')).toBeInTheDocument();
    expect(screen.getByText('Waiter')).toBeInTheDocument();
    expect(screen.getByText('English description', { selector: 'p' })).toBeInTheDocument();
  });
});
