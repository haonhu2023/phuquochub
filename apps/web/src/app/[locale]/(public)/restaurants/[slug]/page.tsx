import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getMenu,
  getRestaurant,
  type MenuSection,
  type RestaurantDetail,
} from '@/modules/restaurants/api/restaurants.api';
import { ApiError } from '@/lib/http';
import { buildBreadcrumbJsonLd, buildRestaurantJsonLd, serializeJsonLd } from '@/lib/structured-data';
import { PRICE_VERIFYING_TEXT } from '@/modules/places/trust';
import { localizedHref, type Locale } from '@/lib/locale';
import { buildRouteAlternates, isEnDetailIndexable, NOINDEX_FOLLOW } from '@/lib/seo';

const BREADCRUMB_HOME_LABEL: Record<Locale, string> = { vi: 'Trang chủ', en: 'Home' };
const BREADCRUMB_RESTAURANTS_LABEL: Record<Locale, string> = { vi: 'Nhà hàng', en: 'Restaurants' };

interface Params {
  params: Promise<{ slug: string; locale: string }>;
}

// Phase 20 (EN indexation gate) — xem hotels/[slug]/page.tsx cho ghi chú đầy đủ; cùng nguồn sự
// thật DUY NHẤT `isEnDetailIndexable`, không tự suy đoán ở từng trang chi tiết entity.
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, locale: localeParam } = await params;
  const locale = localeParam as Locale;
  try {
    const r = await getRestaurant(slug);
    const path = `/restaurants/${r.slug}`;
    const enIndexable = isEnDetailIndexable(r.slug);
    const { canonical, languages: fullLanguages } = buildRouteAlternates(locale, path);
    const languages = enIndexable ? fullLanguages : { vi: fullLanguages.vi, 'x-default': fullLanguages.vi };
    return {
      title: `${r.name} · Nhà hàng · PhuQuocHub`,
      description: r.short_description ?? undefined,
      alternates: { canonical, languages },
      ...(locale === 'en' && !enIndexable ? { robots: NOINDEX_FOLLOW } : {}),
    };
  } catch {
    return { title: 'Nhà hàng · PhuQuocHub' };
  }
}

// Chi tiết nhà hàng = Place base + ẩm thực + thực đơn (satellite ADR-002).
export default async function RestaurantDetailPage({ params }: Params) {
  const { slug, locale: localeParam } = await params;
  const locale = localeParam as Locale;
  let r: RestaurantDetail;
  try {
    r = await getRestaurant(slug);
  } catch (err) {
    // PLACE-041: phân biệt 404 với lỗi khác — xem hotels/[slug]/page.tsx cho ghi chú đầy đủ.
    if (err instanceof ApiError && err.isNotFound) {
      notFound();
    }
    throw err;
  }
  // Thực đơn qua endpoint riêng (:id/menu); lỗi → rỗng.
  let menu: MenuSection[] = [];
  try {
    menu = await getMenu(r.id);
  } catch {
    menu = [];
  }

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildRestaurantJsonLd(r)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            buildBreadcrumbJsonLd([
              { name: BREADCRUMB_HOME_LABEL[locale], path: localizedHref(locale, '/') },
              { name: BREADCRUMB_RESTAURANTS_LABEL[locale], path: localizedHref(locale, '/restaurants') },
              { name: r.name, path: localizedHref(locale, `/restaurants/${r.slug}`) },
            ]),
          ),
        }}
      />
      <nav aria-label="Breadcrumb" style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1rem' }}>
        <Link href={localizedHref(locale, '/')} style={{ color: '#6b7280' }}>
          {BREADCRUMB_HOME_LABEL[locale]}
        </Link>
        {' / '}
        <Link href={localizedHref(locale, '/restaurants')} style={{ color: '#6b7280' }}>
          {BREADCRUMB_RESTAURANTS_LABEL[locale]}
        </Link>
        {' / '}
        <span aria-current="page">{r.name}</span>
      </nav>
      <h1>{r.name}</h1>
      {r.address && <p style={{ color: '#4b5563' }}>{r.address}</p>}
      {r.description && <p>{r.description}</p>}
      {r.cuisines.length > 0 && <p style={{ color: '#6b7280' }}>Ẩm thực: {r.cuisines.join(' · ')}</p>}

      {/* Public Beta price trust gate (2026-08-28): `restaurant_menu_items.price` KHÔNG có cột
          verification/trust nào ở DB (migration InitRestaurant) — không có bằng chứng nào để
          gate theo TỪNG món, và place.verification_status của Place cha KHÔNG được dùng làm proxy
          (một place đã xác minh không có nghĩa TỪNG giá món trong thực đơn đã được đối chiếu).
          Fail-closed: ẩn raw price ở mọi món, MỘT dòng đang xác minh dùng chung cho cả section
          (không lặp lại cho từng món) khi section có ít nhất một món đã nhập giá. Tên/mô tả món
          KHÔNG bị ẩn — chỉ giá trị tiền mới là dữ liệu chưa có bằng chứng xác minh. */}
      {menu.map((s) => {
        const hasPricedItem = s.items.some((i) => i.price !== null);
        return (
          <section key={s.id}>
            <h2>{s.name}</h2>
            <ul>
              {s.items.map((i) => (
                <li key={i.id}>{i.name}</li>
              ))}
            </ul>
            {hasPricedItem && <p>{PRICE_VERIFYING_TEXT}</p>}
          </section>
        );
      })}
    </article>
  );
}
