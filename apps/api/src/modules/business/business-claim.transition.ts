import { UnprocessableEntityException } from '@nestjs/common';
import { ClaimStatus } from './business.enums';

// Máy trạng thái THUẦN cho `business_claims.status` (ADR-015 §4, business.md §4 sơ đồ) — không phụ
// thuộc DB, cùng khuôn `media-moderation.transition.ts`/`booking-status.transition.ts`. Service
// (BusinessClaimsService) gọi hàm này để lấy status đích, KHÔNG tự suy luận transition ở nơi khác.
//
// Sơ đồ business.md §4:
//   (chưa có claim) --submit--> pending
//   pending --Moderator approve, không có owner hiệu lực--> approved
//   pending --Moderator approve, ĐÃ có owner hiệu lực--> disputed  (hệ thống tự chuyển, KHÔNG phải
//     một lựa chọn thủ công riêng của moderator — action `dispute` mô hình hoá đúng nhánh này)
//   pending --Moderator reject--> rejected
//   pending --requester rút trước khi duyệt--> withdrawn
//   disputed --Moderator/Admin phân xử--> approved | rejected
// `approved`/`rejected`/`withdrawn` là trạng thái CUỐI — không có transition nào đi ra từ đó.
export type ClaimTransitionAction = 'submit' | 'approve' | 'reject' | 'dispute' | 'withdraw';

const STATUS_LABEL_VI: Record<ClaimStatus, string> = {
  [ClaimStatus.PENDING]: 'đang chờ xác minh',
  [ClaimStatus.APPROVED]: 'đã duyệt',
  [ClaimStatus.REJECTED]: 'đã bị từ chối',
  [ClaimStatus.DISPUTED]: 'đang tranh chấp',
  [ClaimStatus.WITHDRAWN]: 'đã bị rút',
};

const ACTION_LABEL_VI: Record<ClaimTransitionAction, string> = {
  submit: 'gửi',
  approve: 'duyệt',
  reject: 'từ chối',
  dispute: 'chuyển tranh chấp',
  withdraw: 'rút',
};

/**
 * Xác nhận transition claim hợp lệ, trả về status đích. Ném `UnprocessableEntityException` nếu
 * không hợp lệ. `current = null` chỉ hợp lệ cho action `submit` (claim chưa tồn tại — tạo mới).
 */
export function assertValidClaimTransition(
  current: ClaimStatus | null,
  action: ClaimTransitionAction,
): ClaimStatus {
  switch (action) {
    case 'submit':
      if (current !== null) {
        throw invalidTransition(current, action);
      }
      return ClaimStatus.PENDING;

    case 'approve':
      if (current !== ClaimStatus.PENDING && current !== ClaimStatus.DISPUTED) {
        throw invalidTransition(current, action);
      }
      return ClaimStatus.APPROVED;

    case 'reject':
      if (current !== ClaimStatus.PENDING && current !== ClaimStatus.DISPUTED) {
        throw invalidTransition(current, action);
      }
      return ClaimStatus.REJECTED;

    case 'dispute':
      if (current !== ClaimStatus.PENDING) {
        throw invalidTransition(current, action);
      }
      return ClaimStatus.DISPUTED;

    case 'withdraw':
      if (current !== ClaimStatus.PENDING) {
        throw invalidTransition(current, action);
      }
      return ClaimStatus.WITHDRAWN;
  }
}

function invalidTransition(current: ClaimStatus | null, action: ClaimTransitionAction): UnprocessableEntityException {
  const currentLabel = current === null ? 'chưa tồn tại' : STATUS_LABEL_VI[current];
  return new UnprocessableEntityException(
    `Không thể ${ACTION_LABEL_VI[action]} claim: claim ${currentLabel}.`,
  );
}
