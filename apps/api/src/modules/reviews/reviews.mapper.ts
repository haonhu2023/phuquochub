import { ReviewRow } from './repositories/reviews.repository';
import { toMedia, MediaResponse } from '../media/media.mapper';

// Khớp schema `Review` trong openapi.yaml (data-dictionary snake_case).
export interface ReviewResponse {
  id: string;
  user_id: string;
  author_name: string;
  author_avatar_url: string | null;
  rating: number;
  content: string | null;
  status: string;
  created_at: Date;
  media: MediaResponse[];
}

// `resolvePublicUrl` truyền xuống toMedia() cho từng ảnh gắn theo review — cùng resolver
// StorageService.getPublicUrl mà PlacesService.getBySlug dùng cho gallery Place (tái sử dụng
// nguyên vẹn quy ước media response, không tạo DTO media thứ hai).
export function toReview(row: ReviewRow, resolvePublicUrl: (objectKey: string) => string): ReviewResponse {
  return {
    id: row.id,
    user_id: row.user_id,
    author_name: row.author_name,
    author_avatar_url: row.author_avatar_url,
    rating: row.rating,
    content: row.content,
    status: row.status,
    created_at: row.created_at,
    media: row.media.map((m) => toMedia(m, resolvePublicUrl)),
  };
}
