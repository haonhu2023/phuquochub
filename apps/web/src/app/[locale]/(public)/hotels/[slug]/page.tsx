import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getHotel, type HotelDetail } from '@/modules/hotels/api/hotels.api';
import { HOTEL_TYPE_LABELS } from '@/modules/hotels/types';
import { ApiError } from '@/lib/http';
import { buildBreadcrumbJsonLd, buildHotelJsonLd, serializeJsonLd } from '@/lib/structured-data';
import { PRICE_VERIFYING_TEXT, canDisplayPrice } from '@/modules/places/trust';
import { PlaceGallery } from '@/modules/places/PlaceGallery';
import { localizedHref, type Locale } from '@/lib/locale';
import { buildRouteAlternates, isEnDetailIndexable, NOINDEX_FOLLOW } from '@/lib/seo';
import { PlaceDescriptionEditor } from '@/modules/place-inline-edit/PlaceDescriptionEditor';
import { PlacePhotosButton } from '@/modules/place-photos/PlacePhotosButton';
import { getOpeningToday, getOpeningWeek, hasOpeningHours } from '@/modules/places/openingHours';
import { getPlaceDetailCopy } from '@/modules/places/placeDetail.copy';
import { getPlaceMapLinks } from '@/modules/map/mapLinks';
import { RichDescriptionRenderer } from '@/modules/rich-doc/RichDescriptionRenderer';

