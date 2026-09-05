import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getHotel, type HotelDetail } from '@/modules/hotels/api/hotels.api';
import { ApiError } from '@/lib/http';
import { buildBreadcrumbJsonLd, buildHotelJsonLd, serializeJsonLd } from '@/lib/structured-data';
import { PRICE_VERIFYING_TEXT } from '@/modules/places/trust';
import { localizedHref, type Locale } from '@/lib/locale';
import { buildRouteAlternates, isEnDetailIndexable, NOINDEX_FOLLOW } from '@/lib/seo';

const BREADCRUMB_HOME_LABEL: Record<Locale, string> = { vi: 'Trang chủ', en: 'Home' };
const BREADCRUMB_HOTELS_LABEL: Record<Locale, string> = { vi: 'Khách sạn', en: 'Hotels' };

interface Params {
  params: Promise<{ slug: string; locale: string }>;
}

// Phase 20 (EN indexation gate) — cùng lý do/cùng nguồn sự thật đã dùng ở
// places/[slug]/page.tsx: `isEnDetailIndexable` là điểm quyết định DUY NHẤT, không tự suy đoán ở
// từng trang chi tiết entity.
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, locale: localeParam } = await params;
  const locale = localeParam as Locale;
  try {
    const h = await getHotel(slug);
    const path = `/hotels/${h.slug}`;
    const enIndexable = isEnDetailIndexable(h.slug);
    const { canonical, languages: fullLanguages } = buildRouteAlternates(locale, path);
    const languages = enIndexable ? fullLanguages : { vi: fullLanguages.vi, 'x-default': fullLanguages.vi };
    return {
      title: `${h.name} · Khách sạn · PhuQuocHub`,
      description: h.short_description ?? undefined,
      alternates: { canonical, languages },
      ...(locale === 'en' && !enIndexable ? { robots: NOINDEX_FOLLOW } : {}),
    };
  } catch {
    return { title: 'Khách sạn · PhuQuocHub' };
  }
}

// Chi tiết khách sạn = Place base + phòng + tiện nghi (satellite ADR-002).
export default async function HotelDetailPage({ params }: Params) {
  const { slug, locale: localeParam } = await params;
  const locale = localeParam as Locale;
  let h: HotelDetail;
  try {
    h = await getHotel(slug);
  } catch (err) {
    // PLACE-041: phân biệt 404 (không tồn tại) với lỗi khác (mạng/5xx) — trước đây mọi lỗi đều
    // bị coi là 404, khiến sự cố server/mạng hiển thị sai thành "không tồn tại" (khớp
    // places/[slug]/page.tsx, pattern đã đúng từ trước).
    if (err instanceof ApiError && err.isNotFound) {
      notFound();
    }
    throw err;
  }

  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildHotelJsonLd(h)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            buildBreadcrumbJsonLd([
              { name: BREADCRUMB_HOME_LABEL[locale], path: localizedHref(locale, '/') },
              { name: BREADCRUMB_HOTELS_LABEL[locale], path: localizedHref(locale, '/hotels') },
              { name: h.name, path: localizedHref(locale, `/hotels/${h.slug}`) },
            ]),
          ),
        }}
      />
      <nav aria-label="Breadcrumb" style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1rem' }}>
        <Link href={localizedHref(locale, '/')} style={{ color: '#6b7280' }}>
          {BREADCRUMB_HOME_LABEL[locale]}
        </Link>
        {' / '}
        <Link href={localizedHref(locale, '/hotels')} style={{ color: '#6b7280' }}>
          {BREADCRUMB_HOTELS_LABEL[locale]}
        </Link>
        {' / '}
        <span aria-current="page">{h.name}</span>
      </nav>
      <h1>{h.name}</h1>
      {h.address && <p style={{ color: '#4b5563' }}>{h.address}</p>}
      {h.description && <p>{h.description}</p>}

      {h.amenities.length > 0 && (
        <section>
          <h2>Tiện nghi</h2>
          <p>{h.amenities.join(' · ')}</p>
        </section>
      )}

      {/* Public Beta price trust gate (2026-08-28): `hotel_room_types.price_ref` KHÔNG có cột
          verification/trust nào ở DB (migration InitHotel) — không có bằng chứng nào để gate theo
          TỪNG loại phòng, và place.verification_status của Place cha KHÔNG được dùng làm proxy
          (một khách sạn đã xác minh không có nghĩa TỪNG mức giá phòng đã được đối chiếu).
          Fail-closed: ẩn raw price ở mọi loại phòng, MỘT dòng đang xác minh dùng chung cho cả mục
          (không lặp lại cho từng phòng) khi có ít nhất một loại phòng đã nhập giá. */}
      {h.rooms.length > 0 && (
        <section>
          <h2>Loại phòng</h2>
          <ul>
            {h.rooms.map((r) => (
              <li key={r.id}>
                {r.name}
                {r.capacity ? ` · ${r.capacity} khách` : ''}
              </li>
            ))}
          </ul>
          {h.rooms.some((r) => r.price_ref !== null) && <p>{PRICE_VERIFYING_TEXT}</p>}
        </section>
      )}
    </article>
  );
}
