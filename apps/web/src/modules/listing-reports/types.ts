import type { JobListingPublicView } from '../job-listings/types';
import type { RealEstateListingPublicView } from '../real-estate-listings/types';
import type { PlaceDetail } from '../places/types';

// Khớp apps/api/src/modules/listing-reports. Dùng CHUNG registry loại entity với saved-items
// (common/listable-target-type.enum.ts phía API) — giữ TÊN riêng ở web vì hai module độc lập,
// không có import chéo giữa chúng.
export const LISTING_REPORT_TARGET_TYPES = ['job_listing', 'real_estate_listing', 'place'] as const;
export type ListingReportTargetType = (typeof LISTING_REPORT_TARGET_TYPES)[number];

// Giai đoạn 2 (21/10/2026) — 2 lý do mới cho vòng lặp "còn đúng không?".
export const LISTING_REPORT_REASONS = ['wrong_info', 'duplicate', 'spam', 'scam', 'other', 'not_reachable', 'no_longer_available'] as const;
export type ListingReportReason = (typeof LISTING_REPORT_REASONS)[number];

export const LISTING_REPORT_REASON_LABELS: Record<ListingReportReason, string> = {
  wrong_info: 'Thông tin sai',
  duplicate: 'Tin trùng lặp',
  spam: 'Spam',
  scam: 'Nghi lừa đảo',
  other: 'Khác',
  not_reachable: 'Không liên hệ được',
  no_longer_available: 'Đã hết / đã tuyển đủ',
};

// Giai đoạn 2 (21/10/2026) — `self_confirmed`: người ĐĂNG tự xác nhận, KHÔNG phải moderator xử lý
// (resolved) — xem apps/api's AddListingReportStillValidLoop migration cho lý do đầy đủ.
export const LISTING_REPORT_STATUSES = ['open', 'resolved', 'dismissed', 'self_confirmed'] as const;
export type ListingReportStatus = (typeof LISTING_REPORT_STATUSES)[number];

export interface ListingReportView {
  id: string;
  target_type: ListingReportTargetType;
  target_id: string;
  reason: ListingReportReason;
  description: string | null;
  status: ListingReportStatus;
  resolved_at: string | null;
  created_at: string;
  // Chỉ GET /listing-reports/pending điền — null khi tin không còn công khai tại thời điểm xem
  // hàng chờ (xem listing-reports.service.ts's comment phía API). `PlaceDetail` dùng `.name`, KHÔNG
  // phải `.title` như hai loại kia — nơi hiển thị (ListingReportsQueueView) phải tự phân biệt.
  listing: JobListingPublicView | RealEstateListingPublicView | PlaceDetail | null;
}

export interface CreateListingReportInput {
  target_type: ListingReportTargetType;
  target_id: string;
  reason: ListingReportReason;
  description?: string;
}

export type ListingReportDecision = 'resolved' | 'dismissed';
