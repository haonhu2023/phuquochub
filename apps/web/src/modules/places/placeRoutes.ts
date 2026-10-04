import { localizedHref, type Locale } from '@/lib/locale';

// Một nguồn duy nhất quyết định URL chi tiết của một địa điểm (dùng cho thẻ, danh sách, trang chủ,
// sitemap và redirect ở /places/[slug]). Không ai tự viết lại bảng này.
//
// Chỉ các category có TRANG CHUYÊN BIỆT thực sự trong apps/web (hotels/[slug], restaurants/[slug],
// tours/[slug]) mới được chuyển hướng. Bãi biển, điểm tham quan, chợ, quán cà phê… không có trang
// chuyên biệt nên giữ /places/[slug] (route chung).
//
// `resort` dùng route khách sạn: danh sách /hotels đã gồm cả resort (GET /hotels trả 11 = hotel 5 +
// resort 6, đối chiếu category_slug của dữ liệu public ngày 04/10/2026).
export const SPECIALISED_ROUTE_BY_CATEGORY: Readonly<Record<string, 'hotels' | 'restaurants' | 'tours'>> = {
  hotel: 'hotels',
  resort: 'hotels',
  restaurant: 'restaurants',
  tour: 'tours',
};

/** Route chuyên biệt cho category, hoặc null nếu category chỉ có trang chung. */
export function specialisedRouteFor(categorySlug: string | null | undefined): 'hotels' | 'restaurants' | 'tours' | null {
  if (!categorySlug) return null;
  return SPECIALISED_ROUTE_BY_CATEGORY[categorySlug] ?? null;
}

/**
 * Slug danh mục của một địa điểm: ưu tiên `category_slug` nếu object đã có (PlaceDetail), không thì
 * tra qua `category_id` (PlaceCard từ GET /places chỉ có id). Một quy tắc dùng chung cho mọi nơi.
 */
export function categorySlugOfPlace(
  place: { category_id: string; category_slug?: string | null },
  lookupByCategoryId: (categoryId: string) => string | null,
): string | null {
  return place.category_slug ?? lookupByCategoryId(place.category_id);
}

/**
 * Đường dẫn KHÔNG có locale tới trang chi tiết đúng của một địa điểm.
 * Dùng cùng với `localizedHref` để thêm locale.
 */
export function placeDetailPath(slug: string, categorySlug: string | null | undefined): string {
  const route = specialisedRouteFor(categorySlug) ?? 'places';
  return `/${route}/${slug}`;
}

/** Đường dẫn có locale tới trang chi tiết đúng. */
export function placeDetailHref(locale: Locale, slug: string, categorySlug: string | null | undefined): string {
  return localizedHref(locale, placeDetailPath(slug, categorySlug));
}
