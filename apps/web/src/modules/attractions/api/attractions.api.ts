import { apiGetPaginated } from '@/lib/http';
import type { PaginationMeta } from '@phuquochub/shared-types';
import type { AttractionCard, AttractionSort } from '../types';

// Attraction = Place (category='attraction'), không có bảng vệ tinh ⇒ chỉ có đường ĐỌC danh
// sách ở đây. Chi tiết dùng `getPlace()` của modules/places (một hợp đồng chi tiết duy nhất),
// và sitemap cũng đã liệt kê các URL /places/{slug} đó — không cần hàm slug riêng.
export interface ListAttractionsParams {
  page?: number;
  limit?: number;
  ward?: string;
  price_range?: string;
  sort?: AttractionSort;
}

/** Trang browse /attractions — giữ lại `meta` (page/pageSize/total/totalPages) cho phân trang thật. */
export async function listAttractions(
  params: ListAttractionsParams = {},
): Promise<{ data: AttractionCard[]; meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.ward) qs.set('ward', params.ward);
  if (params.price_range) qs.set('price_range', params.price_range);
  if (params.sort) qs.set('sort', params.sort);
  const q = qs.toString();
  return apiGetPaginated<AttractionCard>(`/attractions${q ? `?${q}` : ''}`, { cache: 'no-store' });
}
