// Khớp ADR-018 §D1/D9/D10 và moderation-design.md §6.1 (Moderation Foundation, M1).
// `target` (review/media/place) là ĐỦ 3 loại đã đăng ký FSM-hoặc-dự-trù trong ADR-018 D9/MR-4 —
// `place` có mặt trong enum nhưng M1–M7 KHÔNG triển khai FSM cho nó (§Ngoài phạm vi, ADR-018).

export enum ModerationTargetType {
  REVIEW = 'review',
  MEDIA = 'media',
  PLACE = 'place',
}

export enum ModerationCaseStatus {
  OPEN = 'open',
  CLAIMED = 'claimed',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

export enum ModerationCaseSource {
  NEW_CONTENT = 'new_content',
  REPORT = 'report',
  AI_FLAG = 'ai_flag',
  MANUAL = 'manual',
}

export enum ModerationCaseSeverity {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum ModerationDecision {
  APPROVE = 'approve',
  REJECT = 'reject',
  HIDE = 'hide',
  RESTORE = 'restore',
  DISMISS = 'dismiss',
}

// Mã lý do CÓ KIỂM SOÁT cho quyết định `reject` trên `target_type='media'` — Controlled Media
// Rejection Reason, 2026-08-12 (docs/data/modules/media.md §16.3). Đây là trường DUY NHẤT của một
// quyết định kiểm duyệt được phép lộ ra cho CHỦ NỘI DUNG; `moderation_cases.reason` (text tự do)
// vẫn thuần nội bộ (media.md §16). CHỈ áp dụng cho `reject` — KHÔNG cho hide/restore/approve/
// dismiss (xem ModerationService.decideMedia()): `hide` gỡ nội dung ĐÃ từng được duyệt công khai,
// một sự kiện khác hẳn "ảnh vừa gửi không đạt yêu cầu ngay từ đầu" mà taxonomy dưới đây mô tả —
// mở rộng sang hide là một quyết định sản phẩm riêng, cố ý NGOÀI PHẠM VI milestone này.
//
// Vì sao là khái niệm RIÊNG, không tái dùng `ReportReason` hay `ClaimReasonCode`:
//  • `ReportReason` là lý do NGƯỜI DÙNG báo cáo nội dung (spam/misinformation/personal_info…) —
//    một cáo buộc chưa được xác minh, không phải kết luận của moderator. Tái dùng nó sẽ khiến
//    chủ cơ sở đọc được cáo buộc của người khác như thể đó là phán quyết.
//  • `ClaimReasonCode` (insufficient_evidence/duplicate/fraud/wrong_target) nói về HỒ SƠ yêu cầu
//    quyền quản lý, không nói gì được về một bức ảnh.
//
// Taxonomy CỐ Ý NHỎ và chỉ mô tả THUỘC TÍNH CỦA CHÍNH BỨC ẢNH — không có mã nào phản ánh tín hiệu
// nội bộ (nghi ngờ gian lận, trùng tài khoản, theo dõi hành vi): những trường hợp đó dùng `OTHER`
// + ghi chú nội bộ ở `reason`, để chủ cơ sở không bao giờ đọc được rằng hệ thống đang nghi ngờ họ.
export enum MediaModerationReasonCode {
  /** Ảnh chứa nội dung không phù hợp (phản cảm, bạo lực, không lành mạnh). */
  INAPPROPRIATE_CONTENT = 'inappropriate_content',
  /** Ảnh mờ/tối/vỡ nét/ảnh chụp màn hình — không dùng được cho trang cơ sở. */
  LOW_QUALITY = 'low_quality',
  /** Ảnh không phải của địa điểm này (ảnh mạng, ảnh nơi khác, ảnh không liên quan). */
  UNRELATED_TO_PLACE = 'unrelated_to_place',
  /** Vấn đề bản quyền: ảnh của bên khác, có watermark, lấy từ nguồn có bản quyền. */
  COPYRIGHT = 'copyright',
  /** Trường hợp còn lại — chi tiết (nếu có) nằm ở `reason` nội bộ, KHÔNG lộ cho chủ nội dung. */
  OTHER = 'other',
}

export enum ReportReason {
  SPAM = 'spam',
  MISINFORMATION = 'misinformation',
  OFFENSIVE = 'offensive',
  IRRELEVANT = 'irrelevant',
  COPYRIGHT = 'copyright',
  PERSONAL_INFO = 'personal_info',
  OTHER = 'other',
}

export enum ReportStatus {
  OPEN = 'open',
  UPHELD = 'upheld',
  DISMISSED = 'dismissed',
}
