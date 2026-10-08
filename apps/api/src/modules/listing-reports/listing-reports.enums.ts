// "Báo sai" (wrong_info)/"báo trùng" (duplicate) là hai khái niệm mục V đợt 3/4 nêu đích danh —
// giữ TÊN riêng, không gộp vào ReportReason (moderation.enums.ts, dành cho nội dung ảnh/review,
// ngữ nghĩa khác: "ảnh phản cảm"/"review spam" không phải "tin rao vặt sai thông tin/trùng lặp").
export enum ListingReportReason {
  WRONG_INFO = 'wrong_info',
  DUPLICATE = 'duplicate',
  SPAM = 'spam',
  SCAM = 'scam',
  OTHER = 'other',
}

export enum ListingReportStatus {
  OPEN = 'open',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

export const LISTING_REPORT_REASON_LABELS: Record<ListingReportReason, string> = {
  [ListingReportReason.WRONG_INFO]: 'Thông tin sai',
  [ListingReportReason.DUPLICATE]: 'Tin trùng lặp',
  [ListingReportReason.SPAM]: 'Spam',
  [ListingReportReason.SCAM]: 'Nghi lừa đảo',
  [ListingReportReason.OTHER]: 'Khác',
};
