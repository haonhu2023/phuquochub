import { UnprocessableEntityException } from '@nestjs/common';
import { VerificationStatus } from '../places/place.enums';

// Máy trạng thái THUẦN cho `verifications.status` (ADR-008, verification.md §3.2) — không phụ
// thuộc DB, cùng khuôn `business-claim.transition.ts`. Service (VerificationsService) gọi hàm này
// để lấy status đích, KHÔNG tự suy luận transition ở nơi khác.
//
// verification.md §3.2 (bảng chính thức — ưu tiên hơn sơ đồ ASCII §3 khi hai thứ không khớp nhau,
// vd cạnh "expired -> rejected" chỉ xuất hiện mơ hồ trong sơ đồ, KHÔNG có trong bảng §3.2; bỏ qua,
// dùng bảng):
//   (chưa tồn tại), expired, rejected --submit--> pending
//   pending, community_verified --verify--> verified          (Moderator)
//   pending, verified, community_verified --official--> official   (Moderator, + source_id bắt buộc)
//   pending --communityVerify--> community_verified            (hệ thống, đủ ngưỡng phiếu)
//   pending, verified, official, community_verified --reject--> rejected  (Moderator, + reason_code)
//   verified, official, community_verified --expire--> expired  (job hệ thống)
// `pending`/`expired`/`rejected` không có "verify"/"official" trực tiếp từ chưa-tồn-tại — `submit`
// là bước RIÊNG (tạo dòng mới HOẶC gửi lại dòng đã có).
export type VerificationTransitionAction =
  | 'submit'
  | 'verify'
  | 'official'
  | 'communityVerify'
  | 'reject'
  | 'expire';

const STATUS_LABEL_VI: Record<VerificationStatus, string> = {
  [VerificationStatus.PENDING]: 'đang chờ xác minh',
  [VerificationStatus.VERIFIED]: 'đã xác minh',
  [VerificationStatus.OFFICIAL]: 'chính thức',
  [VerificationStatus.COMMUNITY_VERIFIED]: 'cộng đồng xác nhận',
  [VerificationStatus.EXPIRED]: 'đã hết hạn',
  [VerificationStatus.REJECTED]: 'đã bị bác',
};

const ACTION_LABEL_VI: Record<VerificationTransitionAction, string> = {
  submit: 'gửi (xác minh)',
  verify: 'xác minh',
  official: 'đặt chính thức',
  communityVerify: 'cộng đồng xác nhận',
  reject: 'bác',
  expire: 'hết hạn',
};

/**
 * Xác nhận transition verification hợp lệ, trả về status đích. Ném `UnprocessableEntityException`
 * nếu không hợp lệ. `current = null` chỉ hợp lệ cho action `submit` (chưa từng có dòng — tạo mới).
 */
export function assertValidVerificationTransition(
  current: VerificationStatus | null,
  action: VerificationTransitionAction,
): VerificationStatus {
  switch (action) {
    case 'submit':
      if (
        current !== null &&
        current !== VerificationStatus.EXPIRED &&
        current !== VerificationStatus.REJECTED
      ) {
        throw invalidTransition(current, action);
      }
      return VerificationStatus.PENDING;

    case 'verify':
      if (current !== VerificationStatus.PENDING && current !== VerificationStatus.COMMUNITY_VERIFIED) {
        throw invalidTransition(current, action);
      }
      return VerificationStatus.VERIFIED;

    case 'official':
      if (
        current !== VerificationStatus.PENDING &&
        current !== VerificationStatus.VERIFIED &&
        current !== VerificationStatus.COMMUNITY_VERIFIED
      ) {
        throw invalidTransition(current, action);
      }
      return VerificationStatus.OFFICIAL;

    case 'communityVerify':
      if (current !== VerificationStatus.PENDING) {
        throw invalidTransition(current, action);
      }
      return VerificationStatus.COMMUNITY_VERIFIED;

    case 'reject':
      if (
        current !== VerificationStatus.PENDING &&
        current !== VerificationStatus.VERIFIED &&
        current !== VerificationStatus.OFFICIAL &&
        current !== VerificationStatus.COMMUNITY_VERIFIED
      ) {
        throw invalidTransition(current, action);
      }
      return VerificationStatus.REJECTED;

    case 'expire':
      if (
        current !== VerificationStatus.VERIFIED &&
        current !== VerificationStatus.OFFICIAL &&
        current !== VerificationStatus.COMMUNITY_VERIFIED
      ) {
        throw invalidTransition(current, action);
      }
      return VerificationStatus.EXPIRED;
  }
}

/** Trạng thái "tin cậy" — cache `verifiedAt` chỉ cập nhật khi ĐẾN một trong ba trạng thái này. */
export function isTrustedStatus(status: VerificationStatus): boolean {
  return (
    status === VerificationStatus.VERIFIED ||
    status === VerificationStatus.OFFICIAL ||
    status === VerificationStatus.COMMUNITY_VERIFIED
  );
}

function invalidTransition(
  current: VerificationStatus | null,
  action: VerificationTransitionAction,
): UnprocessableEntityException {
  const currentLabel = current === null ? 'chưa tồn tại' : STATUS_LABEL_VI[current];
  return new UnprocessableEntityException(
    `Không thể ${ACTION_LABEL_VI[action]} verification: verification ${currentLabel}.`,
  );
}
