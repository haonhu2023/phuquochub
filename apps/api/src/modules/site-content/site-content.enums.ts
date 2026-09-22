// S1 (2026-09-22) — the closed set of content keys the homepage/footer are allowed to read from
// `site_content`. A closed enum (not an arbitrary string key) keeps the write endpoint from
// becoming a general-purpose KV store: every key here has one specific, reviewed reader.
export enum SiteContentKey {
  HOME_HERO = 'home_hero',
  HOME_ABOUT = 'home_about',
  HOME_FEATURED = 'home_featured',
  SOCIAL_LINKS = 'social_links',
}

/** Nội dung theo locale (VI/EN khác chữ). */
export const LOCALIZED_KEYS: readonly SiteContentKey[] = [SiteContentKey.HOME_HERO, SiteContentKey.HOME_ABOUT];

/** Nội dung KHÔNG theo locale — dùng locale sentinel `'*'` (không phải NULL, xem migration). */
export const GLOBAL_KEYS: readonly SiteContentKey[] = [SiteContentKey.HOME_FEATURED, SiteContentKey.SOCIAL_LINKS];

export const GLOBAL_LOCALE = '*';

export function isLocalizedKey(key: SiteContentKey): boolean {
  return (LOCALIZED_KEYS as SiteContentKey[]).includes(key);
}

export function localeForKey(key: SiteContentKey, requestedLocale: string): string {
  return isLocalizedKey(key) ? requestedLocale : GLOBAL_LOCALE;
}
