import { UnprocessableEntityException } from '@nestjs/common';
import { ReviewStatus } from '../reviews/review.enums';

// Máy trạng thái NỘI DUNG review (ADR-018 D5, moderation-design.md §3) — module thuần, không phụ
// thuộc DB, cùng khuôn media-moderation.transition.ts/booking-status.transition.ts.
//
// KHÔNG thêm `rejected` vào review_status (D5) — không tới được khi review vẫn auto-publish (O1),
// và một giá trị enum không bao giờ dùng tới sẽ vĩnh viễn là giá trị chết. `approve` (pending ->
// published) hiện KHÔNG tới được qua API (ReviewsRepository.create() ghi thẳng published) nhưng
// vẫn định nghĩa để bảo toàn tính đầy đủ dữ liệu cho dòng cũ/chèn tay.
//
// Khác media: review chỉ có MỘT đích restore hợp lệ (published) — không có gì để đoán, nên
// targetStatus là TUỲ CHỌN; nếu caller gửi giá trị khác published thì 422 (đưa review về pending
// mâu thuẫn trực tiếp với O1), KHÔNG âm thầm bỏ qua.
export type ReviewTransitionAction = 'hide' | 'restore' | 'approve';

const STATUS_LABEL_VI: Record<ReviewStatus, string> = {
  [ReviewStatus.PENDING]: 'đang chờ duyệt',
  [ReviewStatus.PUBLISHED]: 'đã công khai',
  [ReviewStatus.HIDDEN]: 'đã bị ẩn',
};

const ACTION_LABEL_VI: Record<ReviewTransitionAction, string> = {
  hide: 'ẩn',
  restore: 'khôi phục',
  approve: 'duyệt',
};

/**
 * Xác nhận transition review hợp lệ, trả về status đích. Ném `UnprocessableEntityException` nếu
 * không hợp lệ. **Mọi transition trả về từ hàm này bắt buộc được ghi trong cùng transaction với
 * `PlacesRepository.recalculateRating()` bởi caller** (INV-4) — hàm này chỉ xác nhận FSM, không tự
 * gọi recalculate (tách trách nhiệm, cùng nguyên tắc booking-status.transition.ts không tự
 * update DB).
 */
export function assertValidReviewTransition(
  current: ReviewStatus,
  action: ReviewTransitionAction,
  targetStatus?: ReviewStatus,
): ReviewStatus {
  switch (action) {
    case 'hide':
      if (current !== ReviewStatus.PUBLISHED) {
        throw invalidTransition(current, action);
      }
      return ReviewStatus.HIDDEN;

    case 'restore':
      if (current !== ReviewStatus.HIDDEN) {
        throw invalidTransition(current, action);
      }
      if (targetStatus !== undefined && targetStatus !== ReviewStatus.PUBLISHED) {
        throw new UnprocessableEntityException(
          `target_status "${targetStatus}" không hợp lệ khi khôi phục review (chỉ published).`,
        );
      }
      return ReviewStatus.PUBLISHED;

    case 'approve':
      if (current !== ReviewStatus.PENDING) {
        throw invalidTransition(current, action);
      }
      return ReviewStatus.PUBLISHED;
  }
}

function invalidTransition(current: ReviewStatus, action: ReviewTransitionAction): UnprocessableEntityException {
  return new UnprocessableEntityException(
    `Không thể ${ACTION_LABEL_VI[action]} review: review ${STATUS_LABEL_VI[current]}.`,
  );
}
