// Controlled Media Rejection Reason (2026-08-12) — nguồn DUY NHẤT cho taxonomy + nhãn tiếng Việt
// của `MediaModerationReasonCode` (apps/api/src/modules/moderation/moderation.enums.ts). Dùng
// CHUNG bởi cả hai phía của cùng một khái niệm: `modules/moderation` (moderator CHỌN mã khi từ
// chối ảnh) và `modules/place-photos` (chủ cơ sở ĐỌC mã đó dưới dạng nhãn) — một canonical mapping
// duy nhất, tránh lặp lại nhãn độc lập ở hai nơi (cùng nguyên tắc PHASE 8 của Controlled Rejection
// Reasons: BE trả `reason_code` thô, FE tự dịch, không đóng cứng ngôn ngữ hiển thị vào API/CSDL —
// PhuQuocHub dự định song ngữ Việt/Anh).
//
// Giá trị PHẢI khớp CHÍNH XÁC 5 giá trị enum backend — không phát minh thêm/bớt ở đây.
export const MEDIA_MODERATION_REASON_CODES = [
  'inappropriate_content',
  'low_quality',
  'unrelated_to_place',
  'copyright',
  'other',
] as const;

export type MediaModerationReasonCode = (typeof MEDIA_MODERATION_REASON_CODES)[number];

// Nhãn NGẮN GỌN, hướng tới CHỦ CƠ SỞ (đọc để hiểu và sửa ảnh) — dùng lại nguyên văn cho moderator
// picker (không cần hai bộ câu chữ khác nhau cho cùng một khái niệm).
export const MEDIA_MODERATION_REASON_CODE_LABELS: Record<MediaModerationReasonCode, string> = {
  inappropriate_content: 'Nội dung không phù hợp',
  low_quality: 'Chất lượng ảnh không đạt',
  unrelated_to_place: 'Ảnh không liên quan đến địa điểm',
  copyright: 'Vấn đề bản quyền',
  other: 'Lý do khác',
};

/**
 * Nhãn tiếng Việt cho một mã lý do, hoặc `null` nếu không dịch được.
 *
 * KHÁC `labelOf` của modules/moderation/labels.ts (trả về chính key khi thiếu ánh xạ) một cách CỐ
 * Ý: đây là bề mặt CHỦ CƠ SỞ đọc, và một token thô kiểu `low_quality`/`UNRELATED_TO_PLACE` hiện ra
 * giữa giao diện tiếng Việt vừa vô nghĩa với người đọc vừa để lộ tên định danh nội bộ. Backend
 * thêm mã mới mà FE chưa kịp cập nhật -> `null` -> giao diện lùi về thông điệp chung, đúng cùng
 * nhánh đã dùng cho case lịch sử không có mã. Không bao giờ throw, không bao giờ hiện "undefined".
 *
 * Nhận `string | null | undefined` (không chỉ union hẹp) vì giá trị đến TỪ MẠNG — kiểu TypeScript
 * ở biên API là lời hứa, không phải bảo đảm lúc chạy.
 */
export function mediaModerationReasonCodeLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return (MEDIA_MODERATION_REASON_CODE_LABELS as Record<string, string>)[code] ?? null;
}
