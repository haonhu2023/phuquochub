// Khớp apps/api/src/modules/job-listings (enums.ts/dto/job-listings.dto.ts/job-listings.mapper.ts).
// MVP CHỈ 3 kiểu hợp đồng làm việc / 3 kỳ tính lương — không thêm giá trị nào backend chưa validate.
export const JOB_LISTING_EMPLOYMENT_TYPES = ['full_time', 'part_time', 'seasonal'] as const;
export type JobListingEmploymentType = (typeof JOB_LISTING_EMPLOYMENT_TYPES)[number];

// vi: dùng ở CẢ dashboard (vi-only) VÀ trang công khai /jobs (có locale) — giữ tên export này làm
// mặc định/fallback. en: CHỈ trang công khai cần (dashboard không có locale segment, cùng tiền lệ
// PLACE_EDIT_PROPOSAL_STATUS_LABELS không có bản EN).
export const JOB_LISTING_EMPLOYMENT_TYPE_LABELS: Record<JobListingEmploymentType, string> = {
  full_time: 'Toàn thời gian',
  part_time: 'Bán thời gian',
  seasonal: 'Theo mùa/thời vụ',
};

const JOB_LISTING_EMPLOYMENT_TYPE_LABELS_EN: Record<JobListingEmploymentType, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  seasonal: 'Seasonal',
};

export function jobListingEmploymentTypeLabel(type: JobListingEmploymentType, locale: 'vi' | 'en'): string {
  return locale === 'en' ? JOB_LISTING_EMPLOYMENT_TYPE_LABELS_EN[type] : JOB_LISTING_EMPLOYMENT_TYPE_LABELS[type];
}

export const JOB_LISTING_SALARY_PERIODS = ['hour', 'day', 'month'] as const;
export type JobListingSalaryPeriod = (typeof JOB_LISTING_SALARY_PERIODS)[number];

export const JOB_LISTING_SALARY_PERIOD_LABELS: Record<JobListingSalaryPeriod, string> = {
  hour: '/giờ',
  day: '/ngày',
  month: '/tháng',
};

export const JOB_LISTING_STATUSES = ['draft', 'pending', 'published', 'rejected', 'closed'] as const;
export type JobListingStatus = (typeof JOB_LISTING_STATUSES)[number];

export const JOB_LISTING_STATUS_LABELS: Record<JobListingStatus, string> = {
  draft: 'Nháp',
  pending: 'Đang chờ duyệt',
  published: 'Đang đăng',
  rejected: 'Bị từ chối',
  closed: 'Đã đóng',
};

// Trường chung cho CẢ ba view (base_fields phía mapper) — public/sender/moderator chỉ khác ở các
// trường PHÍA SAU (status/review_note/reviewer_id). `contact_method`/`contact_value` LUÔN có mặt
// kể cả ở view công khai — mục đích của tính năng là để người tìm việc liên hệ trực tiếp, khác hẳn
// "ẩn giá public" của menu/phòng.
export interface JobListingBaseView {
  id: string;
  place_id: string | null;
  employer_name: string;
  employer_role: string | null;
  title: string;
  job_category: string;
  ward: string | null;
  work_location: string;
  employment_type: JobListingEmploymentType;
  salary_min: number | null;
  salary_max: number | null;
  salary_negotiable: boolean;
  salary_currency: string | null;
  salary_period: JobListingSalaryPeriod | null;
  shift_info: string | null;
  requirements: string | null;
  benefits: string | null;
  description: string | null;
  contact_method: string;
  contact_value: string;
  expires_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export type JobListingPublicView = JobListingBaseView;

// "Tin của tôi": có status + review_note (lý do từ chối — DUY NHẤT field phản hồi của tính năng
// này, không tách nội bộ/gửi-người-dùng) nhưng KHÔNG có reviewer_id (định danh nội bộ).
export interface JobListingSenderView extends JobListingBaseView {
  status: JobListingStatus;
  review_note: string | null;
  reviewed_at: string | null;
}

export interface JobListingModeratorView extends JobListingSenderView {
  created_by: string;
  reviewer_id: string | null;
}

export interface UpsertJobListingInput {
  employer_name: string;
  employer_role?: string | null;
  place_id?: string | null;
  title: string;
  job_category: string;
  ward?: string | null;
  work_location: string;
  employment_type: JobListingEmploymentType;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_negotiable?: boolean;
  salary_currency?: string | null;
  salary_period?: JobListingSalaryPeriod | null;
  shift_info?: string | null;
  requirements?: string | null;
  benefits?: string | null;
  description?: string | null;
  contact_method: string;
  contact_value: string;
  expires_at?: string | null;
}

export type JobListingDecision = 'approve' | 'reject';

export interface DecideJobListingInput {
  decision: JobListingDecision;
  note?: string;
}

export interface ListJobListingsFilter {
  job_category?: string;
  ward?: string;
  employment_type?: JobListingEmploymentType;
  page?: number;
  limit?: number;
}
