/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { JobListingForm } from './JobListingForm';
import { createJobListing } from './api/job-listings.api';
import { suggest } from '@/modules/search/api/search.api';
import { readSession } from '@/modules/auth/session';
import type { JobListingSenderDetailView } from './types';

jest.mock('./api/job-listings.api', () => ({ createJobListing: jest.fn(), updateJobListing: jest.fn() }));
jest.mock('@/modules/search/api/search.api', () => ({ suggest: jest.fn() }));
jest.mock('@/modules/auth/session', () => ({ readSession: jest.fn() }));

const mockCreate = createJobListing as jest.Mock;
const mockSuggest = suggest as jest.Mock;
const mockReadSession = readSession as jest.Mock;

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/Tên cơ sở\/nhà tuyển dụng/), { target: { value: 'Nhà hàng A' } });
  fireEvent.change(screen.getByLabelText(/Vị trí tuyển/), { target: { value: 'Phục vụ bàn' } });
  fireEvent.change(screen.getByLabelText(/Ngành nghề/), { target: { value: 'F&B' } });
  fireEvent.change(screen.getByLabelText(/Nơi làm việc/), { target: { value: 'Dương Đông' } });
  fireEvent.change(screen.getByLabelText(/Hình thức liên hệ/), { target: { value: 'phone' } });
  fireEvent.change(screen.getByLabelText(/Số điện thoại \/ địa chỉ liên hệ/), { target: { value: '0909000000' } });
}

beforeEach(() => {
  mockReadSession.mockReturnValue({ accessToken: 'tok' });
  mockCreate.mockReset().mockResolvedValue({ id: 'j1', status: 'draft' });
  mockSuggest.mockReset();
});

afterEach(() => jest.clearAllMocks());

// "Place tùy chọn" (mục V đợt 3) — bug thiếu đã sửa: place_id ghi được qua API từ lâu nhưng
// KHÔNG có UI nào để chọn. Test này khoá đúng hành vi của ô chọn single-select mới thêm.
describe('JobListingForm — chọn địa điểm liên quan (bug thiếu đã sửa)', () => {
  it('chưa chọn → hiện ô tìm, không hiện "Đang liên kết"', () => {
    render(<JobListingForm onSaved={jest.fn()} />);
    expect(screen.getByLabelText('Tìm địa điểm theo tên')).toBeInTheDocument();
    expect(screen.queryByText(/Đang liên kết/)).not.toBeInTheDocument();
  });

  it('gõ đủ 2 ký tự → gọi suggest(), chọn một gợi ý → hiện "Đang liên kết", ẩn ô tìm, gửi đúng place_id', async () => {
    mockSuggest.mockResolvedValue([{ id: 'p1', title: 'Bãi Sao', slug: 'bai-sao' }]);
    render(<JobListingForm onSaved={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('Tìm địa điểm theo tên'), { target: { value: 'Bãi' } });
    await waitFor(() => expect(mockSuggest).toHaveBeenCalledWith('Bãi'), { timeout: 2000 });

    fireEvent.click(await screen.findByRole('button', { name: 'Bãi Sao' }));
    expect(screen.getByText(/Đang liên kết/)).toBeInTheDocument();
    expect(screen.getByText('Bãi Sao')).toBeInTheDocument();
    expect(screen.queryByLabelText('Tìm địa điểm theo tên')).not.toBeInTheDocument();

    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /Lưu/ }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ place_id: 'p1' });
  });

  it('bỏ liên kết → ô tìm hiện lại, place_id gửi lên là null', async () => {
    const existing = {
      id: 'j1',
      place_id: 'p1',
      place: { id: 'p1', name: 'Bãi Sao', slug: 'bai-sao' },
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
      requirements: null,
      benefits: null,
      description: null,
      contact_method: 'phone',
      contact_value: '0909000000',
      expires_at: null,
      published_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      status: 'draft',
      review_note: null,
      reviewed_at: null,
    } satisfies JobListingSenderDetailView;

    render(<JobListingForm existing={existing} onSaved={jest.fn()} />);
    expect(screen.getByText('Bãi Sao')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ liên kết' }));
    expect(screen.getByLabelText('Tìm địa điểm theo tên')).toBeInTheDocument();
    expect(screen.queryByText(/Đang liên kết/)).not.toBeInTheDocument();
  });
});
