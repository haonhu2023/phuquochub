import { JobListing } from './entities/job-listing.entity';

// Khác place-edit-proposals (không có đọc công khai): tin tuyển dụng CÓ một view công khai — mục
// đích của tính năng là để người tìm việc thấy `contact_method`/`contact_value` và liên hệ trực
// tiếp, nên hai trường này LUÔN công khai ở view này (không giống "ẩn giá public" của menu/phòng).
// KHÔNG lộ status/reviewer_id/review_note — người đọc công khai không cần biết (mọi tin ở view này
// chắc chắn đã `published`, kiểm ở JobListingsRepository.publicQuery()).
function baseFields(row: JobListing) {
  return {
    id: row.id,
    place_id: row.placeId,
    employer_name: row.employerName,
    employer_role: row.employerRole,
    title: row.title,
    job_category: row.jobCategory,
    ward: row.ward,
    work_location: row.workLocation,
    employment_type: row.employmentType,
    salary_min: row.salaryMin !== null ? Number(row.salaryMin) : null,
    salary_max: row.salaryMax !== null ? Number(row.salaryMax) : null,
    salary_negotiable: row.salaryNegotiable,
    salary_currency: row.salaryCurrency,
    salary_period: row.salaryPeriod,
    shift_info: row.shiftInfo,
    requirements: row.requirements,
    benefits: row.benefits,
    description: row.description,
    // Gói D — luôn đi kèm `description`: khi không null, renderer dùng RichDoc này thay vì plain
    // text (diễn giải ĐẦY ĐỦ hơn, `description` chỉ là bản phẳng dẫn xuất — xem
    // JobListingsService.applyDescription()). NULL ở MỌI view (kể cả public) nếu tin chưa dùng
    // rich text — hoàn toàn tương thích ngược, client cũ bỏ qua field lạ như thường lệ.
    description_rich: row.descriptionRich,
    contact_method: row.contactMethod,
    contact_value: row.contactValue,
    expires_at: row.expiresAt,
    published_at: row.publishedAt ? row.publishedAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function toJobListingPublicView(row: JobListing) {
  return baseFields(row);
}

// "Tin của tôi": chủ tin thấy trạng thái + lý do từ chối (review_note là ghi chú DUY NHẤT của
// tính năng này, không tách nội bộ/gửi-người-dùng như place-edit-proposals — KHÔNG có field phản
// hồi riêng nào khác, nên ẩn review_note ở đây sẽ khiến chủ tin không biết vì sao bị từ chối để
// sửa trước khi gửi lại). reviewer_id vẫn ẩn (định danh nội bộ của người duyệt, không phải thông
// tin chủ tin cần để hành động).
export function toJobListingSenderView(row: JobListing) {
  return {
    ...baseFields(row),
    status: row.status,
    review_note: row.reviewNote,
    reviewed_at: row.reviewedAt ? row.reviewedAt.toISOString() : null,
  };
}

export function toJobListingModeratorView(row: JobListing) {
  return {
    ...baseFields(row),
    created_by: row.createdBy,
    status: row.status,
    review_note: row.reviewNote,
    reviewer_id: row.reviewerId,
    reviewed_at: row.reviewedAt ? row.reviewedAt.toISOString() : null,
  };
}

// Màn hình quản lý TOÀN BỘ tin (Gói B, 17/10/2026) — thêm danh tính người đăng đọc được (khác
// toJobListingModeratorView's `created_by` UUID trần) vì admin cần "tìm tin theo người đăng", một
// UUID không đủ để làm việc đó. `creator` null nếu user đã bị xoá (không throw — tin vẫn hiện được).
export function toJobListingAdminView(row: JobListing, creator: { email: string; display_name: string } | null) {
  return {
    ...toJobListingModeratorView(row),
    creator_email: creator?.email ?? null,
    creator_display_name: creator?.display_name ?? null,
  };
}
