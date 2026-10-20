/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import { JobListingCard } from './JobListingCard';
import type { JobListingPublicView } from './types';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function job(overrides: Partial<JobListingPublicView> = {}): JobListingPublicView {
  return {
    id: 'j1',
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
    ...overrides,
  };
}

// Bug thiếu đã sửa (2026-10-11): job_category đã bắt buộc nhập qua form từ trước, nhưng thẻ tin
// tuyển dụng công khai chưa từng hiện field này.
describe('JobListingCard — ngành nghề (bug thiếu đã sửa)', () => {
  it('hiện đúng ngành nghề cạnh hình thức làm việc', () => {
    render(<JobListingCard job={job({ job_category: 'Lễ tân khách sạn' })} />);
    expect(screen.getByText('Lễ tân khách sạn')).toBeInTheDocument();
  });
});

// Nghiệm thu 20/10/2026 — bố cục thẻ tham khảo cấu trúc trang tuyển dụng ngoài (sidebar danh mục +
// thẻ có "logo"/tóm tắt/ngày đăng), giữ ĐÚNG design system sẵn có — tái dùng y hệt cơ chế
// thumbFallback của PlaceCard.tsx (chưa có ảnh → fallback chữ cái đầu), KHÔNG phải ảnh giả. Chưa
// có field ảnh/logo nào trong job_listings nên luôn dùng fallback, không có nhánh ảnh thật.
describe('JobListingCard — thẻ kiểu tham khảo (logo fallback/tóm tắt/ngày đăng, 20/10/2026)', () => {
  it('luôn hiện fallback chữ cái đầu tên nhà tuyển dụng (không có field ảnh nào để hiện thật)', () => {
    render(<JobListingCard job={job({ employer_name: 'Sealight Villa Phu Quoc' })} />);
    expect(screen.getByText('S')).toBeInTheDocument();
  });

  it('có description → hiện tóm tắt đã gộp "\\n" thành khoảng trắng, cắt bớt nếu quá dài', () => {
    const longDesc = 'Đoạn một.\n\nĐoạn hai, '.padEnd(200, 'x');
    render(<JobListingCard job={job({ description: longDesc })} />);
    const shown = screen.getByText(/Đoạn một\. Đoạn hai/);
    expect(shown.textContent).not.toContain('\n');
    expect(shown.textContent!.length).toBeLessThanOrEqual(141); // 140 ký tự + dấu "…"
    expect(shown.textContent!.endsWith('…')).toBe(true);
  });

  it('description null → không hiện khối tóm tắt (không bịa nội dung)', () => {
    render(<JobListingCard job={job({ description: null })} />);
    expect(screen.queryByText(/Đoạn/)).not.toBeInTheDocument();
  });

  it('có published_at → hiện đúng ngày đăng đó, không phải created_at', () => {
    render(<JobListingCard job={job({ published_at: '2026-03-15T00:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z' })} />);
    expect(screen.getByText(/Đăng ngày: 15\/3\/2026/)).toBeInTheDocument();
  });

  it('published_at null → dùng created_at làm ngày đăng', () => {
    render(<JobListingCard job={job({ published_at: null, created_at: '2026-02-10T00:00:00.000Z' })} />);
    expect(screen.getByText(/Đăng ngày: 10\/2\/2026/)).toBeInTheDocument();
  });

  it('locale=en → nhãn "Posted" bằng tiếng Anh', () => {
    render(<JobListingCard job={job({ published_at: '2026-03-15T00:00:00.000Z' })} locale="en" />);
    expect(screen.getByText(/Posted: 3\/15\/2026/)).toBeInTheDocument();
  });
});
