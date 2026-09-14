import type { PlaceEditProposalStatus } from './types';

// Nhãn trạng thái cho UI "Đề xuất chỉnh sửa của tôi" — cùng khuôn claimStatusLabels.ts
// (business-claims). Đúng năm giá trị PlaceEditProposalStatus thật ở backend
// (place-edit-proposals.enums.ts), không suy diễn thêm trạng thái nào.
export const PLACE_EDIT_PROPOSAL_STATUS_LABELS: Record<PlaceEditProposalStatus, string> = {
  pending: 'Đang chờ xem xét',
  approved: 'Đã áp dụng',
  rejected: 'Bị từ chối',
  needs_changes: 'Cần bổ sung',
  conflict: 'Xung đột dữ liệu',
};

export function placeEditProposalStatusLabel(status: PlaceEditProposalStatus): string {
  return PLACE_EDIT_PROPOSAL_STATUS_LABELS[status] ?? status;
}
