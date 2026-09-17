import type { Metadata } from 'next';
import { listPlaces } from '@/modules/places/api/places.api';
import { PlaceCard } from '@/modules/places/PlaceCard';
import { listCategories } from '@/modules/categories/api/categories.api';
import { categoryNameLookup } from '@/modules/categories/categoryName';
import { type Locale } from '@/lib/locale';
import { buildRouteAlternates } from '@/lib/seo';
import { getHubPageCopy } from '@/lib/hub-pages.copy';
import styles from '@/modules/places/places.module.css';

interface Props {
  params: Promise<{ locale: string }>;
}

// PR A: canonical phải khớp route thật (/vi/places hoặc /en/places) — chuyển sang
// `generateMetadata` vì cần `params.locale`, `export const metadata` tĩnh không truy cập được.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const copy = getHubPageCopy(locale, 'places');
  return {
    title: `${copy.title} | PhuQuocHub`,
    description: copy.description,
    alternates: buildRouteAlternates(locale, '/places'),
    openGraph: {
      title: `${copy.title} | PhuQuocHub`,
      description: copy.description,
      type: 'website',
    },
  };
}

// Server Component: fetch danh sách Place (published) phía server.
// Lỗi API/mạng được ném lên error.tsx (có nút thử lại); ở đây chỉ xử lý danh sách rỗng.
export default async function PlacesPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const [places, categories] = await Promise.all([
    listPlaces({ limit: 50 }),
    // Tên danh mục là phần trình bày thêm trên mỗi thẻ, không phải điều kiện để trang render —
    // lỗi tra tên không được kéo cả trang xuống error.tsx (cùng lý do DiscoverPlaces.tsx).
    listCategories().catch(() => []),
  ]);
  const categoryName = categoryNameLookup(categories, locale);
  const copy = getHubPageCopy(locale, 'places');

  return (
    <section>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{copy.h1}</h1>
        <p className={styles.pageLede}>{copy.description}</p>
      </header>

      {places.length === 0 ? (
        <div className={styles.state}>
          <p className={styles.stateTitle}>
            {locale === 'en' ? 'No places yet' : 'Chưa có địa điểm nào'}
          </p>
          <p>
            {locale === 'en'
              ? 'Place data is being added. Please check back soon.'
              : 'Dữ liệu địa điểm đang được cập nhật. Vui lòng quay lại sau.'}
          </p>
        </div>
      ) : (
        <div className={styles.grid}>
          {places.map((p) => (
            <PlaceCard key={p.id} place={p} locale={locale} categoryName={categoryName(p.category_id)} />
          ))}
        </div>
      )}
    </section>
  );
}
