import type { Metadata } from 'next';
import { SearchMapExplorer } from '@/modules/search/SearchMapExplorer';
import { buildRouteAlternates } from '@/lib/seo';
import { getHubPageCopy } from '@/lib/hub-pages.copy';
import type { Locale } from '@/lib/locale';

interface Props {
  params: Promise<{ locale: string }>;
}

// PR trước đây dùng `export const metadata` TĨNH — không nhận được `params.locale`, nên trang
// `/en/explore` phát ra cùng tiêu đề tiếng Việt như `/vi/explore`. Chuyển sang `generateMetadata`
// cùng mẫu mọi trang duyệt khác (`hotels`, `restaurants`, …).
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const copy = getHubPageCopy(locale, 'explore');
  return {
    title: `${copy.title} | PhuQuocHub`,
    description: copy.description,
    alternates: buildRouteAlternates(locale, '/explore'),
  };
}

// Trang Explore — tìm kiếm + bản đồ đồng bộ (Sprint 3). Chọn kết quả → bản đồ fly tới.
export default async function ExplorePage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const copy = getHubPageCopy(locale, 'explore');
  return (
    <section>
      <h1>{copy.h1}</h1>
      <p style={{ color: '#6b7280', fontSize: 14 }}>{copy.description}</p>
      <SearchMapExplorer />
    </section>
  );
}
