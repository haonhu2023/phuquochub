import { apiGet, apiGetPaginated } from '@/lib/http';
import type { PaginationMeta } from '@phuquochub/shared-types';

// F-35 / OD-B4 (2026-07-24): `score` REMOVED — the API no longer emits Postgres ts_rank in the
// public payload. Server-side relevance ordering is unchanged; nothing in the web app read `.score`.
export interface SearchResult {
  type: string;
  id: string;
  title: string;
  slug: string;
  snippet: string | null;
}

export interface Suggestion {
  id: string;
  title: string;
  slug: string;
}

// Search Filters (category/ward/price_range) — cùng cột places đã lọc ở /hotels /restaurants
// /tours /attractions /beaches (ListPlacesQueryDto), giờ áp dụng thêm cho kết quả FTS /search.
export interface SearchParams {
  q: string;
  page?: number;
  limit?: number;
  category?: string;
  ward?: string;
  price_range?: string;
}

// Tìm kiếm FTS tiếng Việt không dấu (BE dùng immutable_unaccent). Giữ lại `meta` (page/pageSize/
// total/totalPages) — trang /search giờ phân trang thật bằng Pagination chung, không còn đánh
// rơi meta như trước.
export async function searchPlaces(
  params: SearchParams,
): Promise<{ data: SearchResult[]; meta: PaginationMeta }> {
  const qs = new URLSearchParams({ q: params.q });
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.category) qs.set('category', params.category);
  if (params.ward) qs.set('ward', params.ward);
  if (params.price_range) qs.set('price_range', params.price_range);
  return apiGetPaginated<SearchResult>(`/search?${qs.toString()}`, { cache: 'no-store' });
}

export async function suggest(q: string): Promise<Suggestion[]> {
  return apiGet<Suggestion[]>(`/search/suggest?${new URLSearchParams({ q }).toString()}`);
}
