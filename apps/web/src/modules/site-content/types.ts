// S1 (2026-09-22) — mirrors apps/api/src/modules/site-content/site-content.enums.ts. Local to the
// web app rather than @phuquochub/shared-types, same precedent as modules/guide/types.ts (guide
// article shapes are also web-local, not shared-types).
export type SiteContentKey = 'home_hero' | 'home_about' | 'home_featured' | 'social_links';

export const GLOBAL_LOCALE = '*';

export interface SiteContentRow {
  key: SiteContentKey;
  locale: string;
  value: Record<string, unknown>;
  contentVersion: number;
  updatedAt: string;
}

export interface HomeHeroValue {
  eyebrow: string;
  title: string;
  lede: string;
  heroMediaId?: string;
}

export interface HomeAboutValue {
  title: string;
  body: string;
}

export interface HomeFeaturedValue {
  placeSlugs: string[];
}

export interface SocialLinksValue {
  facebook: string | null;
  zalo: string | null;
  instagram: string | null;
  whatsapp: string | null;
  phone: string | null;
}

// GET /site-content/home — public shape (see SiteContentService.getHomeContent on the API side).
export interface HomePublicContent {
  hero: { eyebrow: string; title: string; lede: string; heroImageUrl: string | null } | null;
  about: { title: string; body: string } | null;
  featuredPlaceSlugs: string[];
  social: SocialLinksValue;
}
