import { apiGetAuth, apiPost } from '@/lib/http';

// Mô tả/tên/mô tả ngắn VI/EN — đi qua place_translations THẬT (Public Place i18n Read Path phía
// API), KHÔNG phải cột places.<col>. "Lưu nháp" không ảnh hưởng gì tới trang công khai — mọi bản
// dịch mới luôn bắt đầu PENDING/không công khai (GOVERNANCE HARDENING phía
// PlaceTranslationsService); "Lưu và công khai" mới thật sự duyệt qua
// TranslationReviewService.reviewTranslation(). File này ban đầu chỉ có description (2026-09-16),
// mở rộng thêm name/short_description (2026-09-17, requirement 1) — CÙNG hình dạng response, ba bộ
// hàm riêng vì mỗi field có route/field_key/fallback-key khác nhau ở phía API.

export interface DescriptionDraftSlot {
  id: string;
  text: string;
  human_review_status: string;
  is_public: boolean;
}

export interface DescriptionDraftResponse {
  fallback_description: string | null;
  vi: DescriptionDraftSlot | null;
  en: DescriptionDraftSlot | null;
}

export interface NameDraftResponse {
  fallback_name: string | null;
  vi: DescriptionDraftSlot | null;
  en: DescriptionDraftSlot | null;
}

export interface ShortDescriptionDraftResponse {
  fallback_short_description: string | null;
  vi: DescriptionDraftSlot | null;
  en: DescriptionDraftSlot | null;
}

export interface PublishDescriptionResult {
  locale_code: string;
  ok: boolean;
  error?: string;
}

/** Xem trước: bản nháp HIỆN HÀNH (bất kể đã công khai hay chưa) cho vi/en + giá trị gốc places.description. */
export async function getDescriptionDraft(placeId: string, accessToken: string): Promise<DescriptionDraftResponse> {
  return apiGetAuth<DescriptionDraftResponse>(
    `/places/${encodeURIComponent(placeId)}/description/draft`,
    accessToken,
    { cache: 'no-store' },
  );
}

/** Lưu nháp — TUYỆT ĐỐI không ảnh hưởng tới bản công khai hiện tại. */
export async function saveDescriptionDraft(
  placeId: string,
  input: { vi?: string; en?: string },
  accessToken: string,
): Promise<Array<{ id: string; locale_code: string; human_review_status: string }>> {
  return apiPost(`/places/${encodeURIComponent(placeId)}/description/draft`, accessToken, input);
}

/** Lưu và công khai — duyệt bản nháp hiện hành cho mỗi locale đang PENDING/NEEDS_CHANGES. */
export async function publishDescriptionDraft(
  placeId: string,
  accessToken: string,
): Promise<PublishDescriptionResult[]> {
  return apiPost(`/places/${encodeURIComponent(placeId)}/description/publish`, accessToken);
}

/** Tên hiển thị VI/EN (2026-09-17) — CÙNG khuôn getDescriptionDraft(), field_key `display_name`. */
export async function getNameDraft(placeId: string, accessToken: string): Promise<NameDraftResponse> {
  return apiGetAuth<NameDraftResponse>(`/places/${encodeURIComponent(placeId)}/name/draft`, accessToken, {
    cache: 'no-store',
  });
}

export async function saveNameDraft(
  placeId: string,
  input: { vi?: string; en?: string },
  accessToken: string,
): Promise<Array<{ id: string; locale_code: string; human_review_status: string }>> {
  return apiPost(`/places/${encodeURIComponent(placeId)}/name/draft`, accessToken, input);
}

export async function publishNameDraft(placeId: string, accessToken: string): Promise<PublishDescriptionResult[]> {
  return apiPost(`/places/${encodeURIComponent(placeId)}/name/publish`, accessToken);
}

/** Mô tả ngắn VI/EN (2026-09-17) — CÙNG khuôn getDescriptionDraft(), field_key `short_description`. */
export async function getShortDescriptionDraft(
  placeId: string,
  accessToken: string,
): Promise<ShortDescriptionDraftResponse> {
  return apiGetAuth<ShortDescriptionDraftResponse>(
    `/places/${encodeURIComponent(placeId)}/short-description/draft`,
    accessToken,
    { cache: 'no-store' },
  );
}

export async function saveShortDescriptionDraft(
  placeId: string,
  input: { vi?: string; en?: string },
  accessToken: string,
): Promise<Array<{ id: string; locale_code: string; human_review_status: string }>> {
  return apiPost(`/places/${encodeURIComponent(placeId)}/short-description/draft`, accessToken, input);
}

export async function publishShortDescriptionDraft(
  placeId: string,
  accessToken: string,
): Promise<PublishDescriptionResult[]> {
  return apiPost(`/places/${encodeURIComponent(placeId)}/short-description/publish`, accessToken);
}
