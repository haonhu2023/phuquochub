import { UnprocessableEntityException } from '@nestjs/common';
import { MediaStatus } from '../media/media.enums';

// Máy trạng thái NỘI DUNG media (ADR-018 D5, moderation-design.md §2.1) — module thuần, không phụ
// thuộc DB, theo đúng khuôn booking-status.transition.ts. Đây là FSM cho media.status (bài toán
// "công chúng có thấy được không?" — INV-1), KHÔNG phải máy trạng thái moderation_cases.status
// (bài toán "moderator còn nợ quyết định không?" — M2+). `dismiss` (§2.1: "không đổi status") vì
// vậy KHÔNG xuất hiện ở đây.
//
// restore LUÔN đòi targetStatus tường minh (INV-10) — không đoán, không mặc định: một media bị
// rejected được khôi phục có thể là "đăng nó lên" (published) hoặc "đưa lại hàng chờ" (pending),
// hai ý định khác nhau hoàn toàn, đoán sai xác suất 50%.
export type MediaTransitionAction = 'approve' | 'reject' | 'hide' | 'restore';

const RESTORE_TARGETS = new Set<MediaStatus>([MediaStatus.PUBLISHED, MediaStatus.PENDING]);

const STATUS_LABEL_VI: Record<MediaStatus, string> = {
  [MediaStatus.PENDING]: 'đang chờ duyệt',
  [MediaStatus.PUBLISHED]: 'đã công khai',
  [MediaStatus.HIDDEN]: 'đã bị ẩn',
  [MediaStatus.REJECTED]: 'đã bị từ chối',
};

const ACTION_LABEL_VI: Record<MediaTransitionAction, string> = {
  approve: 'duyệt',
  reject: 'từ chối',
  hide: 'ẩn',
  restore: 'khôi phục',
};

/**
 * Xác nhận transition media hợp lệ, trả về status đích. Ném `UnprocessableEntityException` nếu
 * không hợp lệ — caller (service, M3/M4) dùng giá trị trả về để update, không tự suy luận lại
 * target status ở nơi khác (một nguồn sự thật duy nhất cho FSM, cùng nguyên tắc
 * booking-status.transition.ts).
 *
 * `targetStatus`: BẮT BUỘC khi `action === 'restore'` (INV-10); bị bỏ qua ở mọi action khác (giá
 * trị đích của approve/reject/hide đã cố định, không có gì để chọn).
 */
export function assertValidMediaTransition(
  current: MediaStatus,
  action: MediaTransitionAction,
  targetStatus?: MediaStatus,
): MediaStatus {
  switch (action) {
    case 'approve':
      if (current !== MediaStatus.PENDING) {
        throw invalidTransition(current, action);
      }
      return MediaStatus.PUBLISHED;

    case 'reject':
      if (current !== MediaStatus.PENDING) {
        throw invalidTransition(current, action);
      }
      return MediaStatus.REJECTED;

    case 'hide':
      if (current !== MediaStatus.PUBLISHED) {
        throw invalidTransition(current, action);
      }
      return MediaStatus.HIDDEN;

    case 'restore':
      if (current !== MediaStatus.HIDDEN && current !== MediaStatus.REJECTED) {
        throw invalidTransition(current, action);
      }
      if (!targetStatus) {
        throw new UnprocessableEntityException(
          'Khôi phục media phải chỉ định rõ target_status (published hoặc pending) — không tự suy luận.',
        );
      }
      if (!RESTORE_TARGETS.has(targetStatus)) {
        throw new UnprocessableEntityException(
          `target_status "${targetStatus}" không hợp lệ khi khôi phục media (chỉ published hoặc pending).`,
        );
      }
      return targetStatus;
  }
}

function invalidTransition(current: MediaStatus, action: MediaTransitionAction): UnprocessableEntityException {
  return new UnprocessableEntityException(
    `Không thể ${ACTION_LABEL_VI[action]} media: media ${STATUS_LABEL_VI[current]}.`,
  );
}
