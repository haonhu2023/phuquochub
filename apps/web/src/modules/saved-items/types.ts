import type { JobListingPublicView } from '../job-listings/types';
import type { RealEstateListingPublicView } from '../real-estate-listings/types';

// Khớp apps/api/src/modules/saved-items. Đa hình — thêm loại entity lưu được mới chỉ cần thêm
// một nhánh union ở đây, không đổi field nào đã có.
export const SAVED_ITEM_TARGET_TYPES = ['job_listing', 'real_estate_listing'] as const;
export type SavedItemTargetType = (typeof SAVED_ITEM_TARGET_TYPES)[number];

export interface SavedItemView {
  id: string;
  target_type: SavedItemTargetType;
  target_id: string;
  saved_at: string;
  // null khi tin đã lưu không còn công khai (đóng/hết hạn/gỡ) — "Tin đã lưu" vẫn hiện dòng này,
  // không âm thầm biến mất (xem SavedItemsService.resolveTarget()'s comment phía API).
  listing: JobListingPublicView | RealEstateListingPublicView | null;
}
