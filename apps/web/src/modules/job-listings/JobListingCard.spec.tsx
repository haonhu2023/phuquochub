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
