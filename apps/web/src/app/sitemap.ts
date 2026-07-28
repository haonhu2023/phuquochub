import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site';
import { listPlaces } from '@/modules/places/api/places.api';
import { listHotelSlugs } from '@/modules/hotels/api/hotels.api';
import { listRestaurantSlugs } from '@/modules/restaurants/api/restaurants.api';
import { listTourSlugs } from '@/modules/tours/api/tours.api';
import { listEvents } from '@/modules/events/api/events.api';

// MVP SEO pass: no sitemap existed anywhere before this (confirmed absent, PLACE-036/041). Built
// on Next.js's native `app/sitemap.ts` convention -- served automatically at /sitemap.xml, no
// extra dependency. Always server-rendered per-request (never attempted at `next build` time,
// same as every other API-backed route in this app) since it calls the same `no-store` API
// clients the rest of the app already uses.
export const dynamic = 'force-dynamic';

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
  '/search',
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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getSiteUrl();

  const [places, hotels, restaurants, tours, events] = await Promise.all([
    safeList(() => listPlaces({ limit: 100 })),
    safeList(() => listHotelSlugs(100)),
    safeList(() => listRestaurantSlugs(100)),
    safeList(() => listTourSlugs(100)),
    safeList(() => listEvents(1, 100)),
  ]);

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: `${site}${path}`,
    changeFrequency: path === '' ? 'daily' : 'daily',
    priority: path === '' ? 1 : 0.7,
  }));

  const placeEntries: MetadataRoute.Sitemap = places.map((p) => ({
    url: `${site}/places/${p.slug}`,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  const hotelEntries: MetadataRoute.Sitemap = hotels.map((h) => ({
    url: `${site}/hotels/${h.slug}`,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  const restaurantEntries: MetadataRoute.Sitemap = restaurants.map((r) => ({
    url: `${site}/restaurants/${r.slug}`,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  const tourEntries: MetadataRoute.Sitemap = tours.map((t) => ({
    url: `${site}/tours/${t.slug}`,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  const eventEntries: MetadataRoute.Sitemap = events.map((e) => ({
    url: `${site}/events/${e.slug}`,
    changeFrequency: 'daily',
    priority: 0.5,
  }));

  return [
    ...staticEntries,
    ...placeEntries,
    ...hotelEntries,
    ...restaurantEntries,
    ...tourEntries,
    ...eventEntries,
  ];
}
