import { apiGet } from '@/lib/http';

// Category = danh mục Place (categories.slug/name_vi/name_en/icon/parent_id) — GET /categories
// đã tồn tại ở backend (Public, không phân trang) nhưng chưa từng có consumer ở frontend trước
// Search Filters. Dùng để populate dropdown lọc category trên /search.
export interface Category {
  id: string;
  slug: string;
  name_vi: string;
  name_en: string | null;
  icon: string | null;
  parent_id: string | null;
}

export async function listCategories(): Promise<Category[]> {
  return apiGet<Category[]>('/categories', { cache: 'no-store' });
}
