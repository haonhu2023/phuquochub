import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site';
import { listPlaces, listEnIndexablePlaceIds } from '@/modules/places/api/places.api';
import { listHotelSlugs } from '@/modules/hotels/api/hotels.api';
import { listRestaurantSlugs } from '@/modules/restaurants/api/restaurants.api';
import { listCategories } from '@/modules/categories/api/categories.api';
import { categorySlugLookup } from '@/modules/categories/categoryName';
import { specialisedRouteFor } from '@/modules/places/placeRoutes';
import { listTourSlugs } from '@/modules/tours/api/tours.api';
import { listEvents } from '@/modules/events/api/events.api';
import { listGuideArticles } from '@/modules/guide/api/guide.api';
import { listJobListings } from '@/modules/job-listings/api/job-listings.api';
import { listRealEstateListings } from '@/modules/real-estate-listings/api/real-estate-listings.api';
import { localizedHref, SUPPORTED_LOCALES, type Locale } from '@/lib/locale';
import { isEnDetailIndexable } from '@/lib/seo';

// MVP SEO pass: no sitemap existed anywhere before this (confirmed absent, PLACE-036/041). Built
// on Next.js's native `app/sitemap.ts` convention -- served automatically at /sitemap.xml, no
// extra dependency. Always server-rendered per-request (never attempted at `next build` time,
// same as every other API-backed route in this app) since it calls the same `no-store` API
// clients the rest of the app already uses.
export const dynamic = 'force-dynamic';

// SEO v2 (Phase 21): `/search` REMOVED từ danh sách này — kết quả tìm kiếm nội bộ không nên là một
// bề mặt index lớn (đã đổi `robots: noindex,follow` ở chính route đó, xem `search/page.tsx`; loại
// khỏi sitemap là bước còn lại của cùng chính sách). Các route "hub" còn lại đều đã có tiêu đề/mô
// tả/H1 tiếng Anh THẬT (`hub-pages.copy.ts`) — đủ điều kiện lên sitemap CẢ hai locale, khác các
// trang chi tiết thực thể (còn phụ thuộc `isEnDetailIndexable`).
const STATIC_ROUTES = [
  '',
  '/places',
  '/hotels',
  '/restaurants',
  '/tours',
  // Điểm tham quan và bãi biển KHÔNG có URL chi tiết riêng: chi tiết là /places/{slug}, vốn đã
  // được liệt kê bên dưới qua listPlaces() — chỉ cần thêm chính trang duyệt vào sitemap.
  '/attractions',
  '/beaches',
  '/explore',
  '/map',
  '/events',
  '/guide',
  '/jobs',
  '/real-estate',
];

// A single entity-type fetch must never take down the whole sitemap -- if one endpoint is
// slow/erroring/empty, the sitemap should still list everything else correctly.
async function safeList<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch {
    return [];
  }
}

function staticEntriesFor(site: string, locales: readonly Locale[]): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  for (const locale of locales) {
    for (const path of STATIC_ROUTES) {
      entries.push({
        url: `${site}${localizedHref(locale, path)}`,
        changeFrequency: 'daily',
        priority: path === '' ? 1 : 0.7,
      });
    }
  }
  return entries;
}

// Trang chi tiết thực thể (Phase 20/v2 — EN indexation gate): bản `vi` LUÔN vào sitemap (nội dung
// gốc thật). Bản `en` CHỈ vào khi entity đó đủ điều kiện.
//
// SEO1 (2026-09-22) — SỬA lỗi "luôn false": v2 (comment cũ) cố ý truyền `isEnDetailIndexable(
// undefined)` vì list endpoint không mang hai cờ approval, và gọi endpoint CHI TIẾT cho hàng trăm
// entity mỗi lần build sitemap là không chấp nhận được. `enIndexableIds` (tuỳ chọn — SITEMAP CHỦ
// ĐỘNG gọi MỘT request `POST /places/en-indexable-ids` cho CẢ BỐN loại entity gộp lại, xem
// sitemap()) giải quyết đúng bài toán đó: một Set các id đã xác nhận đủ điều kiện, tra O(1) cho
// từng entity thay vì N round trip. `events` KHÔNG truyền `enIndexableIds` (event không phải hàng
// `places`, không có cơ chế dịch EN nào để tra) — giữ nguyên hành vi CŨ (luôn false, an toàn) cho
// đúng loại entity đó, không đổi hành vi ngoài phạm vi SEO1.
function detailEntries(
  site: string,
  items: Array<{ slug: string; id?: string }>,
  pathPrefix: string,
  opts: { changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number },
  enIndexableIds?: Set<string>,
): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  for (const item of items) {
    const path = `${pathPrefix}/${item.slug}`;
    entries.push({ url: `${site}${localizedHref('vi', path)}`, ...opts });
    const indexable = enIndexableIds && item.id ? enIndexableIds.has(item.id) : isEnDetailIndexable(undefined);
    if (indexable) {
      entries.push({ url: `${site}${localizedHref('en', path)}`, ...opts });
    }
  }
  return entries;
}

