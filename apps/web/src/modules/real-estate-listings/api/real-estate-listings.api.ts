import { apiGet, apiGetAuth, apiGetPaginated, apiGetPaginatedAuth, apiPatchAuth, apiPost } from '@/lib/http';
import type { PaginationMeta } from '@phuquochub/shared-types';
import type {
  AdminListRealEstateListingsFilter,
  DecideRealEstateListingInput,
  ListRealEstateListingsFilter,
  RealEstateListingAdminView,
  RealEstateListingModeratorView,
  RealEstateListingPublicView,
  RealEstateListingSenderView,
  UpsertRealEstateListingInput,
} from '../types';

function filterQuery(filter: ListRealEstateListingsFilter): string {
  const qs = new URLSearchParams();
  if (filter.transaction_type) qs.set('transaction_type', filter.transaction_type);
  if (filter.property_type) qs.set('property_type', filter.property_type);
  if (filter.ward) qs.set('ward', filter.ward);
  if (filter.page) qs.set('page', String(filter.page));
  if (filter.limit) qs.set('limit', String(filter.limit));
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export async function listRealEstateListings(
  filter: ListRealEstateListingsFilter = {},
): Promise<{ data: RealEstateListingPublicView[]; meta: PaginationMeta }> {
  return apiGetPaginated<RealEstateListingPublicView>(`/real-estate-listings${filterQuery(filter)}`, { cache: 'no-store' });
}

export async function getRealEstateListing(id: string): Promise<RealEstateListingPublicView> {
  return apiGet<RealEstateListingPublicView>(`/real-estate-listings/${encodeURIComponent(id)}`, { cache: 'no-store' });
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
