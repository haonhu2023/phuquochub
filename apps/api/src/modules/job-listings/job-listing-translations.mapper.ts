import { JobListingTranslation } from './entities/job-listing-translation.entity';
import { JobListing } from './entities/job-listing.entity';
import { isJobListingTranslationStale, type JobListingTranslationSourceRow } from './job-listing-translation-hash';
import { serveRichDoc } from '../../common/rich-text-field';

// Một view DUY NHẤT (khác job-listings.mapper.ts's public/sender/moderator/admin ba-bốn view) —
// bản dịch không có thông tin nhạy cảm nào cần ẩn khác nhau giữa chủ tin và moderator; chủ tin và
// moderator thấy CÙNG hình dạng. `parent` (job_listings hiện tại) TÙY CHỌN — chỉ cần để tính
// is_stale/is_published_stale; bỏ qua ở những nơi không cần.
//
// PHÂN BIỆT RÕ (owner yêu cầu, Gói C sửa 17/10/2026):
//   - `has_published`: có bản dịch đã được duyệt BAO GIỜ CHƯA (bất kể bản nháp hiện tại đang ở
//     trạng thái gì) — "có bản dịch đã duyệt".
//   - `is_published_stale`: bản ĐÃ DUYỆT đó có còn khớp dữ kiện tiếng Việt HIỆN TẠI không — "bản
//     dịch khớp phiên bản hiện tại". MỘT bản dịch có thể `has_published=true` NHƯNG
//     `is_published_stale=true` (đã duyệt, nhưng dữ kiện đổi sau đó) — hai khái niệm khác nhau,
//     không gộp lại thành một cờ.
//   - `is_stale`: bản NHÁP đang soạn (có thể khác bản đã duyệt) có khớp dữ kiện hiện tại không —
//     phục vụ editor của chủ tin trong lúc soạn, KHÔNG liên quan gì tới cái đang công khai.
export function toJobListingTranslationView(row: JobListingTranslation, parent?: JobListingTranslationSourceRow) {
  const hasPublished = row.publishedTitle != null;
  return {
    id: row.id,
    job_listing_id: row.jobListingId,
    locale: row.locale,
    title: row.title,
    description: row.description,
    // Gói D — `serveRichDoc()` chỉ trả rich khi hash còn khớp bản plain NHÁP hiện tại (cơ chế đóng
    // rủi ro rollback, xem apps/api/src/common/rich-text-field.ts). View này LUÔN là vùng NHÁP —
    // bản ĐÃ DUYỆT (published*) không nằm trong view chung này, xem JobListingsService.getPublicById().
    description_rich: serveRichDoc(row.description, row.descriptionRich, row.descriptionRichHash),
    requirements: row.requirements,
    benefits: row.benefits,
    status: row.status,
    review_note: row.reviewNote,
    reviewed_at: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    has_published: hasPublished,
    published_at: row.publishedAt ? row.publishedAt.toISOString() : null,
    content_version: row.contentVersion,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    is_stale: parent ? isJobListingTranslationStale(row.sourceContentHash, parent) : null,
    is_published_stale:
      parent && hasPublished && row.publishedSourceContentHash
        ? isJobListingTranslationStale(row.publishedSourceContentHash, parent)
        : null,
  };
}

// Hàng chờ duyệt: thêm ĐỦ ngữ cảnh tin GỐC tiếng Việt (tiêu đề/đơn vị + CẢ BA trường dịch được) —
// `title`/`description`/... của view trên là bản NHÁP ĐANG CHỜ DUYỆT (tiếng Anh); moderator cần
// thấy ĐỦ bản nguồn để đối chiếu chất lượng dịch (owner: "xem bản nguồn và bản dịch cạnh nhau"),
// không chỉ tiêu đề.
export function toJobListingTranslationModeratorView(
  row: JobListingTranslation,
  parent: JobListingTranslationSourceRow & Pick<JobListing, 'descriptionRich' | 'descriptionRichHash'>,
) {
  return {
    ...toJobListingTranslationView(row, parent),
    source_title: parent.title,
    source_employer_name: parent.employerName,
    source_description: parent.description,
    // Gói D — cho moderator (và owner's "xem trước") thấy ĐÚNG định dạng nguồn khi đối chiếu, cùng
    // renderer với public (RichDescriptionRenderer) — null nếu tin nguồn chưa dùng rich text HOẶC
    // vừa phát hiện lệch hash (cùng cơ chế chống rollback, không phải một đường đọc riêng bỏ qua nó).
    source_description_rich: serveRichDoc(parent.description, parent.descriptionRich, parent.descriptionRichHash),
    source_requirements: parent.requirements,
    source_benefits: parent.benefits,
  };
}
