import { apiGet, apiPost } from '@/lib/http';
import type { CreateReviewInput, Review } from '../types';

export async function listReviews(placeId: string): Promise<Review[]> {
  return apiGet<Review[]>(`/places/${encodeURIComponent(placeId)}/reviews`, { cache: 'no-store' });
}

/** Tạo đánh giá — cần accessToken (Bearer). Trả `null` (EmptySuccess, openapi.yaml). */
export async function createReview(
  placeId: string,
  input: CreateReviewInput,
  accessToken: string,
): Promise<null> {
  return apiPost<null>(`/places/${encodeURIComponent(placeId)}/reviews`, accessToken, input);
}
