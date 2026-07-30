import { UnprocessableEntityException } from '@nestjs/common';
import { BookingStatus } from './booking.enums';

// Booking Application Layer (Phase 2) — validation nghiệp vụ TÁCH KHỎI controller (và khỏi
// BookingsService's orchestration) để có thể unit-test độc lập, không cần dựng service/DB.
//
// FSM có chủ đích tối giản — chỉ 3 hành động được phép (cancel/confirm/mark-expired), KHÔNG có
// update tuỳ ý toàn bộ entity:
//   pending    -> confirmed  (confirm)
//   pending    -> cancelled  (cancel)
//   pending    -> expired    (markExpired)
//   confirmed  -> cancelled  (cancel)
//   confirmed  -> confirmed  KHÔNG hợp lệ (đã confirmed)
//   confirmed  -> expired    KHÔNG hợp lệ — "expired" chỉ áp dụng cho yêu cầu CHƯA được xác nhận
//                            trong cửa sổ thời gian cho phép; một booking đã confirmed cần
//                            cancel, không phải expire.
//   cancelled  -> bất kỳ     KHÔNG hợp lệ (trạng thái cuối)
//   expired    -> bất kỳ     KHÔNG hợp lệ (trạng thái cuối)
export type BookingTransitionAction = 'confirm' | 'cancel' | 'markExpired';

const ALLOWED_TRANSITIONS: Record<BookingTransitionAction, { from: BookingStatus; to: BookingStatus }> = {
  confirm: { from: BookingStatus.PENDING, to: BookingStatus.CONFIRMED },
  cancel: { from: BookingStatus.PENDING, to: BookingStatus.CANCELLED }, // xem assertValidTransition cho nhánh confirmed->cancelled
  markExpired: { from: BookingStatus.PENDING, to: BookingStatus.EXPIRED },
};

const STATUS_LABEL_VI: Record<BookingStatus, string> = {
  [BookingStatus.PENDING]: 'đang chờ',
  [BookingStatus.CONFIRMED]: 'đã confirmed',
  [BookingStatus.CANCELLED]: 'đã cancel',
  [BookingStatus.EXPIRED]: 'đã expired',
};

/**
 * Ném UnprocessableEntityException nếu `action` không hợp lệ từ `current`. Trả về status đích
 * (`BookingStatus`) nếu hợp lệ — caller (BookingsService) dùng giá trị này để update, không tự
 * suy luận lại target status ở nơi khác (một nguồn sự thật duy nhất cho FSM).
 */
export function assertValidTransition(current: BookingStatus, action: BookingTransitionAction): BookingStatus {
  // Nhánh riêng: cancel hợp lệ từ CẢ pending LẪN confirmed (bảng ALLOWED_TRANSITIONS ở trên chỉ
  // khai báo pending->cancelled làm hợp lệ tối thiểu; confirmed->cancelled cũng hợp lệ theo yêu
  // cầu nghiệp vụ — khách/staff có thể huỷ một booking đã xác nhận).
  if (action === 'cancel' && current === BookingStatus.CONFIRMED) {
    return BookingStatus.CANCELLED;
  }

  const rule = ALLOWED_TRANSITIONS[action];
  if (current !== rule.from) {
    throw new UnprocessableEntityException(
      `Không thể ${actionLabel(action)}: booking ${STATUS_LABEL_VI[current]}`,
    );
  }
  return rule.to;
}

function actionLabel(action: BookingTransitionAction): string {
  switch (action) {
    case 'confirm':
      return 'confirm';
    case 'cancel':
      return 'cancel';
    case 'markExpired':
      return 'đánh dấu expired';
  }
}
