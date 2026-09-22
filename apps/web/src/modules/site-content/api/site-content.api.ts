import { apiGet, apiGetAuth, apiPutAuth } from '@/lib/http';
import type { HomePublicContent, SiteContentKey, SiteContentRow } from '../types';

// Public read — no-store (C1 precedent: đúng loại lỗi guide-articles từng dính, xem
// modules/guide/api/guide.api.ts's comment — publish/unpublish qua dashboard phải phản ánh ngay
// trên trang chủ, không chờ hết cửa sổ ISR).
export function getHomeContent(locale: string): Promise<HomePublicContent> {
  const qs = new URLSearchParams({ locale });
  return apiGet<HomePublicContent>(`/site-content/home?${qs.toString()}`, { cache: 'no-store' });
}

export function listSiteContent(accessToken: string): Promise<SiteContentRow[]> {
  return apiGetAuth<SiteContentRow[]>('/admin/site-content', accessToken);
}

export interface UpsertSiteContentInput {
  key: SiteContentKey;
  locale: string;
  value: Record<string, unknown>;
  expectedContentVersion: number;
}

// `expectedContentVersion: 0` là CAS token cho "tin rằng key/locale này chưa từng được ghi" — xem
// SiteContentService.upsert() phía API. Xung đột (đã bị người khác ghi đè) nổi lên qua
// ApiError.isConflict (409), cùng hợp đồng saveGuideDraft()/updatePlace() đã dùng.
export function upsertSiteContent(input: UpsertSiteContentInput, accessToken: string): Promise<SiteContentRow> {
  return apiPutAuth<SiteContentRow>('/admin/site-content', accessToken, input);
}
