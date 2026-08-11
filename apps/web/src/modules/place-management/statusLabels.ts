import type { PlaceStatusValue } from '@phuquochub/shared-types';

// Nhãn trạng thái Place cho UI quản lý — CÙNG bốn giá trị PlaceStatus thật ở backend
// (apps/api/src/modules/places/place.enums.ts), không suy diễn thêm trạng thái nào.
export const PLACE_STATUS_LABELS: Record<PlaceStatusValue, string> = {
  draft: 'Nháp',
  pending: 'Chờ duyệt',
  published: 'Đã duyệt',
  archived: 'Đã lưu trữ',
};

export function placeStatusLabel(status: PlaceStatusValue): string {
  return PLACE_STATUS_LABELS[status] ?? status;
}
