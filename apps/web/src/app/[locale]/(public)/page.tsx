import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HomeHero } from '@/modules/home/HomeHero';
import { CategoryLinks } from '@/modules/home/CategoryLinks';
import { DiscoverPlaces, DiscoverPlacesSkeleton } from '@/modules/home/DiscoverPlaces';
import { MapCta, OwnerCta } from '@/modules/home/HomeCtas';
import { TrustSection } from '@/modules/home/TrustSection';
import { getHomeCopy } from '@/modules/home/home.copy';
import { buildWebSiteJsonLd, serializeJsonLd } from '@/lib/structured-data';
import { localizedHref, type Locale } from '@/lib/locale';

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
// PR A: chuyển sang `generateMetadata` vì canonical cần `params.locale`. `openGraph.locale`
// GIỮ NGUYÊN `'vi_VN'` tĩnh — cố ý CHƯA đổi (ngoài phạm vi PR A, xem ghi chú kế hoạch).
// map/home upgrade: title/description giờ đọc từ `home.copy.ts` theo locale thay vì hằng số tiếng
// Việt cứng — trang `/en` trước đây trả về metadata tiếng Việt dù nội dung route đã có locale.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const copy = getHomeCopy(locale);
  const canonical = localizedHref(locale, '/');
  return {
    title: `${SITE} — ${copy.title}`,
    description: copy.lede,
    alternates: { canonical },
    openGraph: {
      title: `${SITE} — ${copy.title}`,
      description: copy.lede,
      type: 'website',
      url: canonical,
      siteName: SITE,
      locale: locale === 'en' ? 'en_US' : 'vi_VN',
    },
    twitter: {
      card: 'summary',
      title: `${SITE} — ${copy.title}`,
      description: copy.lede,
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
 * CHỈ `DiscoverPlaces` chạm API. Nó được bọc `Suspense` để phần tĩnh hiển thị ngay, và tự bắt lỗi
 * bên trong (xem chú thích trong chính component) — nên một sự cố API chỉ thu nhỏ đúng khối đó,
 * không bao giờ đẩy cả trang chủ sang `error.tsx`.
 */
export default async function HomePage({ params }: Props) {
  const { locale: localeParam } = await params;
  const locale = localeParam as Locale;
  const copy = getHomeCopy(locale);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(buildWebSiteJsonLd(SITE, copy.lede)),
        }}
      />

      <HomeHero locale={locale} />
      <CategoryLinks locale={locale} />

      <Suspense fallback={<DiscoverPlacesSkeleton locale={locale} />}>
        <DiscoverPlaces locale={locale} />
      </Suspense>

      <MapCta locale={locale} />
      <TrustSection locale={locale} />
      <OwnerCta locale={locale} />
    </>
  );
}
