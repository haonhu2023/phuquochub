import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site';
import { listPlaces } from '@/modules/places/api/places.api';
import { listHotelSlugs } from '@/modules/hotels/api/hotels.api';
import { listRestaurantSlugs } from '@/modules/restaurants/api/restaurants.api';
import { listTourSlugs } from '@/modules/tours/api/tours.api';
import { listEvents } from '@/modules/events/api/events.api';
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

// Trang chi tiết thực thể (Phase 20 — EN indexation gate): bản `vi` LUÔN vào sitemap (nội dung gốc
// thật). Bản `en` CHỈ vào khi `isEnDetailIndexable(slug)` — hôm nay khoá `false` toàn bộ vì chưa có
// bản dịch nào ở trạng thái APPROVED/PUBLIC (xem chú thích đầy đủ tại định nghĩa hàm đó); KHÔNG
// đưa `/en/places/{slug}` vào sitemap chỉ vì route trả 200 trong khi nội dung vẫn là tiếng Việt.
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
    if (isEnDetailIndexable(slug)) {
      entries.push({ url: `${site}${localizedHref('en', path)}`, ...opts });
    }
  }
  return entries;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteUrl();

  const [places, hotels, restaurants, tours, events] = await Promise.all([
    safeList(() => listPlaces({ limit: 100 })),
    safeList(() => listHotelSlugs(100)),
    safeList(() => listRestaurantSlugs(100)),
    safeList(() => listTourSlugs(100)),
    safeList(() => listEvents(1, 100)),
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
  ];
}
