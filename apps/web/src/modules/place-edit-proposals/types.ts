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
