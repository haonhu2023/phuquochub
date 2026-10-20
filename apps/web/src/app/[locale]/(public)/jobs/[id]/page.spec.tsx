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
    requirements_rich: null,
    benefits: null,
    benefits_rich: null,
    description: null,
    description_rich: null,
    contact_method: 'phone',
    contact_value: '0909000000',
    expires_at: null,
    published_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    locale: 'vi',
    is_translation_stale: false,
    translation_hidden_reason: null,
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

// Bug thật đã sửa 2026-10-17 (owner tự đăng tin thật, phát hiện qua dùng thực tế): mô tả/yêu cầu/
// quyền lợi lưu đúng "\n" (DB/API không cắt) nhưng trang công khai render bằng <p> thường — HTML
// mặc định gộp mọi khoảng trắng liên tiếp (kể cả xuống dòng) thành một dấu cách khi hiển thị, làm
// nội dung nhiều đoạn/danh sách dồn thành một đoạn duy nhất. Sửa bằng CSS `white-space: pre-wrap`
// dùng chung (`placesStyles.longText`, lớp CSS Module thật — xem apps/web/src/modules/places/
// places.module.css). Test ở đây CHỈ khoá đúng việc chuỗi "\n" tới được DOM nguyên vẹn (không bị
// cắt/thay thế trước khi tới trình duyệt) — bằng chứng việc CSS `pre-wrap` thật sự hiển thị đúng đã
// kiểm trực tiếp qua browser thật + dữ liệu thật (owner đã đăng), không lặp lại ở đây: jsdom không
// dựng layout nên không thể assert "có xuống dòng trên màn hình"; mock CSS Module của dự án
// (jest.cssModuleMock.js) cũng không unwrap đúng ESM default-interop nên không thể assert tên class
// qua `.className` một cách đáng tin cậy — không sửa mock dùng chung ở đây, ngoài phạm vi bản vá này.
describe('JobListingDetailPage — giữ xuống dòng mô tả/yêu cầu/quyền lợi (bug thật đã sửa)', () => {
  it('nội dung "\\n" của cả 3 trường tới DOM nguyên vẹn, không bị cắt/thay thế', async () => {
    await renderPage(
      job({
        description: 'Đoạn một.\n\nĐoạn hai, sau một dòng trống.',
        requirements: 'Yêu cầu 1.\nYêu cầu 2.',
        benefits: 'Quyền lợi 1.\nQuyền lợi 2.',
      }),
    );
    expect(screen.getByText(/Đoạn một/).textContent).toBe('Đoạn một.\n\nĐoạn hai, sau một dòng trống.');
    expect(screen.getByText(/Yêu cầu 1/).textContent).toBe('Yêu cầu 1.\nYêu cầu 2.');
    expect(screen.getByText(/Quyền lợi 1/).textContent).toBe('Quyền lợi 1.\nQuyền lợi 2.');
  });
});

// Gói C (17/10/2026) — `job.locale` là nội dung THỰC SỰ phục vụ, có thể khác locale của route; web
// phải ghi RÕ cho người đọc trong CẢ HAI tình huống, không chỉ trả field trong JSON.
describe('JobListingDetailPage — thông báo fallback/lỗi thời bản dịch (Gói C)', () => {
  it('route /en nhưng CHƯA có bản dịch (locale trả về "vi") → ghi chú bằng tiếng Anh rằng đây là bản tiếng Việt', async () => {
    await renderPage(job({ locale: 'vi' }), 'en');
    expect(screen.getByText(/has not been translated into English yet/)).toBeInTheDocument();
  });

  it('route /vi (hoặc locale="vi" đúng như yêu cầu) → KHÔNG hiện ghi chú fallback nào', async () => {
    await renderPage(job({ locale: 'vi' }), 'vi');
    expect(screen.queryByText(/has not been translated/)).not.toBeInTheDocument();
    expect(screen.queryByText(/chưa phản ánh thông tin mới nhất/)).not.toBeInTheDocument();
  });

  it('có bản dịch (locale="en") nhưng is_translation_stale=true → hiện cảnh báo có thể lỗi thời, bằng tiếng Anh khi route /en', async () => {
    await renderPage(job({ locale: 'en', is_translation_stale: true }), 'en');
    expect(screen.getByText(/may not reflect the latest details/)).toBeInTheDocument();
  });

  it('có bản dịch (locale="en"), is_translation_stale=true, nhưng route /vi → cảnh báo bằng tiếng Việt', async () => {
    await renderPage(job({ locale: 'en', is_translation_stale: true }), 'vi');
    expect(screen.getByText(/chưa phản ánh thông tin mới nhất/)).toBeInTheDocument();
  });

  it('có bản dịch, is_translation_stale=false → KHÔNG hiện cảnh báo lỗi thời nào', async () => {
    await renderPage(job({ locale: 'en', is_translation_stale: false }), 'en');
    expect(screen.queryByText(/may not reflect the latest details/)).not.toBeInTheDocument();
  });
});

describe('JobListingDetailPage — ẩn bản dịch khi dữ kiện quan trọng mâu thuẫn (Gói D điểm 4)', () => {
  it('translation_hidden_reason="critical_fact_mismatch" trên route /en → ghi chú ẩn bản dịch, KHÔNG phải ghi chú "chưa dịch"', async () => {
    await renderPage(job({ locale: 'vi', translation_hidden_reason: 'critical_fact_mismatch' }), 'en');
    expect(screen.getByText(/temporarily hidden/)).toBeInTheDocument();
    expect(screen.queryByText(/has not been translated into English yet/)).not.toBeInTheDocument();
  });

  it('translation_hidden_reason=null, locale="vi" (chưa từng dịch) → vẫn là ghi chú "chưa dịch" như cũ', async () => {
    await renderPage(job({ locale: 'vi', translation_hidden_reason: null }), 'en');
    expect(screen.getByText(/has not been translated into English yet/)).toBeInTheDocument();
    expect(screen.queryByText(/temporarily hidden/)).not.toBeInTheDocument();
  });

  it('route /vi → KHÔNG hiện ghi chú ẩn bản dịch dù translation_hidden_reason="critical_fact_mismatch"', async () => {
    await renderPage(job({ locale: 'vi', translation_hidden_reason: 'critical_fact_mismatch' }), 'vi');
    expect(screen.queryByText(/temporarily hidden/)).not.toBeInTheDocument();
  });
});