const BREADCRUMB_HOME_LABEL: Record<Locale, string> = { vi: 'Trang chủ', en: 'Home' };
const BREADCRUMB_HOTELS_LABEL: Record<Locale, string> = { vi: 'Khách sạn', en: 'Hotels' };
// Khoảng trống i18n thật phát hiện 16/10/2026 (nghiệm thu sau release `2889bf8`): 4 tiêu đề mục
// dưới đây hardcode tiếng Việt kể cả ở `/en`, trong khi phần còn lại của trang đã song ngữ qua
// placeDetail.copy.ts (`sectionContact`). "Liên hệ" tái dùng CHÍNH `getPlaceDetailCopy(locale)`
// đã có sẵn thay vì khai lại; 3 nhãn còn lại là riêng của trang khách sạn, theo đúng khuôn các
// hằng `Record<Locale, string>` đã có ở trên (BREADCRUMB_*).
const SECTION_HOTEL_INFO_LABEL: Record<Locale, string> = { vi: 'Thông tin khách sạn', en: 'Hotel information' };
const LABEL_HOTEL_TYPE: Record<Locale, string> = { vi: 'Loại hình', en: 'Type' };
const SECTION_AMENITIES_LABEL: Record<Locale, string> = { vi: 'Tiện nghi', en: 'Amenities' };

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
    const h = await getHotel(slug, locale);
    const path = `/hotels/${h.slug}`;
    const enIndexable = isEnDetailIndexable({
      displayNameEnApproved: h.en_display_name_approved,
      shortDescriptionEnApproved: h.en_short_description_approved,
    });
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
    h = await getHotel(slug, locale);
  } catch (err) {
    // PLACE-041: phân biệt 404 (không tồn tại) với lỗi khác (mạng/5xx) — trước đây mọi lỗi đều
    // bị coi là 404, khiến sự cố server/mạng hiển thị sai thành "không tồn tại" (khớp
    // places/[slug]/page.tsx, pattern đã đúng từ trước).
    if (err instanceof ApiError && err.isNotFound) {
      notFound();
    }
    throw err;
  }
  const openingWeek = getOpeningWeek(h.opening_hours, new Date(), locale);

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
      <h1 style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap' }}>
        {h.name}
        <PlaceDescriptionEditor placeId={h.id} />
        <PlacePhotosButton placeId={h.id} />
      </h1>
      {h.address && <p style={{ color: '#4b5563' }}>{h.address}</p>}
      {/* Lỗi thật đã sửa 16/10/2026: trước đây CHỈ mở toạ độ — xem ghi chú đầy đủ ở mapLinks.ts.
          `googlePlaceId: h.google_place_id` (bổ sung cùng ngày) — API chỉ trả giá trị này khi ĐỦ
          ĐIỀU KIỆN (đã xác minh); `null` thì helper tự fallback sang tìm theo tên/địa chỉ. */}
      {(() => {
        const mapLinks = getPlaceMapLinks(
          { lat: h.location.lat, lng: h.location.lng, name: h.name, address: h.address, googlePlaceId: h.google_place_id },
          locale,
        );
        if (!mapLinks) return null;
        return (
          <p>
            <a href={mapLinks.primary.url} target="_blank" rel="noopener noreferrer">
              {mapLinks.primary.label}
            </a>
            {/* referencePin chỉ còn khi CHƯA có hồ sơ xác nhận — xem mapLinks.ts (sửa 16/10/2026,
                owner phát hiện: ghim trần cạnh hồ sơ đã xác nhận gây hiểu nhầm). */}
            {mapLinks.referencePin && (
              <>
                {' · '}
                <a href={mapLinks.referencePin.url} target="_blank" rel="noopener noreferrer">
                  {mapLinks.referencePin.label}
                </a>
              </>
            )}
          </p>
        );
      })()}

      <PlaceGallery media={h.media} placeName={h.name} />

      {h.description && <RichDescriptionRenderer richDoc={h.description_rich} plainFallback={h.description} />}

      {h.hotel_details && (
        <section>
          <h2>{SECTION_HOTEL_INFO_LABEL[locale]}</h2>
          <dl>
            <dt>{LABEL_HOTEL_TYPE[locale]}</dt>
            <dd>{HOTEL_TYPE_LABELS[h.hotel_details.hotel_type]}</dd>
            {h.hotel_details.access_route && (
              <>
                <dt>Đường vào</dt>
                <dd>{h.hotel_details.access_route}</dd>
              </>
            )}
            {h.hotel_details.star_rating !== null && (
              <>
                <dt>Hạng sao</dt>
                <dd>
                  {'★'.repeat(h.hotel_details.star_rating)}
                  {h.hotel_details.star_rating_source && (
                    <>
                      {' — Nguồn: '}
                      {h.hotel_details.star_rating_source.url ? (
                        <a href={h.hotel_details.star_rating_source.url} target="_blank" rel="noopener noreferrer">
                          {h.hotel_details.star_rating_source.title ?? h.hotel_details.star_rating_source.url}
                        </a>
                      ) : (
                        h.hotel_details.star_rating_source.title ?? '(không có tiêu đề)'
                      )}
                    </>
                  )}
                </dd>
              </>
            )}
            {(h.hotel_details.check_in || h.hotel_details.check_out) && (
              <>
                <dt>Giờ nhận/trả phòng</dt>
                <dd>
                  {h.hotel_details.check_in ? `Nhận: ${h.hotel_details.check_in.slice(0, 5)}` : 'Chưa có thông tin nhận phòng'}
                  {' · '}
                  {h.hotel_details.check_out ? `Trả: ${h.hotel_details.check_out.slice(0, 5)}` : 'Chưa có thông tin trả phòng'}
                </dd>
              </>
            )}
            {h.hotel_details.cancellation_policy && (
              <>
                <dt>Chính sách huỷ phòng</dt>
                <dd>{h.hotel_details.cancellation_policy}</dd>
              </>
            )}
          </dl>
        </section>
      )}

      {h.amenities.length > 0 && (
        <section>
          <h2>{SECTION_AMENITIES_LABEL[locale]}</h2>
          <p>{h.amenities.map((a) => a.label_vi).join(' · ')}</p>
        </section>
      )}

      {h.contacts.length > 0 && (
        <section>
          <h2>{getPlaceDetailCopy(locale).sectionContact}</h2>
          <ul>
            {h.contacts.map((c) => (
              <li key={c.id}>
                {c.label ?? c.contact_type}: {c.value}
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasOpeningHours(h.opening_hours) && (
        <section>
          <h2>Giờ mở cửa</h2>
          <p>{getOpeningToday(h.opening_hours, new Date(), locale).hours ?? 'Chưa có thông tin'}</p>
          {/* Bug thiếu đã sửa (2026-10-11): cùng ghi chú restaurants/[slug]/page.tsx — bảng giờ cả
              tuần đã có/đã test từ trước (places/[slug]/page.tsx), trang khách sạn riêng trước đây
              chỉ hiện "giờ hôm nay". */}
          {openingWeek.length > 0 && (
            <details>
              <summary>{getPlaceDetailCopy(locale).weekHoursSummary}</summary>
              <ul>
                {openingWeek.map((row) => (
                  <li key={row.key}>
                    {row.label}: {row.hours}
                  </li>
                ))}
              </ul>
            </details>
          )}
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

      {/* Giá tham khảo qua price_history (SSOT giá dùng chung mọi category, ADR-006/ADR-019) —
          bug thật đã sửa (2026-09-30, phát hiện qua rà soát P2): `h.prices` LUÔN có mặt trong
          response (HotelDetail kế thừa PlaceDetail) nhưng trang này trước đây không render, dù
          places/[slug]/page.tsx đã có đúng khối này từ trước. Cùng nguyên tắc trust gate: amount
          chỉ hiện khi bản ghi đã đạt canDisplayPrice(), một dòng "đang xác minh" dùng chung. */}
      {h.prices.length > 0 && (
        <section>
          <h2>Giá tham khảo</h2>
          {h.prices.filter((p) => canDisplayPrice(p.verification_status)).length > 0 && (
            <ul>
              {h.prices
                .filter((p) => canDisplayPrice(p.verification_status))
                .map((p) => (
                  <li key={p.id}>
                    {p.service_name}:{' '}
                    {p.is_free
                      ? 'Miễn phí'
                      : p.amount !== null
                        ? `${p.amount.toLocaleString('vi-VN')} ${p.currency}${p.unit ? ` / ${p.unit}` : ''}`
                        : null}
                  </li>
                ))}
            </ul>
          )}
          {h.prices.some((p) => !canDisplayPrice(p.verification_status)) && <p>{PRICE_VERIFYING_TEXT}</p>}
        </section>
      )}
    </article>
  );
}
