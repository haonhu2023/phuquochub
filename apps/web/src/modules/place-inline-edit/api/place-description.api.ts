import { apiGetAuth, apiPost } from '@/lib/http';

// Mô tả VI/EN — đi qua place_translations THẬT (Public Place i18n Read Path phía API), KHÔNG
// phải cột places.description. "Lưu nháp" (saveDescriptionDraft) không ảnh hưởng gì tới trang công
// khai — mọi bản dịch mới luôn bắt đầu PENDING/không công khai (GOVERNANCE HARDENING phía
// PlaceTranslationsService); "Lưu và công khai" (publishDescriptionDraft) mới thật sự duyệt qua
// TranslationReviewService.reviewTranslation().

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
