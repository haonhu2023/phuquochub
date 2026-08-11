import type { BusinessClaimReasonCodeValue, BusinessClaimStatusValue } from './types';

// Nhãn trạng thái claim cho UI "Yêu cầu xác nhận quyền quản lý của tôi" — CÙNG năm giá trị
// ClaimStatus thật ở backend (business.enums.ts), không suy diễn thêm trạng thái nào.
export const CLAIM_STATUS_LABELS: Record<BusinessClaimStatusValue, string> = {
  pending: 'Đang chờ xét duyệt',
  approved: 'Đã được xác nhận',
  rejected: 'Bị từ chối',
  disputed: 'Đang tranh chấp',
  withdrawn: 'Đã rút',
};

export function claimStatusLabel(status: BusinessClaimStatusValue): string {
  return CLAIM_STATUS_LABELS[status] ?? status;
}

// Nhãn lý do từ chối — CÙNG năm giá trị ClaimReasonCode thật (business.enums.ts).
export const CLAIM_REASON_CODE_LABELS: Record<BusinessClaimReasonCodeValue, string> = {
  insufficient_evidence: 'Bằng chứng chưa đủ thuyết phục',
  duplicate: 'Trùng với một yêu cầu khác',
  fraud: 'Nghi ngờ gian lận',
  wrong_target: 'Không đúng địa điểm',
  other: 'Lý do khác',
};

export function claimReasonCodeLabel(reasonCode: BusinessClaimReasonCodeValue): string {
  return CLAIM_REASON_CODE_LABELS[reasonCode] ?? reasonCode;
}
