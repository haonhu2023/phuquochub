import type { Metadata } from 'next';
import Link from 'next/link';
import { listGuideArticles, type GuideArticleCard } from '@/modules/guide/api/guide.api';
import { GUIDE_CATEGORY_LABELS } from '@/modules/guide/guideCategory';
import { GuideFilters } from '@/modules/guide/GuideFilters';
import type { GuideArticleCategory } from '@/modules/guide/types';
import { localizedHref, type Locale } from '@/lib/locale';
import { buildRouteAlternates } from '@/lib/seo';
import { getHubPageCopy } from '@/lib/hub-pages.copy';
import placeStyles from '@/modules/places/places.module.css';
import guideStyles from '@/modules/guide/guide.module.css';

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ category?: string; tag?: string }>;
}

const EMPTY_COPY: Record<Locale, { title: string; body: string }> = {
  vi: {
    title: 'Chưa có bài cẩm nang nào được xuất bản',
    body: 'PhuQuocHub chưa xuất bản bài hướng dẫn nào. Quay lại sau, hoặc khám phá địa điểm trực tiếp.',
  },
  en: {
    title: 'No guide articles published yet',
    body: 'PhuQuocHub has not published any travel guide articles yet. Check back later, or explore places directly.',
  },
};

const EXPLORE_LABEL: Record<Locale, string> = { vi: 'Khám phá địa điểm →', en: 'Explore places →' };
const UPDATED_LABEL: Record<Locale, string> = { vi: 'Cập nhật', en: 'Updated' };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const copy = getHubPageCopy(locale, 'guide');
  return {
    title: `${copy.title} | PhuQuocHub`,
    description: copy.description,
    alternates: buildRouteAlternates(locale, '/guide'),
  };
}

// G-D (2026-09-22) — danh sách cẩm nang công khai. Lỗi API → danh sách rỗng, cùng khuôn
// EventsPage/mọi hub page khác (không để một lỗi fetch làm sập cả trang).
export default async function GuideIndexPage({ params, searchParams }: Props) {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const { category, tag } = await searchParams;
  let articles: GuideArticleCard[] = [];
  try {
    articles = await listGuideArticles(locale, { category: category as GuideArticleCategory | undefined, tag });
  } catch {
    articles = [];
  }

  const copy = getHubPageCopy(locale, 'guide');
  const empty = EMPTY_COPY[locale];

  return (
    <section>
      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>{copy.h1}</h1>
        <p className={placeStyles.pageLede}>{copy.description}</p>
      </header>

      <GuideFilters total={articles.length} />
      {tag && (
        <p className={placeStyles.pageLede} style={{ marginTop: '-0.5rem' }}>
          {locale === 'vi' ? `Đang lọc theo thẻ: ${tag}` : `Filtered by tag: ${tag}`} —{' '}
          <Link href={localizedHref(locale, '/guide')}>{locale === 'vi' ? 'Bỏ lọc' : 'Clear filter'}</Link>
        </p>
      )}

      {articles.length === 0 ? (
        <div className={placeStyles.state}>
          <p className={placeStyles.stateTitle}>{empty.title}</p>
          <p>{empty.body}</p>
          <Link href={localizedHref(locale, '/places')} className={placeStyles.btn}>
            {EXPLORE_LABEL[locale]}
          </Link>
        </div>
      ) : (
        <div className={placeStyles.grid}>
          {articles.map((a) => (
            <Link key={a.slug} href={localizedHref(locale, `/guide/${a.slug}`)} className={placeStyles.card}>
              {a.heroImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- runtime-resolved media host, same precedent as PlaceCard.tsx
                <img className={placeStyles.thumb} src={a.heroImageUrl} alt={a.title} loading="lazy" />
              ) : (
                <div className={placeStyles.thumbFallback} aria-hidden="true">
                  <span>{a.title.charAt(0)}</span>
                </div>
              )}
              <div className={placeStyles.cardBody}>
                {a.category && <span className={guideStyles.categoryBadge}>{GUIDE_CATEGORY_LABELS[locale][a.category]}</span>}
                <h2 className={placeStyles.cardTitle}>{a.title}</h2>
                {a.intro && <p className={placeStyles.cardDesc}>{a.intro}</p>}
                {a.publishedAt && (
                  <div className={placeStyles.cardMeta}>
                    <span>
                      {UPDATED_LABEL[locale]}: {new Date(a.publishedAt).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US')}
                    </span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
