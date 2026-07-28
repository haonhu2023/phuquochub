import { apiGetPaginated } from '@/lib/http';
import type { PaginationMeta } from '@phuquochub/shared-types';
import type { BeachCard, BeachSort } from '../types';

// Beach = Place (category='beach'), không có bảng vệ tinh ⇒ chỉ có đường ĐỌC danh sách ở đây.
// Chi tiết dùng `getPlace()` của modules/places (một hợp đồng chi tiết duy nhất), và sitemap
// cũng đã liệt kê các URL /places/{slug} đó — không cần hàm slug riêng.
export interface ListBeachesParams {
  page?: number;
  limit?: number;
  ward?: string;
  price_range?: string;
  sort?: BeachSort;
}

/** Trang browse /beaches — giữ lại `meta` (page/pageSize/total/totalPages) cho phân trang thật. */
export async function listBeaches(
  params: ListBeachesParams = {},
): Promise<{ data: BeachCard[]; meta: PaginationMeta }> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.ward) qs.set('ward', params.ward);
  if (params.price_range) qs.set('price_range', params.price_range);
  if (params.sort) qs.set('sort', params.sort);
  const q = qs.toString();
  return apiGetPaginated<BeachCard>(`/beaches${q ? `?${q}` : ''}`, { cache: 'no-store' });
}
