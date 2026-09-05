import type { Metadata } from 'next';
import { MapExplorer } from '@/modules/map/MapExplorer';
import { listCategories } from '@/modules/categories/api/categories.api';
import { buildRouteAlternates } from '@/lib/seo';
import { getHubPageCopy } from '@/lib/hub-pages.copy';
import type { Locale } from '@/lib/locale';

interface Props {
  params: Promise<{ locale: string }>;
}

// PR trước đây dùng `export const metadata` TĨNH — không nhận được `params.locale`, nên trang
// `/en/map` phát ra cùng tiêu đề tiếng Việt như `/vi/map`. Chuyển sang `generateMetadata` cùng mẫu
// mọi trang duyệt khác.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const copy = getHubPageCopy(locale, 'map');
  return {
    title: `${copy.title} | PhuQuocHub`,
    description: copy.description,
    alternates: buildRouteAlternates(locale, '/map'),
  };
}

// Trang bản đồ — Server Component fetch categories (cho bộ lọc + nhãn popup), MapExplorer là
// client component (bộ lọc cục bộ + MapView/MapLibre).
export default async function MapPage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const categories = await listCategories();
  const copy = getHubPageCopy(locale, 'map');
  return (
    <section>
      <h1>{copy.h1}</h1>
      <p style={{ color: '#6b7280', fontSize: 14 }}>{copy.description}</p>
      <MapExplorer categories={categories} />
    </section>
  );
}
