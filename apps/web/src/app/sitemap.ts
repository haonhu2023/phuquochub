import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site';
import { listPlaces } from '@/modules/places/api/places.api';
import { listHotelSlugs } from '@/modules/hotels/api/hotels.api';
import { listRestaurantSlugs } from '@/modules/restaurants/api/restaurants.api';
import { listTourSlugs } from '@/modules/tours/api/tours.api';
import { listEvents } from '@/modules/events/api/events.api';
import { listGuideArticles } from '@/modules/guide/api/guide.api';
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
// gốc thật). Bản `en` CHỈ vào khi `isEnDetailIndexable(...)` trả `true`.
//
// LƯU Ý PHẠM VI (v2): `isEnDetailIndexable` giờ cần hai cờ công khai thật theo TỪNG entity
// (`en_display_name_approved`/`en_short_description_approved`), nhưng sitemap chỉ có SLUG từ các
// list endpoint (`listPlaces`, `listHotelSlugs`, …) — các endpoint đó KHÔNG trả hai cờ này (chỉ
// endpoint chi tiết từng entity mới tính, xem `PlacesService.getBySlug`). Gọi chi tiết riêng cho
// từng slug ở đây (có thể hàng trăm entity) sẽ biến sitemap thành hàng trăm round-trip API mỗi
// request — ngoài phạm vi thay đổi tối thiểu của gate v2. Truyền `undefined` ở đây CỐ Ý: hàm luôn
// trả `false` khi thiếu input, nên hành vi vẫn AN TOÀN như trước (không đưa `/en/{slug}` nào vào
// sitemap) — kể cả cho một entity đã thật sự đủ điều kiện (vd VinWonders); trang CHI TIẾT của entity
// đó vẫn tự index đúng qua robots/canonical/hreflang của chính nó, sitemap chỉ là một kênh khám phá
// phụ. Dạy list endpoint trả hai cờ này (để sitemap phản ánh đúng) là một việc riêng, chưa làm ở đây.
function detailEntries(
  site: string,
  slugs: string[],
  pathPrefix: string,
  opts: { changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number },
): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  for (const slug of slugs) {
    const path = `${pathPrefix}/${slug}`;
    entries.push({ url: `${site}${localizedHref('vi', path)}`, ...opts });
    if (isEnDetailIndexable(undefined)) {
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

  const [places, hotels, restaurants, tours, events, guidesVi, guidesEn] = await Promise.all([
    safeList(() => listPlaces({ limit: 100 })),
    safeList(() => listHotelSlugs(100)),
    safeList(() => listRestaurantSlugs(100)),
    safeList(() => listTourSlugs(100)),
    safeList(() => listEvents(1, 100)),
    safeList(() => listGuideArticles('vi')),
    safeList(() => listGuideArticles('en')),
  ]);

  return [
    ...staticEntriesFor(site, SUPPORTED_LOCALES),
    ...detailEntries(
      site,
      places.map((p) => p.slug),
      '/places',
      { changeFrequency: 'weekly', priority: 0.8 },
    ),
    ...detailEntries(
      site,
      hotels.map((h) => h.slug),
      '/hotels',
      { changeFrequency: 'weekly', priority: 0.6 },
    ),
    ...detailEntries(
      site,
      restaurants.map((r) => r.slug),
      '/restaurants',
      { changeFrequency: 'weekly', priority: 0.6 },
    ),
    ...detailEntries(
      site,
      tours.map((t) => t.slug),
      '/tours',
      { changeFrequency: 'weekly', priority: 0.6 },
    ),
    ...detailEntries(
      site,
      events.map((e) => e.slug),
      '/events',
      { changeFrequency: 'daily', priority: 0.5 },
    ),
    ...guideEntries(site, [...guidesVi, ...guidesEn]),
  ];
}
