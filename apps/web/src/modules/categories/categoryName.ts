import type { Category } from './api/categories.api';
import type { Locale } from '@/lib/locale';

/**
 * `PlaceCard`/`GET /places` chỉ mang `category_id` (UUID) — tên danh mục phải map thủ công qua
 * `GET /categories` (đã công khai, không phân trang, đã có consumer ở Search Filters). Gom việc
 * dựng map + fallback locale vào MỘT chỗ để `DiscoverPlaces` (trang chủ) và `/places` (duyệt toàn
 * bộ) không lệch nhau khi tự viết lại logic này.
 *
 * `name_en` có thể null (chưa dịch) — fallback về `name_vi` thay vì hiện rỗng, cùng nguyên tắc
 * fallback locale dùng ở nơi khác trong ứng dụng (không hiện danh mục "trống" cho bản /en).
 */
export function categoryNameLookup(categories: Category[], locale: Locale): (categoryId: string) => string | null {
  const map = new Map(categories.map((c) => [c.id, locale === 'en' ? (c.name_en ?? c.name_vi) : c.name_vi]));
  return (categoryId: string) => map.get(categoryId) ?? null;
}
