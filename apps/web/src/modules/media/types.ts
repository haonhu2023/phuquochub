// Kiểu cho phản hồi POST /media (đăng ký sau khi PUT thành công lên object storage). Khai báo
// cục bộ ở đây (không thêm vào @phuquochub/shared-types) vì chỉ apps/web tiêu thụ hình dạng này —
// khác PlaceMedia (media đã published, hiển thị trên trang chi tiết Place, url luôn có giá trị).
export interface UploadedMedia {
  id: string;
  type: string;
  url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  alt_text: string | null;
  status: string;
}

// Mirror của ALLOWED_MEDIA_MIME_TYPES / MAX_UPLOAD_SIZE_BYTES (apps/api/src/modules/media/dto/media.dto.ts)
// — chỉ để tiền kiểm tra phía client cho phản hồi UX nhanh; server vẫn là nguồn xác thực duy nhất.
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
