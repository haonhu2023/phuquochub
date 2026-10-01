import { apiGet, apiPost } from '@/lib/http';
import type { PlacePrice } from '@phuquochub/shared-types';

export type { PlacePrice };

// price_history (SSOT giá, polymorphic entity_type/entity_id, ADR-006/ADR-019) — dùng CHUNG cho
// mọi category (hotel/restaurant/tour/...), KHÔNG phải bảng giá riêng của hotel. `PlacePrice` đã
// khai báo ở @phuquochub/shared-types (dùng chung với PlaceDetail.prices) — tái sử dụng nguyên,
// không khai lại type thứ hai lệch dần theo thời gian.

/** GET /places/:id/prices — công khai, chỉ giá hiện hành (không lịch sử), amount đã qua trust gate. */
export async function listPlacePrices(placeId: string): Promise<PlacePrice[]> {
  return apiGet<PlacePrice[]>(`/places/${encodeURIComponent(placeId)}/prices`, { cache: 'no-store' });
}

export interface CreatePriceInput {
  service_name: string;
  amount: number;
  currency?: string;
  unit?: string;
  is_free?: boolean;
  description?: string;
  valid_from?: string;
  valid_to?: string;
  display_order?: number;
}

// Đặc quyền (Price.Edit.Managed) — append-only (ADR-006, KHÔNG ghi đè bản cũ). Response KHÔNG bị
// redact (actor thấy đúng giá trị vừa nhập, publicResponse mặc định false ở PricesService).
export async function createPlacePrice(placeId: string, payload: CreatePriceInput, accessToken: string): Promise<PlacePrice> {
  return apiPost<PlacePrice>(`/places/${encodeURIComponent(placeId)}/prices`, accessToken, payload);
}