// G-D/SEO1 (2026-09-22) — bài cẩm nang KHÔNG dùng chung shape với detailEntries() ở trên: một
// place là MỘT thực thể có bản dịch overlay (vi luôn vào, en có điều kiện qua isEnDetailIndexable),
// còn một guide_articles row LÀ CHÍNH bản ghi của MỘT locale cụ thể (slug+locale là khoá duy nhất)
// — "bài viết en đủ điều kiện" đơn giản là "có một hàng published với locale='en'", không có cổng
// EN riêng nào để qua (không giống trường dịch tự động của place).
function guideEntries(
  site: string,
  articles: { slug: string; locale: string; publishedAt: string | null }[],
): MetadataRoute.Sitemap {
  return articles
    .filter((a): a is { slug: string; locale: Locale; publishedAt: string | null } => a.locale === 'vi' || a.locale === 'en')
    .map((a) => ({
      url: `${site}${localizedHref(a.locale, `/guide/${a.slug}`)}`,
      changeFrequency: 'weekly',
      priority: 0.6,
      // publishedAt is the only real "last changed" signal listGuideArticles exposes today — a
      // later save-without-republish doesn't move it, but it's still strictly more honest than no
      // lastModified at all (the gap the whole sitemap has everywhere else, unaddressed by this
      // change — that's the broader SEO pass, not this one).
      ...(a.publishedAt ? { lastModified: a.publishedAt } : {}),
    }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteUrl();

  const [placesAll, hotels, restaurants, tours, events, guidesVi, guidesEn, categories, jobListings, realEstateListings] =
    await Promise.all([
      safeList(() => listPlaces({ limit: 100 })),
      safeList(() => listHotelSlugs(100)),
      safeList(() => listRestaurantSlugs(100)),
      safeList(() => listTourSlugs(100)),
      safeList(() => listEvents(1, 100)),
      safeList(() => listGuideArticles('vi')),
      safeList(() => listGuideArticles('en')),
      safeList(() => listCategories()),
      // listJobListings/listRealEstateListings (@Public) đã tự lọc published + chưa hết hạn tại
      // thời điểm đọc — đúng tập cần lên sitemap, không cần endpoint riêng.
      //
      // limit=50, KHÔNG phải 100 như các entity khác ở trên: ListJobListingsQueryDto/
      // ListRealEstateListingsQueryDto giới hạn `@Max(50)` ở chính DTO — limit=100 bị 400
      // VALIDATION_ERROR, `safeList` nuốt lỗi đó thành mảng rỗng (im lặng, trông giống "chưa có
      // tin nào" chứ không giống một lỗi) — chỉ phát hiện được qua test THẬT trên image đã build
      // (r15 smoke test, 09/10/2026), không phải qua unit test (mock không áp constraint của DTO
      // thật). Bài học: không giả định mọi entity list endpoint cùng trần limit.
      safeList(async () => (await listJobListings({ limit: 50 })).data),
      safeList(async () => (await listRealEstateListings({ limit: 50 })).data),
    ]);

  // Chỉ bỏ entry /places/{slug} khi CHÍNH slug đó đã có entry chuyên biệt trong kết quả sitemap
  // (hotels/restaurants/tours). Nếu danh sách chuyên biệt lỗi, rỗng, hoặc bị cắt ở giới hạn 100, slug
  // đó không nằm trong tập này nên entry /places được giữ lại: không bao giờ mất URL.
  const specialisedSlugs = new Set([...hotels, ...restaurants, ...tours].map((e) => e.slug));
  const slugOf = categorySlugLookup(categories);
  const places = placesAll.filter(
    (p) => !(specialisedRouteFor(slugOf(p.category_id)) !== null && specialisedSlugs.has(p.slug)),
  );

  // SEO1 (2026-09-22) — ONE batched request for all four entity types combined (place/hotel/
  // restaurant/tour are all rows in `places`, category-filtered on the API side), instead of the
  // hundreds of round trips a per-entity check would cost. `safeList` still applies: a failure here
  // must not take down the sitemap, it just means no /en detail page gets listed this run — same
  // "fail closed, never fail the whole sitemap" contract every other entity fetch above already has.
  const allIds = [...places, ...hotels, ...restaurants, ...tours].map((e) => e.id);
  const enIndexableIds = new Set(await safeList(() => listEnIndexablePlaceIds(allIds)));

  return [
    ...staticEntriesFor(site, SUPPORTED_LOCALES),
    ...detailEntries(
      site,
      places.map((p) => ({ slug: p.slug, id: p.id })),
      '/places',
      { changeFrequency: 'weekly', priority: 0.8 },
      enIndexableIds,
    ),
    ...detailEntries(
      site,
      hotels.map((h) => ({ slug: h.slug, id: h.id })),
      '/hotels',
      { changeFrequency: 'weekly', priority: 0.6 },
      enIndexableIds,
    ),
    ...detailEntries(
      site,
      restaurants.map((r) => ({ slug: r.slug, id: r.id })),
      '/restaurants',
      { changeFrequency: 'weekly', priority: 0.6 },
      enIndexableIds,
    ),
    ...detailEntries(
      site,
      tours.map((t) => ({ slug: t.slug, id: t.id })),
      '/tours',
      { changeFrequency: 'weekly', priority: 0.6 },
      enIndexableIds,
    ),
    ...detailEntries(
      site,
      events.map((e) => ({ slug: e.slug })),
      '/events',
      { changeFrequency: 'daily', priority: 0.5 },
    ),
    ...guideEntries(site, [...guidesVi, ...guidesEn]),
    // Tuyển dụng/bất động sản: URL chi tiết dùng id thẳng (/jobs/{id}, không có slug). KHÔNG truyền
    // enIndexableIds — CHỈ vào sitemap bản vi, cùng khuôn `events` ở trên. Ghi chú SỬA LẠI 20/10/2026
    // (rà SEO): dòng bình luận cũ ở đây nói "không có bản dịch EN song song" — KHÔNG còn đúng, Gói C
    // (17/10/2026, commit c41772b) đã thêm luồng dịch EN cho cả hai module. Lý do THẬT loại EN khỏi
    // sitemap bây giờ là CHƯA CÓ một endpoint liệt kê hàng loạt "id nào có bản dịch EN đã duyệt +
    // KHÔNG đang bị ẩn vì lệch dữ kiện quan trọng" (tương đương `listEnIndexablePlaceIds` của place)
    // — một bản dịch EN đã duyệt, đủ điều kiện công khai hôm nay vẫn KHÔNG được quảng cáo qua sitemap/
    // hreflang. Đây là khoảng trống SEO còn lại (xem checkpoint.md), không phải vì tính năng dịch
    // không tồn tại. Mục VI: "Danh sách/chi tiết/.../sitemap... nhất quán" — trước candidate chứa dòng
    // này, sitemap chỉ có hai trang hub /jobs//real-estate, thiếu chi tiết từng tin (đã ghi là giới
    // hạn biết trước ở §13t/§13v/§13y).
    ...detailEntries(
      site,
      jobListings.map((j) => ({ slug: j.id })),
      '/jobs',
      { changeFrequency: 'daily', priority: 0.6 },
    ),
    ...detailEntries(
      site,
      realEstateListings.map((r) => ({ slug: r.id })),
      '/real-estate',
      { changeFrequency: 'daily', priority: 0.6 },
    ),
  ];
}
