/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { getJobListing } from '@/modules/job-listings/api/job-listings.api';
import type { JobListingPublicDetailView } from '@/modules/job-listings/types';
import JobListingDetailPage from './page';

jest.mock('@/modules/job-listings/api/job-listings.api', () => ({ getJobListing: jest.fn() }));
jest.mock('@/modules/saved-items/SaveButton', () => ({ SaveButton: () => null }));
jest.mock('@/modules/listing-reports/ReportButton', () => ({ ReportButton: () => null }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockGetJobListing = getJobListing as jest.Mock;

function job(overrides: Partial<JobListingPublicDetailView> = {}): JobListingPublicDetailView {
  return {
    id: 'j1',
    place_id: null,
    place: null,
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
    ...overrides,
  };
}

async function renderPage(j: JobListingPublicDetailView, locale = 'vi') {
  mockGetJobListing.mockResolvedValueOnce(j);
  render(await JobListingDetailPage({ params: Promise.resolve({ id: j.id, locale }) }));
}

afterEach(() => jest.clearAllMocks());

// Bug thiếu đã sửa (2026-10-11): job_category/expires_at đã có trong DTO/form/backend từ trước
// (chủ tin nhập được, backend lọc tin hết hạn khỏi danh sách công khai), nhưng trang chi tiết công
// khai chưa từng render hai field này.
describe('JobListingDetailPage — ngành nghề + hạn tuyển (bug thiếu đã sửa)', () => {
  it('hiện đúng ngành nghề', async () => {
    await renderPage(job({ job_category: 'Lễ tân khách sạn' }));
    expect(screen.getByText('Ngành nghề')).toBeInTheDocument();
    expect(screen.getByText('Lễ tân khách sạn')).toBeInTheDocument();
  });

  it('có hạn tuyển → hiện ngày đúng định dạng vi-VN', async () => {
    await renderPage(job({ expires_at: '2026-12-31T00:00:00.000Z' }));
    expect(screen.getByText('Hạn tuyển')).toBeInTheDocument();
    expect(screen.getByText('31/12/2026')).toBeInTheDocument();
  });

  it('không có hạn tuyển (null) → KHÔNG hiện mục "Hạn tuyển"', async () => {
    await renderPage(job({ expires_at: null }));
    expect(screen.queryByText('Hạn tuyển')).not.toBeInTheDocument();
  });

  it('locale=en → nhãn tiếng Anh', async () => {
    await renderPage(job({ job_category: 'F&B', expires_at: '2026-12-31T00:00:00.000Z' }), 'en');
    expect(screen.getByText('Job category')).toBeInTheDocument();
    expect(screen.getByText('Application deadline')).toBeInTheDocument();
  });
});

// "Place tùy chọn" (mục V đợt 3) — đã ghi được qua place_id từ lâu nhưng chưa từng hiện công khai.
describe('JobListingDetailPage — liên kết địa điểm (bug thiếu đã sửa)', () => {
  it('có place → hiện liên kết đúng tên, trỏ đúng slug', async () => {
    await renderPage(job({ place: { id: 'p1', name: 'Bãi Sao', slug: 'bai-sao' } }));
    const link = screen.getByRole('link', { name: 'Bãi Sao' });
    expect(link).toHaveAttribute('href', '/vi/places/bai-sao');
  });

  it('không có place (null) → KHÔNG hiện mục "Tại:"', async () => {
    await renderPage(job({ place: null }));
    expect(screen.queryByText(/Tại:/)).not.toBeInTheDocument();
  });
});
