import { apiPost } from '@/lib/http';
import type { CreatePlaceReportInput } from '../types';

// POST /places/{id}/report — trả 201 CREATED không body (xem PlacesController.report/
// PlacesService.report). Cùng khuôn submitBusinessClaim (business-claims.api.ts): một hàm mỏng,
// envelope/ApiError xử lý tập trung ở lib/http.
export async function reportPlace(placeId: string, input: CreatePlaceReportInput, accessToken: string): Promise<void> {
  await apiPost<null>(`/places/${encodeURIComponent(placeId)}/report`, accessToken, input);
}
