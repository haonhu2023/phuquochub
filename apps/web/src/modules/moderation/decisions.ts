import type { MediaStatus, ModerationTargetPreview } from './types';
import { DECISION_LABELS, labelOf } from './labels';

// Controlled Media Rejection Reason (2026-08-12). Re-export duy nhất từ nguồn canonical
// (modules/media) — decisions.ts/ModerationDecisionForm không tự định nghĩa taxonomy/nhãn riêng.
export {
  MEDIA_MODERATION_REASON_CODES,
  mediaModerationReasonCodeLabel,
  type MediaModerationReasonCode,
} from '@/modules/media/moderationReasonCodes';

// Suy ra CHÍNH XÁC các quyết định hợp lệ từ target_type + trạng thái nội dung hiện tại — phản chiếu
// FSM backend (media-moderation.transition.ts / review-moderation.transition.ts). M6 chỉ hiển thị
// các quyết định NỘI DUNG (approve/reject/hide/restore); `dismiss` (cấp case) do backend hỗ trợ
// nhưng KHÔNG surface ở M6 theo Phase 6 (ghi rõ ở báo cáo). "No invalid actions rendered": UI chỉ
// render đúng những gì hàm này trả về; backend vẫn là nơi cưỡng chế cuối cùng.

// M6 surface 4 quyết định nội dung; loại 'dismiss' khỏi bề mặt UI milestone này.
export type ContentDecision = 'approve' | 'reject' | 'hide' | 'restore';

export interface DecisionOption {
  decision: ContentDecision;
  label: string;
  /** reject|hide bắt buộc lý do (INV-11). */
  requiresReason: boolean;
  /** restore media bắt buộc chọn target_status (published|pending) — INV-10. */
  requiresMediaTargetStatus: boolean;
  /**
   * `reject` trên media bắt buộc chọn `reason_code` (Controlled Media Rejection Reason,
   * 2026-08-12) — mã lý do CÓ KIỂM SOÁT sẽ hiện cho chủ cơ sở, khác hẳn ô "Lý do" tự do bên cạnh
   * (thuần nội bộ). KHÔNG áp dụng cho `hide`/`approve`/`restore` — backend từ chối 422 nếu gửi kèm.
   */
  requiresReasonCode: boolean;
  /** Gợi ý sắc thái nút (approve/restore = tích cực; reject/hide = gỡ nội dung). */
  tone: 'approve' | 'remove';
}

// Đích restore hợp lệ của media (chỉ hai giá trị này — FSM backend từ chối phần còn lại).
export const MEDIA_RESTORE_TARGETS: ReadonlyArray<{ value: MediaStatus; label: string }> = [
  { value: 'published', label: 'Công khai ngay' },
  { value: 'pending', label: 'Đưa lại hàng chờ duyệt' },
];

function makeOption(decision: ContentDecision, targetType: 'media' | 'review'): DecisionOption {
  return {
    decision,
    label: labelOf(DECISION_LABELS, decision),
    requiresReason: decision === 'reject' || decision === 'hide',
    requiresMediaTargetStatus: targetType === 'media' && decision === 'restore',
    requiresReasonCode: targetType === 'media' && decision === 'reject',
    tone: decision === 'approve' || decision === 'restore' ? 'approve' : 'remove',
  };
}

/**
 * Danh sách quyết định hợp lệ cho một case. Rỗng khi: case đã xử lý (không phải open/claimed),
 * target không còn tồn tại (found=false), target_type=place (không có FSM), hoặc trạng thái nội
 * dung không cho phép hành động nào.
 */
export function allowedDecisions(
  preview: ModerationTargetPreview,
  caseStatus: string,
): DecisionOption[] {
  if (caseStatus !== 'open' && caseStatus !== 'claimed') return [];
  if (!preview.found) return [];

  if (preview.target_type === 'media') {
    switch (preview.status) {
      case 'pending':
        return [makeOption('approve', 'media'), makeOption('reject', 'media')];
      case 'published':
        return [makeOption('hide', 'media')];
      case 'hidden':
      case 'rejected':
        return [makeOption('restore', 'media')];
      default:
        return [];
    }
  }

  if (preview.target_type === 'review') {
    switch (preview.status) {
      case 'pending':
        return [makeOption('approve', 'review')];
      case 'published':
        return [makeOption('hide', 'review')];
      case 'hidden':
        return [makeOption('restore', 'review')];
      default:
        return [];
    }
  }

  return [];
}
