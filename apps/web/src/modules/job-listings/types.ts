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

// Gói C (17/10/2026) — `locale` phản ánh NỘI DUNG THỰC SỰ đã trả (không phải locale được yêu cầu
// trong query) — khớp đúng JobListingsService.getPublicById()/listPublic()'s ghi chú. KHÔNG có
// trên JobListingSenderView/ModeratorView (chỉ view công khai có khái niệm "locale đã phục vụ").
export type JobListingPublicView = JobListingBaseView & { locale: 'vi' | 'en' };

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

// Gói B (17/10/2026) — màn hình quản lý TOÀN BỘ tin (khác hàng chờ duyệt): cần danh tính người
// đăng đọc được, `created_by` (UUID trần) không đủ để admin "tìm tin theo người đăng" trên UI.
export interface JobListingAdminView extends JobListingModeratorView {
  creator_email: string | null;
  creator_display_name: string | null;
}

// Bug thiếu đã sửa (2026-10-11): "place tùy chọn" (mục V đợt 3) đã ghi được qua place_id từ lâu
// nhưng response chỉ có id trần — không đủ để hiện lại cho người dùng chọn gì. Backend ghép thêm
// tên/slug (JobListingsService.attachPlace()) CHỈ ở hai lời gọi đọc MỘT bản ghi (getMine/
// getPublicById) — KHÔNG ở listMine()/create()/update()/submit()/close()/reopen(), nên field này
// KHÔNG thuộc JobListingBaseView dùng chung (sẽ nói sai cho các lời gọi không có nó). Form không
// cần backend echo lại sau khi lưu — picker đã biết tên địa điểm vừa chọn từ state cục bộ.
export interface JobListingLinkedPlace {
  id: string;
  name: string;
  slug: string;
}

export type JobListingPublicDetailView = JobListingPublicView & { place: JobListingLinkedPlace | null; is_translation_stale: boolean };
export type JobListingSenderDetailView = JobListingSenderView & { place: JobListingLinkedPlace | null };

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
  locale?: 'vi' | 'en';
}

// Màn hình quản lý TOÀN BỘ tin (admin) — khác ListJobListingsFilter (công khai, chỉ published).
export interface AdminListJobListingsFilter {
  status?: JobListingStatus;
  created_by?: string;
  page?: number;
  limit?: number;
}

// Gói C (17/10/2026) — bản dịch tiếng Anh. Vòng đời RIÊNG (draft/pending/published/rejected),
// ĐỘC LẬP hoàn toàn với JobListingStatus của chính tin — khớp đúng
// apps/api/.../job-listing-translations.mapper.ts.
export const JOB_LISTING_TRANSLATION_STATUSES = ['draft', 'pending', 'published', 'rejected'] as const;
export type JobListingTranslationStatus = (typeof JOB_LISTING_TRANSLATION_STATUSES)[number];

export const JOB_LISTING_TRANSLATION_STATUS_LABELS: Record<JobListingTranslationStatus, string> = {
  draft: 'Nháp',
  pending: 'Đang chờ duyệt',
  published: 'Đã duyệt — đang hiện công khai',
  rejected: 'Bị từ chối',
};

// `has_published`/`is_published_stale` tách biệt "có bản dịch đã duyệt" khỏi "bản dịch khớp phiên
// bản hiện tại" — một bản dịch có thể has_published=true NHƯNG is_published_stale=true (đã duyệt,
// nhưng dữ kiện tiếng Việt đổi sau đó). `is_stale` là về BẢN NHÁP đang soạn (có thể khác bản đã
// duyệt), không liên quan gì tới bản đang công khai.
export interface JobListingTranslationView {
  id: string;
  job_listing_id: string;
  locale: string;
  title: string | null;
  description: string | null;
  requirements: string | null;
  benefits: string | null;
  status: JobListingTranslationStatus;
  review_note: string | null;
  reviewed_at: string | null;
  has_published: boolean;
  published_at: string | null;
  content_version: number;
  created_at: string;
  updated_at: string;
  is_stale: boolean | null;
  is_published_stale: boolean | null;
}

export interface JobListingTranslationModeratorView extends JobListingTranslationView {
  source_title: string;
  source_employer_name: string;
  source_description: string | null;
  source_requirements: string | null;
  source_benefits: string | null;
}

export interface UpsertJobListingTranslationInput {
  title?: string | null;
  description?: string | null;
  requirements?: string | null;
  benefits?: string | null;
  // Bắt buộc khi ĐÃ CÓ bản dịch (CAS) — bỏ trống CHỈ hợp lệ cho lần lưu đầu tiên.
  expected_content_version?: number;
}

export interface DecideJobListingTranslationInput {
  decision: JobListingDecision;
  note?: string;
  expected_content_version: number;
}
