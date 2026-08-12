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
  /** Vị trí trong gallery (0 = đầu tiên). `null` = chưa từng được sắp — xếp sau ảnh đã sắp. */
  sort_order: number | null;
  /** Ảnh này có đang là ảnh bìa của cơ sở không (`places.cover_image_id`). */
  is_cover: boolean;
}

/**
 * Chỉ ảnh ĐÃ ĐƯỢC DUYỆT mới đặt được làm ảnh bìa — backend cưỡng chế điều này ngay trong câu UPDATE
 * (`MediaRepository.setPlaceCoverImage`); hàm này chỉ để giao diện không mời gọi một thao tác chắc
 * chắn bị từ chối. KHÔNG phải lớp bảo mật.
 */
export function canBeCover(photo: PlacePhoto): boolean {
  return photo.status === 'published' && !photo.is_cover;
}

/**
 * Thứ `POST /places/{placeId}/media` thực sự trả về: schema `Media` công khai (qua `toMedia()`),
 * KHÁC `PlacePhoto` của màn hình quản lý — không có `created_at`/`sort_order`/`is_cover`, và `url`
 * luôn `null` ở đây vì ảnh vừa đăng ký luôn ở `pending` (chưa có URL công khai nào).
 *
 * Khai riêng thay vì tái dùng `PlacePhoto`: hình dạng cũ nói dối về các trường không hề tồn tại
 * trong response. Không nơi gọi nào đọc giá trị trả về (PhotosView nạp lại danh sách sau khi đăng
 * ký), nên đây là sửa tính đúng đắn của hợp đồng, không đổi hành vi.
 */
export interface RegisteredPlacePhoto {
  id: string;
  type: string;
  url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  alt_text: string | null;
  status: PlacePhotoStatus;
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
