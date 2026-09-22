import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { GuideArticleView } from '@/modules/guide/GuideArticleView';
import { getGuideArticle } from '@/modules/guide/api/guide.api';
import { ApiError } from '@/lib/http';
import { buildRouteAlternates } from '@/lib/seo';
import type { Locale } from '@/lib/locale';

// G-A (2026-09-22): reads from the real CMS (GET /guide-articles/:slug, published-only —
// GuideArticlesService.getPublished()) instead of the in-repo seed. guide.api.ts fetches with
// `no-store` (C1) — no `export const revalidate` here to match; the two must not disagree about
// caching strategy for the same route.
const SITE = 'PhuQuocHub';

interface Params {
  params: Promise<{ slug: string; locale: string }>;
}

async function loadArticle(slug: string, locale: Locale) {
  try {
    return await getGuideArticle(slug, locale);
  } catch (err) {
    if (err instanceof ApiError && err.isNotFound) return null;
    throw err;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const data = await loadArticle(slug, locale);
  if (!data) return { title: `Cẩm nang · ${SITE}` };

  const title = `${data.title} · ${SITE}`;
  const description = data.intro ?? undefined;
  const path = `/guide/${data.slug}`;
  const { canonical, languages } = buildRouteAlternates(locale, path);

  return {
    title,
    description,
    alternates: { canonical, languages },
    openGraph: {
      title,
      description,
      type: 'article',
      ...(data.heroImageUrl ? { images: [{ url: data.heroImageUrl }] } : {}),
    },
    twitter: { card: 'summary', title, description },
  };
}

export default async function GuidePage({ params }: Params) {
  const { slug, locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const data = await loadArticle(slug, locale);
  if (!data) notFound();

  return <GuideArticleView article={data} locale={locale} />;
}
