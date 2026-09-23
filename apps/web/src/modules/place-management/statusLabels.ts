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

// Tên KHOÁ lớp CSS trong place-management.module.css (KHÔNG phải chuỗi class đã hash — CSS Modules
// hash theo từng file import riêng, nên gọi qua `styles[placeStatusClassKey(status)]` ở component,
// không phải chuỗi trả về đây trực tiếp). Một định nghĩa dùng chung — trước đây `MyPlacesView.tsx`
// tự có bản của mình, dễ lệch với màn hình khác (vd EditPlaceView) khi thêm trạng thái mới.
const STATUS_CLASS_KEYS: Record<PlaceStatusValue, string> = {
  draft: 'statusDraft',
  pending: 'statusPending',
  published: 'statusPublished',
  archived: 'statusArchived',
};

export function placeStatusClassKey(status: PlaceStatusValue): string {
  return STATUS_CLASS_KEYS[status] ?? 'statusPending';
}
