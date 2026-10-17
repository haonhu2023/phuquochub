import { apiGet, apiGetAuth, apiGetPaginated, apiGetPaginatedAuth, apiPatchAuth, apiPost, apiPutAuth } from '@/lib/http';
import type { PaginationMeta } from '@phuquochub/shared-types';
import type {
  AdminListRealEstateListingsFilter,
  DecideRealEstateListingInput,
  DecideRealEstateListingTranslationInput,
  ListRealEstateListingsFilter,
  RealEstateListingAdminView,
  RealEstateListingModeratorView,
  RealEstateListingPublicDetailView,
  RealEstateListingPublicView,
  RealEstateListingSenderView,
  RealEstateListingTranslationModeratorView,
  RealEstateListingTranslationView,
  UpsertRealEstateListingInput,
  UpsertRealEstateListingTranslationInput,
} from '../types';

function filterQuery(filter: ListRealEstateListingsFilter): string {
  const qs = new URLSearchParams();
  if (filter.transaction_type) qs.set('transaction_type', filter.transaction_type);
  if (filter.property_type) qs.set('property_type', filter.property_type);
  if (filter.ward) qs.set('ward', filter.ward);
  if (filter.page) qs.set('page', String(filter.page));
  if (filter.limit) qs.set('limit', String(filter.limit));
  if (filter.locale) qs.set('locale', filter.locale);
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export async function listRealEstateListings(
  filter: ListRealEstateListingsFilter = {},
): Promise<{ data: RealEstateListingPublicView[]; meta: PaginationMeta }> {
  return apiGetPaginated<RealEstateListingPublicView>(`/real-estate-listings${filterQuery(filter)}`, { cache: 'no-store' });
}

/** `locale` (Gói C) — response LUÔN có field `locale` phản ánh nội dung THỰC SỰ đã trả, có thể
 *  khác locale yêu cầu (chưa có bản dịch đã duyệt → vẫn tiếng Việt) — trang gọi hàm này phải ĐỌC
 *  lại field đó, không giả định. */
export async function getRealEstateListing(id: string, locale?: 'vi' | 'en'): Promise<RealEstateListingPublicDetailView> {
  const qs = locale ? `?${new URLSearchParams({ locale }).toString()}` : '';
  return apiGet<RealEstateListingPublicDetailView>(`/real-estate-listings/${encodeURIComponent(id)}${qs}`, { cache: 'no-store' });
}

export async function listMyRealEstateListings(accessToken: string): Promise<RealEstateListingSenderView[]> {
  return apiGetAuth<RealEstateListingSenderView[]>('/real-estate-listings/mine', accessToken, { cache: 'no-store' });
}

export async function getMyRealEstateListing(id: string, accessToken: string): Promise<RealEstateListingSenderView> {
  return apiGetAuth<RealEstateListingSenderView>(`/real-estate-listings/mine/${encodeURIComponent(id)}`, accessToken, {
    cache: 'no-store',
  });
}

export async function createRealEstateListing(
  input: UpsertRealEstateListingInput,
  accessToken: string,
): Promise<RealEstateListingSenderView> {
  return apiPost<RealEstateListingSenderView>('/real-estate-listings', accessToken, input);
}

export async function updateRealEstateListing(
  id: string,
  input: UpsertRealEstateListingInput,
  accessToken: string,
): Promise<RealEstateListingSenderView> {
  return apiPatchAuth<RealEstateListingSenderView>(`/real-estate-listings/${encodeURIComponent(id)}`, accessToken, input);
}

export async function submitRealEstateListing(id: string, accessToken: string): Promise<RealEstateListingSenderView> {
  return apiPost<RealEstateListingSenderView>(`/real-estate-listings/${encodeURIComponent(id)}/submit`, accessToken);
}

export async function closeRealEstateListing(id: string, accessToken: string): Promise<RealEstateListingSenderView> {
  return apiPost<RealEstateListingSenderView>(`/real-estate-listings/${encodeURIComponent(id)}/close`, accessToken);
}

export async function reopenRealEstateListing(id: string, accessToken: string): Promise<RealEstateListingSenderView> {
  return apiPost<RealEstateListingSenderView>(`/real-estate-listings/${encodeURIComponent(id)}/reopen`, accessToken);
}

// Đánh dấu còn/hết giao dịch — ĐỘC LẬP với submit/close (xem §13u). KHÔNG đi qua update().
export async function markRealEstateListingRented(id: string, accessToken: string): Promise<RealEstateListingSenderView> {
  return apiPost<RealEstateListingSenderView>(`/real-estate-listings/${encodeURIComponent(id)}/mark-rented`, accessToken);
}

export async function markRealEstateListingSold(id: string, accessToken: string): Promise<RealEstateListingSenderView> {
  return apiPost<RealEstateListingSenderView>(`/real-estate-listings/${encodeURIComponent(id)}/mark-sold`, accessToken);
}

export async function markRealEstateListingAvailable(id: string, accessToken: string): Promise<RealEstateListingSenderView> {
  return apiPost<RealEstateListingSenderView>(`/real-estate-listings/${encodeURIComponent(id)}/mark-available`, accessToken);
}

export async function listPendingRealEstateListings(accessToken: string): Promise<RealEstateListingModeratorView[]> {
  return apiGetAuth<RealEstateListingModeratorView[]>('/real-estate-listings/pending', accessToken, { cache: 'no-store' });
}

export async function decideRealEstateListing(
  id: string,
  input: DecideRealEstateListingInput,
  accessToken: string,
): Promise<RealEstateListingModeratorView> {
  return apiPost<RealEstateListingModeratorView>(`/real-estate-listings/${encodeURIComponent(id)}/decide`, accessToken, input);
}

function adminFilterQuery(filter: AdminListRealEstateListingsFilter): string {
  const qs = new URLSearchParams();
  if (filter.status) qs.set('status', filter.status);
  if (filter.created_by) qs.set('created_by', filter.created_by);
  if (filter.page) qs.set('page', String(filter.page));
  if (filter.limit) qs.set('limit', String(filter.limit));
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/** GET /real-estate-listings/admin (RealEstateListing.Moderate) — mọi status, lọc tuỳ chọn theo
 *  status/người đăng. Khác listPendingRealEstateListings (chỉ pending) — màn hình quản lý TẤT CẢ
 *  tin (Gói B, 17/10/2026). */
export async function listRealEstateListingsForAdmin(
  filter: AdminListRealEstateListingsFilter,
  accessToken: string,
): Promise<{ data: RealEstateListingAdminView[]; meta: PaginationMeta }> {
  return apiGetPaginatedAuth<RealEstateListingAdminView>(`/real-estate-listings/admin${adminFilterQuery(filter)}`, accessToken, {
    cache: 'no-store',
  });
}

// --- Gói C phần 2/2 (17/10/2026) — bản dịch tiếng Anh ---

export async function getMyRealEstateListingTranslation(id: string, accessToken: string): Promise<RealEstateListingTranslationView | null> {
  return apiGetAuth<RealEstateListingTranslationView | null>(`/real-estate-listings/${encodeURIComponent(id)}/translations/en`, accessToken, {
    cache: 'no-store',
  });
}

export async function saveRealEstateListingTranslation(
  id: string,
  input: UpsertRealEstateListingTranslationInput,
  accessToken: string,
): Promise<RealEstateListingTranslationView> {
  return apiPutAuth<RealEstateListingTranslationView>(`/real-estate-listings/${encodeURIComponent(id)}/translations/en`, accessToken, input);
}

export async function submitRealEstateListingTranslation(id: string, accessToken: string): Promise<RealEstateListingTranslationView> {
  return apiPost<RealEstateListingTranslationView>(`/real-estate-listings/${encodeURIComponent(id)}/translations/en/submit`, accessToken);
}

export async function listPendingRealEstateListingTranslations(accessToken: string): Promise<RealEstateListingTranslationModeratorView[]> {
  return apiGetAuth<RealEstateListingTranslationModeratorView[]>('/real-estate-listings/translations/en/pending', accessToken, {
    cache: 'no-store',
  });
}

export async function decideRealEstateListingTranslation(
  id: string,
  input: DecideRealEstateListingTranslationInput,
  accessToken: string,
): Promise<RealEstateListingTranslationView> {
  return apiPost<RealEstateListingTranslationView>(`/real-estate-listings/${encodeURIComponent(id)}/translations/en/decide`, accessToken, input);
}
