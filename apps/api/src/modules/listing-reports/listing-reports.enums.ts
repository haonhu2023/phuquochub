// "Báo sai" (wrong_info)/"báo trùng" (duplicate) là hai khái niệm mục V đợt 3/4 nêu đích danh —
// giữ TÊN riêng, không gộp vào ReportReason (moderation.enums.ts, dành cho nội dung ảnh/review,
// ngữ nghĩa khác: "ảnh phản cảm"/"review spam" không phải "tin rao vặt sai thông tin/trùng lặp").
export enum ListingReportReason {
  WRONG_INFO = 'wrong_info',
  DUPLICATE = 'duplicate',
  SPAM = 'spam',
  SCAM = 'scam',
  OTHER = 'other',
  // Giai đoạn 2 (21/10/2026) — vòng lặp "còn đúng không?", xem migration
  // AddListingReportStillValidLoop1720010300000's ghi chú đầy đủ.
  NOT_REACHABLE = 'not_reachable',
  NO_LONGER_AVAILABLE = 'no_longer_available',
}

export enum ListingReportStatus {
  OPEN = 'open',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
  // Giai đoạn 2 (21/10/2026) — người ĐĂNG tin tự xác nhận "vẫn còn", KHÔNG phải moderator xét
  // duyệt — tách riêng khỏi RESOLVED có chủ đích, xem migration's ghi chú đầy đủ.
  SELF_CONFIRMED = 'self_confirmed',
}

export const LISTING_REPORT_REASON_LABELS: Record<ListingReportReason, string> = {
  [ListingReportReason.WRONG_INFO]: 'Thông tin sai',
  [ListingReportReason.DUPLICATE]: 'Tin trùng lặp',
  [ListingReportReason.SPAM]: 'Spam',
  [ListingReportReason.SCAM]: 'Nghi lừa đảo',
  [ListingReportReason.OTHER]: 'Khác',
  [ListingReportReason.NOT_REACHABLE]: 'Không liên hệ được',
  [ListingReportReason.NO_LONGER_AVAILABLE]: 'Đã hết / đã tuyển đủ',
};
