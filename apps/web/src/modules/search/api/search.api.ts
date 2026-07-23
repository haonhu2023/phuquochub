import { apiGet } from '@/lib/http';

export interface SearchResult {
  type: string;
  id: string;
  title: string;
  slug: string;
  score: number;
  snippet: string | null;
}

export interface Suggestion {
  id: string;
  title: string;
  slug: string;
}

// Tìm kiếm FTS tiếng Việt không dấu (BE dùng immutable_unaccent).
export async function searchPlaces(q: string, page = 1, limit = 20): Promise<SearchResult[]> {
  const qs = new URLSearchParams({ q, page: String(page), limit: String(limit) });
  return apiGet<SearchResult[]>(`/search?${qs.toString()}`);
}

export async function suggest(q: string): Promise<Suggestion[]> {
  return apiGet<Suggestion[]>(`/search/suggest?${new URLSearchParams({ q }).toString()}`);
}
