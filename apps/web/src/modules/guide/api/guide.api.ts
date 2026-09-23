import { apiGet } from '@/lib/http';
import type { GuideArticleDetail } from '../types';

// Public, published-only read — GET /guide-articles/:slug?locale=.
//
// `no-store` (C1, 2026-09-22) — NOT the `revalidate: 300` ISR this originally shipped with. Found
// live, by publishing then immediately unpublishing a real article through the dashboard: the
// detail page kept serving the stale published content for the rest of the 5-minute window, same
// bug class the plan's C1 exists to close. Fixing it properly (ISR + an authenticated on-demand
// revalidateTag route the dashboard calls after publish/unpublish/save) is real, separate
// infrastructure this fix doesn't invent yet — every OTHER admin-writable content type in this
// app (places, business claims, moderation, …) already avoids the whole class of bug the same way:
// `no-store`. Matching that proven, already-audited pattern here is the safe default until (if
// ever) guide traffic actually justifies the ISR complexity.
export async function getGuideArticle(slug: string, locale: string): Promise<GuideArticleDetail> {
  const qs = new URLSearchParams({ locale });
  return apiGet<GuideArticleDetail>(`/guide-articles/${encodeURIComponent(slug)}?${qs.toString()}`, {
    cache: 'no-store',
  });
}

// G-D (2026-09-22) — public index card shape (GET /guide-articles?locale=). Same `no-store`
// reasoning as getGuideArticle above — this list must reflect a publish/unpublish immediately too.
export interface GuideArticleCard {
  slug: string;
  locale: string;
  title: string;
  intro: string | null;
  heroImageUrl: string | null;
  publishedAt: string | null;
}

export async function listGuideArticles(locale: string): Promise<GuideArticleCard[]> {
  const qs = new URLSearchParams({ locale });
  return apiGet<GuideArticleCard[]>(`/guide-articles?${qs.toString()}`, { cache: 'no-store' });
}
