// Hợp đồng response cluster Review (khớp api/openapi.yaml Review + createReview requestBody) —
// nguồn sự thật DUY NHẤT cho cả apps/api và apps/web, cùng quy ước với place.ts (GAP-11).

import type { PlaceMedia } from './place';

export type ReviewStatusValue = 'pending' | 'published' | 'hidden';

/** Đánh giá công khai của một Place (chỉ status=published được phát qua kênh công khai). */
export interface Review {
  id: string;
  user_id: string;
  author_name: string;
  author_avatar_url: string | null;
  rating: number;
  content: string | null;
  status: ReviewStatusValue;
  created_at: string;
  /** Ảnh/video đã published gắn với review này (ADR-018 auto-publish-on-attach), theo sort_order
   * rồi created_at/id. Tái sử dụng nguyên vẹn kiểu Media của Place gallery — không tạo DTO riêng. */
  media: PlaceMedia[];
  /** Giai đoạn 4 (chiến lược data-hub, strategy-data-hub-2026-10-21.md) — true khi người viết có
   * một booking `confirmed` tại địa điểm này lúc tạo review ("đã xác nhận từng đến"), khác với
   * đánh giá ẩn danh. Không bắt buộc — review vẫn tạo được bình thường khi false/không có booking. */
  confirmed_visit: boolean;
}

/** Body của POST /places/{id}/reviews. */
export interface CreateReviewInput {
  rating: number;
  content?: string;
  media_ids?: string[];
}
