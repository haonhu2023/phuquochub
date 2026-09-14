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

// Khớp PlaceEditProposalStatus thật ở backend (place-edit-proposals.enums.ts) — không suy diễn
// thêm trạng thái nào ở tầng web.
export const PLACE_EDIT_PROPOSAL_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'needs_changes',
  'conflict',
] as const;
export type PlaceEditProposalStatus = (typeof PLACE_EDIT_PROPOSAL_STATUSES)[number];

// Khớp CHÍNH XÁC shape của toMyPlaceEditProposalView() (apps/api .../place-edit-proposals.mapper.ts)
// — KHÔNG có proposer_id/reviewer_id (mapper phía backend đã bỏ, không phải web tự lọc). Đây là
// dữ liệu CỦA CHÍNH người dùng đang đăng nhập (GET /place-edit-proposals/mine, tự lọc theo JWT).
export interface MyPlaceEditProposal {
  id: string;
  place_id: string;
  place_name: string | null;
  place_slug: string | null;
  field_key: PlaceEditProposalFieldKey;
  locale_code: string | null;
  proposed_value: unknown;
  reason: string;
  source_url: string | null;
  status: PlaceEditProposalStatus;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}
