// Kiểu FE cho Human Translation Review (human-translation-review, 2026-09-04). Wire format là
// snake_case (khớp PlaceTranslationsRepository.ReviewQueueRow ở BE — không có type nào cho việc
// này trong @phuquochub/shared-types nên dùng module type FE cục bộ này, cùng quy ước với
// modules/moderation/types.ts).

export const REVIEWABLE_HUMAN_REVIEW_STATUSES = ['PENDING', 'NEEDS_CHANGES'] as const;
export type ReviewableHumanReviewStatus = (typeof REVIEWABLE_HUMAN_REVIEW_STATUSES)[number];

export const TRANSLATION_REVIEW_DECISIONS = ['APPROVED', 'REJECTED', 'NEEDS_CHANGES'] as const;
export type TranslationReviewDecision = (typeof TRANSLATION_REVIEW_DECISIONS)[number];

// PHẢI khớp REVIEW_NOTES_MAX_LENGTH ở BE (translation-review.service.ts) — giới hạn chọn để luôn
// vừa trong wiki_revisions.change_note (varchar(300)) kèm phần tiền tố quyết định + actorId.
export const REVIEW_NOTES_MAX_LENGTH = 200;

// notes bắt buộc cho REJECTED/NEEDS_CHANGES, tuỳ chọn cho APPROVED — khớp chính sách ở BE
// (TranslationReviewService.reviewTranslation()). Validate ở đây CHỈ để UX tốt hơn (thông báo rõ
// trước khi gửi); BE vẫn là nơi thực thi cuối cùng.
export function notesRequiredFor(decision: TranslationReviewDecision): boolean {
  return decision !== 'APPROVED';
}

// GET /admin/place-translations/review-queue — một hàng đã được BE làm giàu sẵn (tên/slug địa
// điểm, văn bản đang công khai để so sánh, nguồn) để FE không phải gọi thêm request nào cho mỗi
// hàng (xem comment listReviewQueue() ở BE).
export interface TranslationReviewQueueItem {
  id: string;
  place_id: string;
  place_name: string;
  place_slug: string;
  field_key: string;
  locale_code: string;
  source_locale_code: string;
  translated_text: string;
  /** Văn bản ĐANG công khai cho đúng (place, field, locale) này — null nếu chưa từng công khai. */
  current_public_text: string | null;
  translation_method: string;
  translation_status: string;
  human_review_status: string;
  quality_gate: string;
  revision_id: string;
  created_at: string;
  source_id: string | null;
  source_url: string | null;
  source_title: string | null;
  source_type: string | null;
  source_reliability: number | null;
}

export interface ListReviewQueueParams {
  placeId?: string;
  placeSlug?: string;
  localeCode?: string;
  fieldKey?: string;
  limit?: number;
  /** Từ `nextCursor` của trang trước — bỏ trống để lấy trang đầu. */
  cursor?: string;
}

// Khớp ReviewQueuePageResult ở BE — data là { rows, nextCursor }, không phải mảng trần (phân
// trang keyset, 2026-09-04 scale-up).
export interface ReviewQueueApiPage {
  rows: TranslationReviewQueueItem[];
  nextCursor: string | null;
}

// POST /admin/place-translations/{id}/review — ĐÚNG hai trường (khớp ReviewPlaceTranslationDto ở
// BE). KHÔNG BAO GIỜ thêm reviewer_id/reviewed_at/is_public/production_eligible — danh tính người
// duyệt & mọi cờ xuất bản đều do BE tự suy ra từ phiên đăng nhập, không bao giờ tin từ client.
export interface ReviewTranslationRequest {
  decision: TranslationReviewDecision;
  notes?: string;
}
