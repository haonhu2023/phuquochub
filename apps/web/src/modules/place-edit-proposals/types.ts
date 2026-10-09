import type { OpeningHours } from '@phuquochub/shared-types';

// Khớp CreatePlaceEditProposalDto/PlaceEditProposalFieldKey (apps/api/src/modules/place-edit-proposals).
// MVP CHỈ 3 field — không thêm field nào khác ở web nếu backend chưa hỗ trợ.
export const PLACE_EDIT_PROPOSAL_FIELD_KEYS = ['opening_hours', 'address', 'short_description'] as const;
export type PlaceEditProposalFieldKey = (typeof PLACE_EDIT_PROPOSAL_FIELD_KEYS)[number];

export const PLACE_EDIT_PROPOSAL_FIELD_LABELS: Record<PlaceEditProposalFieldKey, string> = {
  opening_hours: 'Giờ mở cửa',
  address: 'Địa chỉ',
  short_description: 'Mô tả ngắn',
};

// proposed_value theo field_key: chuỗi cho address/short_description, object OpeningHours cho
// opening_hours — CHÍNH XÁC khớp shape mà PlaceEditProposalsService validate (không tự bịa thêm
// biến thể nào ở tầng web).
export type PlaceEditProposalValue<K extends PlaceEditProposalFieldKey> = K extends 'opening_hours'
  ? OpeningHours
  : string;

export interface CreatePlaceEditProposalInput<K extends PlaceEditProposalFieldKey = PlaceEditProposalFieldKey> {
  field_key: K;
  proposed_value: PlaceEditProposalValue<K>;
  reason: string;
  source_url?: string;
}

// Phía duyệt (PlaceEditProposal.Moderate) — khớp toPlaceEditProposalView() (mapper.ts), snake_case
// nguyên trạng, KHÔNG có base_value_hash/currentValue (API cố tình không lộ — xem mapper's own
// comment "không lộ nội dung chưa duyệt công khai" áp dụng luôn cho việc không lộ cơ chế conflict-
// detect nội bộ). Trang duyệt phải tự gọi previewPlace() lấy giá trị HIỆN TẠI để so sánh.
export const PLACE_EDIT_PROPOSAL_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'needs_changes',
  'conflict',
] as const;
export type PlaceEditProposalStatus = (typeof PLACE_EDIT_PROPOSAL_STATUSES)[number];

export const PLACE_EDIT_PROPOSAL_STATUS_LABELS: Record<PlaceEditProposalStatus, string> = {
  pending: 'Đang chờ',
  approved: 'Đã áp dụng',
  rejected: 'Đã từ chối',
  needs_changes: 'Cần bổ sung',
  conflict: 'Xung đột — dữ liệu gốc đã đổi',
};

export type PlaceEditProposalDecision = 'approve' | 'reject' | 'needs_changes';

// "Ảnh góp ý qua media moderation" — một ảnh BẰNG CHỨNG đính kèm, LUÔN qua hàng chờ kiểm duyệt
// chung (không tự công khai). `url` khác nhau theo đối tượng xem (API tự chọn đúng kênh — xem
// PlaceEditProposalsService.photosFor()): moderator qua `/media/{id}/moderation-file`, người gửi
// qua `/place-edit-proposals/{id}/media/{mediaId}/file` — cả hai cần Bearer, không gắn thẳng vào
// <img src>, phải qua useAuthenticatedImage.
export interface PlaceEditProposalPhoto {
  id: string;
  status: string;
  created_at: string;
  url: string;
}

export interface PlaceEditProposalView {
  id: string;
  place_id: string;
  field_key: PlaceEditProposalFieldKey;
  locale_code: string | null;
  proposed_value: unknown;
  reason: string;
  source_url: string | null;
  status: PlaceEditProposalStatus;
  proposer_id: string;
  reviewer_id: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  sender_message: string | null;
  photos: PlaceEditProposalPhoto[];
  created_at: string;
  updated_at: string;
}

export interface DecidePlaceEditProposalInput {
  decision: PlaceEditProposalDecision;
  note?: string;
  // Khác HẲN `note` (→ review_note, nội bộ) — trường này người gửi ĐỌC ĐƯỢC (xem
  // toPlaceEditProposalSenderView() ở backend). Tuỳ chọn, admin không bắt buộc phải viết.
  sender_message?: string;
}

// "Góp ý của tôi" (người gửi): khớp PlaceEditProposalsService.listMine/getMine — KHÔNG có reviewer_id,
// review_note (ghi chú nội bộ). `sender_message` LÀ "phản hồi public" người gửi được đọc — khác
// hẳn review_note, mục V đợt 2: "Tách phản hồi public khỏi note nội bộ".
export interface PlaceEditProposalSenderView {
  id: string;
  place_id: string;
  field_key: PlaceEditProposalFieldKey;
  locale_code: string | null;
  proposed_value: unknown;
  reason: string;
  source_url: string | null;
  status: PlaceEditProposalStatus;
  sender_message: string | null;
  photos: PlaceEditProposalPhoto[];
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}
