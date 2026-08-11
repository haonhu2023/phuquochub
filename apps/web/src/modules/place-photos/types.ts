// Ảnh của cơ sở như màn hình quản lý của chủ cơ sở nhìn thấy — khớp `MediaService.listForPlaceOwner`.
// KHÁC `PlaceMedia` công khai: ở đây có MỌI trạng thái (kể cả `pending`/`rejected`), và `url` trỏ
// tới kênh NỘI BỘ theo cơ sở (`/places/{placeId}/media/{id}/file`) vì ảnh chưa duyệt không có URL
// công khai nào. Không có object_key/bucket/checksum — backend không trả những trường đó.
export interface PlacePhoto {
  id: string;
  status: PlacePhotoStatus;
  caption: string | null;
  alt_text: string | null;
  created_at: string;
  url: string;
}

// Bốn giá trị THẬT của media_status (apps/api/src/modules/media/media.enums.ts).
export const PLACE_PHOTO_STATUSES = ['pending', 'published', 'rejected', 'hidden'] as const;
export type PlacePhotoStatus = (typeof PLACE_PHOTO_STATUSES)[number];

// Nhãn hướng tới CHỦ CƠ SỞ: nói rõ ảnh đang ở đâu trong quy trình duyệt, không dùng từ nội bộ.
export const PLACE_PHOTO_STATUS_LABELS: Record<PlacePhotoStatus, string> = {
  pending: 'Đang chờ duyệt',
  published: 'Đã hiển thị',
  rejected: 'Bị từ chối',
  hidden: 'Đã bị ẩn',
};

export function placePhotoStatusLabel(status: PlacePhotoStatus): string {
  return PLACE_PHOTO_STATUS_LABELS[status] ?? status;
}
