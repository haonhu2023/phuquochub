import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HomeHero, HOME_DESCRIPTION, HOME_TITLE } from '@/modules/home/HomeHero';
import { CategoryLinks } from '@/modules/home/CategoryLinks';
import { DiscoverPlaces, DiscoverPlacesSkeleton } from '@/modules/home/DiscoverPlaces';
import { MapCta, OwnerCta } from '@/modules/home/HomeCtas';
import { buildWebSiteJsonLd, serializeJsonLd } from '@/lib/structured-data';

const SITE = 'PhuQuocHub';

// Trang chủ nằm TRONG nhóm route `(public)` (không phải `app/page.tsx` như trang trạng thái hệ
// thống Sprint 0 mà nó thay thế) — nhờ vậy nó dùng CHUNG header điều hướng công khai ở
// `(public)/layout.tsx` thay vì tự dựng một thanh điều hướng thứ hai. Trước đây `/` không hề có
// điều hướng nào.
//
// `title` KHÔNG có hậu tố "· PhuQuocHub" như các trang con: đây là trang gốc, tiêu đề của nó
// chính là danh tính sản phẩm.
export const metadata: Metadata = {
  title: `${SITE} — ${HOME_TITLE}`,
  description: HOME_DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    title: `${SITE} — ${HOME_TITLE}`,
    description: HOME_DESCRIPTION,
    type: 'website',
    url: '/',
    siteName: SITE,
    locale: 'vi_VN',
  },
  twitter: {
    card: 'summary',
    title: `${SITE} — ${HOME_TITLE}`,
    description: HOME_DESCRIPTION,
  },
};

/**
 * Server Component. JavaScript phía client của trang này gần như bằng KHÔNG: hero dùng form GET
 * thật, danh mục/CTA là liên kết tĩnh, và không có bundle bản đồ nào được nạp ở đây.
 *
 * CHỈ `DiscoverPlaces` chạm API. Nó được bọc `Suspense` để phần tĩnh hiển thị ngay, và tự bắt lỗi
 * bên trong (xem chú thích trong chính component) — nên một sự cố API chỉ thu nhỏ đúng khối đó,
 * không bao giờ đẩy cả trang chủ sang `error.tsx`.
 */
export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(buildWebSiteJsonLd(SITE, HOME_DESCRIPTION)),
        }}
      />

      <HomeHero />
      <CategoryLinks />

      <Suspense fallback={<DiscoverPlacesSkeleton />}>
        <DiscoverPlaces />
      </Suspense>

      <MapCta />
      <OwnerCta />
    </>
  );
}
