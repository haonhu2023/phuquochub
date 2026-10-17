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
import { PRICE_VERIFYING_TEXT, canDisplayPrice } from '@/modules/places/trust';
import { PlaceGallery } from '@/modules/places/PlaceGallery';
import { localizedHref, type Locale } from '@/lib/locale';
import { buildRouteAlternates, isEnDetailIndexable, NOINDEX_FOLLOW } from '@/lib/seo';
import { getOpeningToday, getOpeningWeek, hasOpeningHours } from '@/modules/places/openingHours';
import { getPlaceDetailCopy } from '@/modules/places/placeDetail.copy';
import { getPlaceMapLinks } from '@/modules/map/mapLinks';
import placesStyles from '@/modules/places/places.module.css';

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
    const r = await getRestaurant(slug, locale);
    const path = `/restaurants/${r.slug}`;
    const enIndexable = isEnDetailIndexable({
      displayNameEnApproved: r.en_display_name_approved,
      shortDescriptionEnApproved: r.en_short_description_approved,
    });
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
// Giá món: số + tiền tệ rõ ràng. Giá null được xử lý ở chỗ gọi (không bao giờ hiển thị 0).
function formatMenuPrice(amount: number, currency: string): string {
  return `${new Intl.NumberFormat("vi-VN").format(amount)} ${currency}`;
}

// Ngày ghi nhận giá (YYYY-MM-DD) hiển thị dd/mm/yyyy, không đổi múi giờ.
function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export default async function RestaurantDetailPage({ params }: Params) {
  const { slug, locale: localeParam } = await params;
  const locale = localeParam as Locale;
  let r: RestaurantDetail;
  try {
    r = await getRestaurant(slug, locale);
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
  const openingWeek = getOpeningWeek(r.opening_hours, new Date(), locale);

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
      {/* Lỗi thật đã sửa 16/10/2026: trước đây CHỈ mở toạ độ — xem ghi chú đầy đủ ở mapLinks.ts.
          `googlePlaceId: r.google_place_id` (bổ sung cùng ngày) — API chỉ trả giá trị này khi ĐỦ
          ĐIỀU KIỆN (đã xác minh, xem PlaceExternalIdentifiersService's ghi chú); `null` thì helper
          tự fallback sang tìm theo tên/địa chỉ, không cần if/else riêng ở đây. */}
      {(() => {
        const mapLinks = getPlaceMapLinks(
          { lat: r.location.lat, lng: r.location.lng, name: r.name, address: r.address, googlePlaceId: r.google_place_id },
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

      <PlaceGallery media={r.media} placeName={r.name} />

      {r.description && <p className={placesStyles.longText}>{r.description}</p>}
      {r.cuisines.length > 0 && (
        <p style={{ color: '#6b7280' }}>Ẩm thực: {r.cuisines.map((c) => c.label_vi).join(' · ')}</p>
      )}
      {r.restaurant_details?.is_local_specialty && <p style={{ color: '#6b7280' }}>Có phục vụ đặc sản Phú Quốc</p>}

      {r.amenities.length > 0 && (
        <section>
          <h2>Tiện nghi</h2>
          <p>{r.amenities.map((a) => a.label_vi).join(' · ')}</p>
        </section>
      )}

      {r.contacts.length > 0 && (
        <section>
          <h2>Liên hệ</h2>
          <ul>
            {r.contacts.map((c) => (
              <li key={c.id}>
                {c.label ?? c.contact_type}: {c.value}
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasOpeningHours(r.opening_hours) && (
        <section>
          <h2>Giờ mở cửa</h2>
          <p>{getOpeningToday(r.opening_hours, new Date(), locale).hours ?? 'Chưa có thông tin'}</p>
          {/* Bug thiếu đã sửa (2026-10-11): places/[slug]/page.tsx đã có bảng giờ cả tuần từ trước
              (getOpeningWeek, đã test đầy đủ) — trang nhà hàng riêng trước đây chỉ gọi
              getOpeningToday(), chưa từng hiện phần này dù dữ liệu/hàm đã sẵn có. */}
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

      {/* Giá tham khảo/người qua price_history (SSOT giá dùng chung mọi category) — bug thật đã sửa
          (2026-09-30, phát hiện qua rà soát P2): `r.prices` LUÔN có mặt (RestaurantDetail kế thừa
          PlaceDetail) nhưng trang này chưa từng render, dù places/[slug]/page.tsx đã có khối này.
          KHÁC với giá món trong menu bên dưới (không có trust column riêng) — đây là bản ghi
          price_history CÓ verification_status riêng, gate đúng canDisplayPrice() của CHÍNH nó. */}
      {r.prices.length > 0 && (
        <section>
          <h2>Giá tham khảo</h2>
          {r.prices.filter((p) => canDisplayPrice(p.verification_status)).length > 0 && (
            <ul>
              {r.prices
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
          {r.prices.some((p) => !canDisplayPrice(p.verification_status)) && <p>{PRICE_VERIFYING_TEXT}</p>}
        </section>
      )}

      {/* Giá món (quyết định sản phẩm 07/10/2026): hiện giá đã được cơ sở/nguồn cung cấp qua quyền/kiểm duyệt
          hiện có. Giá null = CHƯA CÓ GIÁ (không phải miễn phí). Thiếu đơn vị/ngày ghi nhận/nguồn được nói rõ là
          "chưa rõ", không suy đoán và không gọi là đã xác minh. Ngày sửa bản ghi KHÔNG phải ngày ghi nhận giá. */}
      {menu.map((s) => (
        <section key={s.id}>
          <h2>{s.name}</h2>
          <ul>
            {s.items.map((i) => (
              <li key={i.id}>
                {i.is_signature && <span aria-label="Món nổi bật">★ </span>}
                {i.name}
                {" — "}
                {i.price === null ? (
                  <span>chưa có giá</span>
                ) : (
                  <span>
                    {formatMenuPrice(i.price, i.currency)}
                    {i.price_unit ? ` / ${i.price_unit}` : " (chưa rõ đơn vị)"}
                    {i.price_recorded_on
                      ? `, ghi nhận ngày ${formatIsoDate(i.price_recorded_on)}`
                      : ", chưa rõ ngày ghi nhận"}
                    {i.price_source ? (
                      <>
                        {" — Nguồn giá: "}
                        {i.price_source.url ? (
                          <a href={i.price_source.url} target="_blank" rel="noopener noreferrer">
                            {i.price_source.title ?? i.price_source.url}
                          </a>
                        ) : (
                          i.price_source.title ?? "(không có tiêu đề)"
                        )}
                      </>
                    ) : (
                      " — chưa rõ nguồn giá"
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
