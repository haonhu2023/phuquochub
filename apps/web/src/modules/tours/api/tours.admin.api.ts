import { apiGetAuth, apiPatchAuth } from '@/lib/http';

// Chi tiết tour cho màn quản trị (đọc được cả khi place còn nháp). Hợp đồng khớp ToursController:
// GET/PATCH :id/details, quyền Place.Edit.Managed. PATCH có CAS qua expected_content_version.
export type TourType = 'diving' | 'fishing' | 'trekking' | 'sightseeing' | 'cruise' | 'other';
export type TourDifficulty = 'easy' | 'moderate' | 'hard';

export interface TourDetailsAdmin {
  tour_type: TourType | null;
  duration_minutes: number | null;
  difficulty: TourDifficulty | null;
  organizer_id: string | null;
  organizer_name: string | null;
  organizer_slug: string | null;
  pickup_point: string | null;
  inclusions: string | null;
  exclusions: string | null;
  cancellation_policy: string | null;
}

export interface UpdateTourDetailsInput {
  expected_content_version: number;
  tour_type?: TourType;
  duration_minutes?: number | null;
  difficulty?: TourDifficulty | null;
  pickup_point?: string | null;
  inclusions?: string | null;
  exclusions?: string | null;
  cancellation_policy?: string | null;
}

export async function getTourDetailsAdmin(placeId: string, accessToken: string): Promise<TourDetailsAdmin | null> {
  return apiGetAuth<TourDetailsAdmin | null>(`/tours/${encodeURIComponent(placeId)}/details`, accessToken, { cache: 'no-store' });
}

/** Trả thêm content_version mới để lần sửa kế tiếp dùng. */
export async function updateTourDetails(
  placeId: string,
  input: UpdateTourDetailsInput,
  accessToken: string,
): Promise<TourDetailsAdmin & { content_version: number }> {
  return apiPatchAuth<TourDetailsAdmin & { content_version: number }>(
    `/tours/${encodeURIComponent(placeId)}/details`,
    accessToken,
    input,
  );
}
