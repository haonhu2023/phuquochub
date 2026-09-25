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
  created_at: string;
  updated_at: string;
}

export interface DecidePlaceEditProposalInput {
  decision: PlaceEditProposalDecision;
  note?: string;
}
