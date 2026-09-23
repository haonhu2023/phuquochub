import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HomeHero } from '@/modules/home/HomeHero';
import { CategoryLinks } from '@/modules/home/CategoryLinks';
import { SmartDiscovery } from '@/modules/home/SmartDiscovery';
import { RightNowSection, RightNowSectionSkeleton } from '@/modules/home/RightNowSection';
import { DiscoverPlaces, DiscoverPlacesSkeleton } from '@/modules/home/DiscoverPlaces';
import { MapCta, MapCtaSkeleton, OwnerCta } from '@/modules/home/HomeCtas';
import { TrustSection } from '@/modules/home/TrustSection';
import { HomeAboutSection } from '@/modules/home/HomeAboutSection';
import { getHomeCopy } from '@/modules/home/home.copy';
import { getHomeContent } from '@/modules/site-content/api/site-content.api';
import { buildWebSiteJsonLd, serializeJsonLd } from '@/lib/structured-data';
import { type Locale } from '@/lib/locale';
import { buildRouteAlternates } from '@/lib/seo';

const SITE = 'PhuQuocHub';

interface Props {
  params: Promise<{ locale: string }>;
}

// Trang chủ nằm TRONG nhóm route `(public)` (không phải `app/page.tsx` như trang trạng thái hệ
// thống Sprint 0 mà nó thay thế) — nhờ vậy nó dùng CHUNG header điều hướng công khai ở
// `(public)/layout.tsx` thay vì tự dựng một thanh điều hướng thứ hai. Trước đây `/` không hề có
// điều hướng nào.
//
// `title` KHÔNG có hậu tố "· PhuQuocHub" như các trang con: đây là trang gốc, tiêu đề của nó
// chính là danh tính sản phẩm.
// SEO v2: `alternates` giờ dùng `buildRouteAlternates` — phát cả `languages.vi`/`languages.en`/
// `languages['x-default']` (Phase 19), không chỉ `canonical` một mình. `openGraph.locale` đã đổi
// động theo locale từ map/home upgrade.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const copy = getHomeCopy(locale);
  // S1 (2026-09-22): title/description theo dõi ĐÚNG override CMS hero hiển thị trên trang —
  // lỗi tải rơi về home.copy.ts tĩnh, cùng cách HomeHero.tsx tự nuốt lỗi.
  const heroOverride = await getHomeContent(locale)
    .then((c) => c.hero)
    .catch(() => null);
  const title = heroOverride?.title || copy.title;
  const lede = heroOverride?.lede || copy.lede;
  const alternates = buildRouteAlternates(locale, '/');
  return {
    title: `${SITE} — ${title}`,
    description: lede,
    alternates,
    openGraph: {
      title: `${SITE} — ${title}`,
      description: lede,
      type: 'website',
      url: alternates.canonical,
      siteName: SITE,
      locale: locale === 'en' ? 'en_US' : 'vi_VN',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${SITE} — ${title}`,
      description: lede,
    },
  };
}

/**
 * Server Component. JavaScript phía client của trang này gần như bằng KHÔNG: hero dùng form GET
 * thật, danh mục/CTA là liên kết tĩnh, và không có bundle bản đồ nào được nạp ở đây (`MapCta` chỉ
 * là một khối CSS gợi hình bản đồ, không phải MapLibre thật).
 *
 * Thứ tự khối (map/home upgrade, theo PHASE 10): Hero+tìm kiếm → danh mục nhanh → địa điểm nổi bật
 * → bản đồ → vì sao tin PhuQuocHub → chủ cơ sở (mục phụ, cuối cùng — trang này ưu tiên khách tham
 * quan, không phải doanh nghiệp).
 *
 * `RightNowSection`, `DiscoverPlaces`, và `MapCta` là các khối chạm API (mở cửa ngay bây giờ, danh
 * sách nổi bật, và tổng số place cho dòng freshness ở CTA bản đồ) — cả ba tự bắt lỗi bên trong (xem
 * chú thích trong từng file) và đều bọc `<Suspense>` riêng với khung chờ bám sát bố cục thật, nên
 * một sự cố API chỉ thu nhỏ đúng khối đó, không bao giờ đẩy cả trang chủ sang `error.tsx`.
 */
export default async function HomePage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const copy = getHomeCopy(locale);
  // S1 (2026-09-22): JSON-LD lede theo dõi ĐÚNG override hero hiển thị — lỗi tải rơi về
  // home.copy.ts tĩnh, cùng cách generateMetadata()/HomeHero.tsx tự nuốt lỗi ở trên.
  const heroLede = await getHomeContent(locale)
    .then((c) => c.hero?.lede || copy.lede)
    .catch(() => copy.lede);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(buildWebSiteJsonLd(SITE, heroLede, locale)),
        }}
      />

      <HomeHero locale={locale} />
      <CategoryLinks locale={locale} />
      <SmartDiscovery locale={locale} />

      <Suspense fallback={<RightNowSectionSkeleton locale={locale} />}>
        <RightNowSection locale={locale} />
      </Suspense>

      <Suspense fallback={<DiscoverPlacesSkeleton locale={locale} />}>
        <DiscoverPlaces locale={locale} />
      </Suspense>

      <Suspense fallback={<MapCtaSkeleton locale={locale} />}>
        <MapCta locale={locale} />
      </Suspense>
      <TrustSection locale={locale} />
      <Suspense fallback={null}>
        <HomeAboutSection locale={locale} />
      </Suspense>
      <OwnerCta locale={locale} />
    </>
  );
}
