import type { JobListingPublicView } from '../job-listings/types';
import type { RealEstateListingPublicView } from '../real-estate-listings/types';

// Khớp apps/api/src/modules/listing-reports. Dùng CHUNG registry loại entity với saved-items
// (common/listable-target-type.enum.ts phía API) — giữ TÊN riêng ở web vì hai module độc lập,
// không có import chéo giữa chúng.
export const LISTING_REPORT_TARGET_TYPES = ['job_listing', 'real_estate_listing'] as const;
export type ListingReportTargetType = (typeof LISTING_REPORT_TARGET_TYPES)[number];

export const LISTING_REPORT_REASONS = ['wrong_info', 'duplicate', 'spam', 'scam', 'other'] as const;
export type ListingReportReason = (typeof LISTING_REPORT_REASONS)[number];

export const LISTING_REPORT_REASON_LABELS: Record<ListingReportReason, string> = {
  wrong_info: 'Thông tin sai',
  duplicate: 'Tin trùng lặp',
  spam: 'Spam',
  scam: 'Nghi lừa đảo',
  other: 'Khác',
};

export const LISTING_REPORT_STATUSES = ['open', 'resolved', 'dismissed'] as const;
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
  // hàng chờ (xem listing-reports.service.ts's comment phía API).
  listing: JobListingPublicView | RealEstateListingPublicView | null;
}

export interface CreateListingReportInput {
  target_type: ListingReportTargetType;
  target_id: string;
  reason: ListingReportReason;
  description?: string;
}

export type ListingReportDecision = 'resolved' | 'dismissed';
