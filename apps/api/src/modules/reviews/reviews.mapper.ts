import { ReviewRow } from './repositories/reviews.repository';

// Khớp schema `Review` sẽ thêm vào openapi.yaml (data-dictionary snake_case).
export interface ReviewResponse {
  id: string;
  user_id: string;
  author_name: string;
  author_avatar_url: string | null;
  rating: number;
  content: string | null;
  status: string;
  created_at: Date;
}

export function toReview(row: ReviewRow): ReviewResponse {
  return {
    id: row.id,
    user_id: row.user_id,
    author_name: row.author_name,
    author_avatar_url: row.author_avatar_url,
    rating: row.rating,
    content: row.content,
    status: row.status,
    created_at: row.created_at,
  };
}
