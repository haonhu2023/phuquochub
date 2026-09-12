// "Báo thông tin sai" (POST /places/:id/report) — cùng envelope report mà moderation module đã
// định nghĩa (apps/api/src/modules/moderation/dto/moderation.dto.ts: CreateReportDto), KHÔNG một
// enum report_reason riêng cho place: thêm giá trị enum mới cần migration (ALTER TYPE), và
// misinformation/other đã đủ diễn đạt "thông tin sai" ở tầng API. Form CHỈ hiển thị một tập con có
// nghĩa với một place (không cho chọn spam/offensive/copyright/personal_info — những lý do đó
// không áp dụng cho "địa điểm có thông tin sai"), nhưng gửi đúng giá trị enum thật của backend.
export const PLACE_REPORT_REASONS = ['misinformation', 'other'] as const;
export type PlaceReportReason = (typeof PLACE_REPORT_REASONS)[number];

export const PLACE_REPORT_REASON_LABELS: Record<PlaceReportReason, string> = {
  misinformation: 'Thông tin không chính xác (giờ mở cửa, địa chỉ, giá, liên hệ…)',
  other: 'Khác',
};

export interface CreatePlaceReportInput {
  reason: PlaceReportReason;
  description?: string;
}
