import { JobListing } from './entities/job-listing.entity';
import { JobListingTranslation } from './entities/job-listing-translation.entity';
import { isJobListingTranslationStale } from './job-listing-translation-hash';

// Một view DUY NHẤT (khác job-listings.mapper.ts's public/sender/moderator/admin ba-bốn view) —
// bản dịch không có thông tin nhạy cảm nào cần ẩn khác nhau giữa chủ tin và moderator (không có
// liên hệ/giá riêng gì ở đây, chỉ văn bản+trạng thái); chủ tin và moderator thấy CÙNG hình dạng.
// `parent` (job_listings hiện tại) TÙY CHỌN — chỉ cần để tính `is_stale`; bỏ qua ở những nơi không
// cần (ví dụ danh sách chờ duyệt rút gọn) để tránh buộc mọi call site phải tải listing gốc.
export function toJobListingTranslationView(
  row: JobListingTranslation,
  parent?: Pick<JobListing, 'title' | 'description' | 'requirements' | 'benefits'>,
) {
  return {
    id: row.id,
    job_listing_id: row.jobListingId,
    locale: row.locale,
    title: row.title,
    description: row.description,
    requirements: row.requirements,
    benefits: row.benefits,
    status: row.status,
    review_note: row.reviewNote,
    reviewed_at: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    is_stale: parent ? isJobListingTranslationStale(row.sourceContentHash, parent) : null,
  };
}

// Hàng chờ duyệt: thêm chút ngữ cảnh tin GỐC (tiêu đề/đơn vị tiếng Việt) — `title`/`description`
// của view trên là bản TIẾNG ANH đang chờ duyệt, không đủ để moderator biết đang duyệt tin nào nếu
// không có tên gốc đi kèm.
export function toJobListingTranslationModeratorView(row: JobListingTranslation, parent: JobListing) {
  return {
    ...toJobListingTranslationView(row, parent),
    source_title: parent.title,
    source_employer_name: parent.employerName,
  };
}
