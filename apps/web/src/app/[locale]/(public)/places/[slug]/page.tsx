import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { getPlace } from '@/modules/places/api/places.api';
import { getBeachPublicDetails, type BeachSource } from '@/modules/beaches/api/beaches.api';
import { placeDetailHref, specialisedRouteFor } from '@/modules/places/placeRoutes';
import { formatPriceRange } from '@/modules/places/format';
import { getOpeningToday, getOpeningWeek, hasOpeningHours } from '@/modules/places/openingHours';
import {
  canDisplayPrice,
  formatVerifiedAt,
  getTrustBadge,
  isPendingVerification,
  pendingDisclosureText,
  priceVerifyingText,
  resolvePriceDisplay,
  summarizeTrustSources,
  trustBadgeLabel,
} from '@/modules/places/trust';
import { getPlaceAboutTitle, getPlaceDetailCopy } from '@/modules/places/placeDetail.copy';
import { ApiError } from '@/lib/http';
import type { PlaceContact, PlaceDetail, VerificationStatusValue } from '@/modules/places/types';
import { PlaceGallery } from '@/modules/places/PlaceGallery';
import styles from '@/modules/places/places.module.css';
import { buildBreadcrumbJsonLd, buildPlaceJsonLd, serializeJsonLd } from '@/lib/structured-data';
import { listReviews } from '@/modules/reviews/api/reviews.api';
import { ReviewsSection } from '@/modules/reviews/ReviewsSection';
import { getPlaceMapLinks } from '@/modules/map/mapLinks';
import type { Review } from '@/modules/reviews/types';
import { ClaimCta } from '@/modules/business-claims/ClaimCta';
import { ProposeEditCta } from '@/modules/place-edit-proposals/ProposeEditCta';
import { localizedHref, type Locale } from '@/lib/locale';
import { buildRouteAlternates, isEnDetailIndexable, NOINDEX_FOLLOW } from '@/lib/seo';

const BREADCRUMB_HOME_LABEL: Record<Locale, string> = { vi: 'Trang chủ', en: 'Home' };
const BREADCRUMB_PLACES_LABEL: Record<Locale, string> = { vi: 'Địa điểm', en: 'Places' };

interface Params {
  params: Promise<{ slug: string; locale: string }>;
}

const SITE = 'PhuQuocHub';

/**
 * Trang duyệt tương ứng với `category_slug`, dùng cho một mắt breadcrumb bổ sung.
 *
 * CHỈ khai những danh mục thực sự có trang duyệt riêng mà Place này là nội dung của nó. Hotel/
 * Restaurant/Tour KHÔNG nằm ở đây: chúng có trang chi tiết riêng (/hotels/[slug]…) nên một
 * Place thuộc các nhóm đó hiếm khi được xem qua /places/[slug]; thêm vào sẽ gợi ý sai rằng
 * trang đang xem thuộc luồng chi tiết của nhóm ấy. Danh mục không có trong bảng này giữ nguyên
 * breadcrumb cũ (Trang chủ / Địa điểm / …).
 */
const BROWSE_LISTING_BY_CATEGORY: Record<string, { href: string; label: Record<Locale, string> }> = {
  attraction: { href: '/attractions', label: { vi: 'Điểm tham quan', en: 'Attractions' } },
  beach: { href: '/beaches', label: { vi: 'Bãi biển', en: 'Beaches' } },
};

function metaDescription(place: PlaceDetail): string | undefined {
  if (place.short_description) return place.short_description;
  if (place.description) return place.description.slice(0, 157).trimEnd() + '…';
  return undefined;
}

// SEO: ưu tiên field mô tả sẵn có; API hiện chưa expose seo_title/seo_description riêng
// → fallback name / short_description / description. Không để lỗi/slug sai làm crash.
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, locale: localeParam } = await params;
  const locale = localeParam as Locale;
  let place: PlaceDetail;
  try {
    place = await getPlace(slug, locale);
  } catch {
    return { title: `Địa điểm · ${SITE}` };
  }

  const title = `${place.name} · ${SITE}`;
  const description = metaDescription(place);
  const image = place.cover_image_url ?? place.media[0]?.url ?? undefined;
  const path = `/places/${place.slug}`;
  // Phase 20 (EN indexation gate): `alternates.languages` (hreflang) và `robots` chỉ được phát
  // hreflang="en" / index=true khi trang EN THẬT SỰ có nội dung tiếng Anh đã duyệt — không phải vì
  // route `/en/places/{slug}` trả 200 (nó luôn trả 200, chỉ là lùi về nguyên văn tiếng Việt khi
  // chưa có bản dịch). `isEnDetailIndexable` là NGUỒN SỰ THẬT DUY NHẤT cho quyết định này. Chưa đủ
  // điều kiện → KHÔNG phát hreflang="en" (không quảng cáo một bản thay thế chưa thật sự tồn tại),
  // chỉ giữ `vi` (nguồn gốc) + `x-default` trỏ về `vi`.
  const enIndexable = isEnDetailIndexable({
    displayNameEnApproved: place.en_display_name_approved,
    shortDescriptionEnApproved: place.en_short_description_approved,
  });
  const { canonical, languages: fullLanguages } = buildRouteAlternates(locale, path);
  const languages = enIndexable ? fullLanguages : { vi: fullLanguages.vi, 'x-default': fullLanguages.vi };

  return {
    title,
    description,
    alternates: { canonical, languages },
    ...(locale === 'en' && !enIndexable ? { robots: NOINDEX_FOLLOW } : {}),
    openGraph: {
      title,
      description,
      type: 'article',
      ...(image ? { images: [{ url: image, alt: place.name }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
    },
  };
}

// Server Component: chi tiết địa điểm (khớp openapi Place — contacts/prices/media/faqs).
// Nguồn của mùa tham khảo/cứu hộ/lưu ý: luôn hiển thị kèm nguồn thật (tên + liên kết), không suy ra từ text.
function BeachSourceNote({ source }: { source: BeachSource | null }) {
  if (!source) return null;
  const label = source.title ?? source.url ?? '(không có tiêu đề)';
  return (
    <>
      {' — Nguồn: '}
      {source.url ? (
        <a href={source.url} target="_blank" rel="noopener noreferrer">
          {label}
        </a>
      ) : (
        label
      )}
    </>
  );
}

export default async function PlaceDetailPage({ params }: Params) {
  const { slug, locale: localeParam } = await params;
  const locale = localeParam as Locale;
  let place: PlaceDetail;
  try {
    place = await getPlace(slug, locale);
  } catch (err) {
    // Phân biệt: resource không tồn tại (404) → notFound(); lỗi khác → ném lên error.tsx.
    if (err instanceof ApiError && err.isNotFound) {
      notFound();
    }
    throw err;
  }

  // Khách sạn/nhà hàng/tour có trang chuyên biệt (xem placeRoutes.ts): chuyển sang đó để không có
  // hai URL cùng nội dung. Chỉ chạy SAU khi getPlace trả về địa điểm công khai, nên không lộ địa
  // điểm chưa published. Trang đích không chuyển hướng ngược lại, nên không tạo vòng lặp.
  // permanentRedirect nằm NGOÀI try/catch ở trên vì nó ném lỗi có chủ đích.
  if (specialisedRouteFor(place.category_slug)) {
    permanentRedirect(placeDetailHref(locale, place.slug, place.category_slug));
  }

  // Đánh giá là khối phụ trợ — lỗi ở đây không được làm sập cả trang chi tiết Place.
  let reviews: Review[] = [];
  try {
    reviews = await listReviews(place.id);
  } catch {
    reviews = [];
  }

  const browseListing = place.category_slug
    ? BROWSE_LISTING_BY_CATEGORY[place.category_slug]
    : undefined;
  // Giờ mở cửa tính ở máy chủ và QUY VỀ múi giờ của địa điểm (xem modules/places/openingHours.ts).
  // An toàn vì `getPlace` fetch với `cache: 'no-store'` — Server Component chạy lại mỗi request,
  // nên "đang mở cửa" không bị đóng băng theo cache trang.
  const hasHours = hasOpeningHours(place.opening_hours);
  const openingToday = getOpeningToday(place.opening_hours, new Date(), locale);
  const openingWeek = getOpeningWeek(place.opening_hours, new Date(), locale);
  // Public Beta price trust gate (2026-08-28): price_range của MỌI place — bất kể category — chỉ
  // hiển thị giá trị THẬT khi verification_status đã tin cậy (canDisplayPrice, places/trust.ts).
  // Chưa tin cậy thì thay bằng PRICE_VERIFYING_TEXT (không bao giờ giá trị thật), CHỈ khi thật sự
  // có price_range để ẩn (place chưa từng nhập giá thì không bịa ra một dòng "đang xác minh" cho
  // thứ chưa tồn tại). KHÔNG còn phụ thuộc category: bản trước chỉ ẩn giá cho category "thương
  // mại" (isCommercialCategory) — rủi ro rò giá sai của một attraction/beach/market chưa xác minh
  // là như nhau, gate này không được phép đoán qua category.
  const { label: priceLabel, verifying: showPriceVerifying } = resolvePriceDisplay(
    formatPriceRange(place.price_range, locale),
    place.verification_status,
  );
  // Trust & Freshness Surface: badge suy từ verification_status theo CHÍNH SÁCH đã có ở backend
  // (verified/official/community_verified = tin cậy; expired = đã lâu chưa xác minh lại — job
  // expireOverdue() đã hạ nó xuống đây, không phải một ngưỡng ngày tự đặt ở web). 'unverified'
  // KHÔNG hiện badge cạnh tiêu đề (cùng nguyên tắc opening-hours 'unknown' bên dưới) — chỉ hiện
  // một dòng giải thích nhẹ trong trustNote.
  const trustBadge = getTrustBadge(place.verification_status);
  const trustSource = summarizeTrustSources(place.trust_sources, locale);
  const verifiedAtLabel = place.verified_at ? formatVerifiedAt(place.verified_at, locale) : null;
  const hasInfo = place.address || place.ward || priceLabel || showPriceVerifying || hasHours;
  // Lỗi thật đã sửa 16/10/2026: trước đây CHỈ mở toạ độ (`?q=lat,lng`) — Google Maps hiện điểm
  // ghim, không hiện hồ sơ địa điểm. `getPlaceMapLinks` ưu tiên tìm theo tên(+địa chỉ), nhãn nói
  // rõ đây là tìm kiếm (chưa xác nhận đúng hồ sơ) trừ khi có Google Place ID đã đối chiếu (hiện
  // CHƯA có cơ chế dashboard nào để gắn Place ID — xem mapLinks.ts).
  const mapLinks = getPlaceMapLinks(
    { lat: place.location.lat, lng: place.location.lng, name: place.name, address: place.address },
    locale,
  );
  // Public Beta price trust gate — "Giá dịch vụ" (2026-08-28): mỗi dòng `PlacePrice` đã mang sẵn
  // `verification_status` RIÊNG của chính bản ghi giá đó (price_history.verification_status,
  // KHÔNG phải verification_status của place) — dùng ĐÚNG field đó, cùng canDisplayPrice() dùng
  // cho price_range, không suy ra trust của một dòng giá từ trust của place chứa nó. MỘT dòng
  // disclosure DÙNG CHUNG cho cả mục thay vì lặp lại cho từng dòng giá chưa xác minh.
  const trustedPrices = place.prices.filter((p) => canDisplayPrice(p.verification_status));
  const hasUnverifiedPrices = place.prices.some((p) => !canDisplayPrice(p.verification_status));
  const copy = getPlaceDetailCopy(locale);
  // Chi tiết bãi biển: chỉ tải khi category là beach; lỗi đọc không được làm hỏng trang địa điểm.
  // Chỉ coi là có dữ liệu khi ít nhất một trường có giá trị — object rỗng không tạo mục (không hiện tiêu đề trống).
  const beachPublicDetails =
    place.category_slug === 'beach' ? await getBeachPublicDetails(slug, locale).catch(() => null) : null;
  const beachDetails = beachPublicDetails?.beach_details ?? null;
  const beach =
    beachDetails &&
    [
      beachDetails.access_route,
      beachDetails.characteristics,
      beachDetails.services,
      beachDetails.best_season,
      beachDetails.lifeguard_info,
      beachDetails.sourced_notes,
    ].some(Boolean)
      ? beachDetails
      : null;
  // amenities độc lập với beach_details (xem BeachPublicDetails's ghi chú) — có thể có dữ liệu dù
  // beach_details rỗng/chưa tồn tại, nên tính riêng, không gộp vào điều kiện `beach` ở trên.
  const beachAmenities = beachPublicDetails?.amenities ?? [];

  return (
    <article className={styles.detail}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildPlaceJsonLd(place)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(
            buildBreadcrumbJsonLd([
              { name: BREADCRUMB_HOME_LABEL[locale], path: localizedHref(locale, '/') },
              { name: BREADCRUMB_PLACES_LABEL[locale], path: localizedHref(locale, '/places') },
              ...(browseListing
                ? [{ name: browseListing.label[locale], path: localizedHref(locale, browseListing.href) }]
                : []),
              { name: place.name, path: localizedHref(locale, `/places/${place.slug}`) },
            ]),
          ),
        }}
      />
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link href={localizedHref(locale, '/')}>{BREADCRUMB_HOME_LABEL[locale]}</Link>
        <span className={styles.sep}>/</span>
        <Link href={localizedHref(locale, '/places')}>{BREADCRUMB_PLACES_LABEL[locale]}</Link>
        {browseListing && (
          <>
            <span className={styles.sep}>/</span>
            <Link href={localizedHref(locale, browseListing.href)}>{browseListing.label[locale]}</Link>
          </>
        )}
        <span className={styles.sep}>/</span>
        <span aria-current="page">{place.name}</span>
      </nav>

      <header className={styles.detailHeader}>
        <h1 className={styles.detailTitle}>{place.name}</h1>
        <p className={styles.detailSub}>
          {place.ward && <span>{place.ward}</span>}
          {place.rating_avg !== null && (
            <span className={styles.rating}>
              ★ {place.rating_avg.toFixed(1)}
              {place.rating_count > 0 ? ` (${place.rating_count})` : ''}
            </span>
          )}
          {/* 'unverified' KHÔNG hiện badge cạnh tiêu đề — cùng nguyên tắc badge giờ mở cửa ngay
              dưới: một badge trung tính ở đây chỉ là tiếng ồn, dòng trustNote bên dưới đã nói rõ. */}
          {trustBadge !== 'unverified' && (
            <span
              className={`${styles.badge} ${
                trustBadge === 'verified' ? styles.badgeVerified : styles.badgeStale
              }`}
            >
              {trustBadgeLabel(trustBadge, locale)}
            </span>
          )}
          {/* Đang mở / đã đóng đứng cạnh tên: đây là thứ quyết định "có đi bây giờ không". Khi
              chưa có dữ liệu thì KHÔNG hiện gì — một badge "chưa có thông tin" cạnh tiêu đề chỉ
              là tiếng ồn, phần giải thích đã nằm trong khối Thông tin bên dưới. */}
          {openingToday.state !== 'unknown' && (
            <span
              className={`${styles.badge} ${
                openingToday.state === 'open' ? styles.badgeOpen : styles.badgeClosed
              }`}
            >
              {openingToday.label}
            </span>
          )}
        </p>
        <TrustNote
          badge={trustBadge}
          rawStatus={place.verification_status}
          verifiedAtLabel={verifiedAtLabel}
          sourceLabel={trustSource.label}
          sourceUrl={trustSource.url}
          locale={locale}
        />
      </header>

      <ClaimCta placeId={place.id} placeName={place.name} locale={locale} />
      <ProposeEditCta placeId={place.id} placeName={place.name} placeSlug={place.slug} locale={locale} />

      <PlaceGallery media={place.media} placeName={place.name} />

      {place.description && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{getPlaceAboutTitle(locale, place.category_slug)}</h2>
          <p>{place.description}</p>
        </section>
      )}

      {beach && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Thông tin bãi biển</h2>
          <dl className={styles.infoGrid}>
            {beach.access_route && (
              <div className={styles.infoItem}>
                <dt>Đường vào</dt>
                <dd>{beach.access_route}</dd>
              </div>
            )}
            {beach.characteristics && (
              <div className={styles.infoItem}>
                <dt>Đặc điểm bãi</dt>
                <dd>{beach.characteristics}</dd>
              </div>
            )}
            {beach.services && (
              <div className={styles.infoItem}>
                <dt>Dịch vụ tại bãi</dt>
                <dd>{beach.services}</dd>
              </div>
            )}
            {beach.best_season && (
              <div className={styles.infoItem}>
                <dt>Mùa tham khảo</dt>
                <dd>
                  {beach.best_season}
                  <BeachSourceNote source={beach.best_season_source} />
                </dd>
              </div>
            )}
            {beach.lifeguard_info && (
              <div className={styles.infoItem}>
                <dt>Thông tin cứu hộ</dt>
                <dd>
                  {beach.lifeguard_info}
                  <BeachSourceNote source={beach.lifeguard_info_source} />
                </dd>
              </div>
            )}
            {beach.sourced_notes && (
              <div className={styles.infoItem}>
                <dt>Lưu ý</dt>
                <dd>
                  {beach.sourced_notes}
                  <BeachSourceNote source={beach.sourced_notes_source} />
                </dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {/* Bug thiếu đã sửa (2026-10-11): cùng khuôn hotels/[slug] và restaurants/[slug] — bãi biển
          cũng dùng CHUNG bảng place_amenities, chỉ chưa từng được render ở trang này. */}
      {beachAmenities.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Tiện nghi</h2>
          <p>{beachAmenities.map((a) => a.label_vi).join(' · ')}</p>
        </section>
      )}

      {hasInfo && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{copy.sectionInfo}</h2>
          <dl className={styles.infoGrid}>
            {place.address && (
              <div className={styles.infoItem}>
                <dt className={styles.infoLabel}>{copy.labelAddress}</dt>
                <dd className={styles.infoValue}>{place.address}</dd>
              </div>
            )}
            {place.ward && (
              <div className={styles.infoItem}>
                <dt className={styles.infoLabel}>{copy.labelWard}</dt>
                <dd className={styles.infoValue}>{place.ward}</dd>
              </div>
            )}
            {(priceLabel || showPriceVerifying) && (
              <div className={styles.infoItem}>
                <dt className={styles.infoLabel}>{copy.labelPrice}</dt>
                <dd className={styles.infoValue}>{priceLabel ?? priceVerifyingText(locale)}</dd>
              </div>
            )}
            {hasHours && (
              <div className={styles.infoItem}>
                <dt className={styles.infoLabel}>{copy.labelHours}</dt>
                <dd className={styles.infoValue}>
                  {openingToday.hours ?? copy.noHoursInfo}
                  {openingToday.note && ` — ${openingToday.note}`}
                </dd>
              </div>
            )}
          </dl>

          {/* Lịch tuần trong <details>: hôm nay đã hiện sẵn ở trên, cả tuần chỉ cần khi người đọc
              đang lên kế hoạch cho ngày khác. Mặc định đóng để khối Thông tin không bị đẩy dài. */}
          {openingWeek.length > 0 && (
            <details className={styles.faq}>
              <summary>{copy.weekHoursSummary}</summary>
              <ul className={styles.hoursWeek}>
                {openingWeek.map((row) => (
                  <li
                    key={row.key}
                    className={`${styles.hoursRow} ${row.isToday ? styles.hoursToday : ''}`}
                  >
                    <span>{row.label}</span>
                    <span>{row.hours}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {mapLinks && (
            <p>
              <a className={styles.mapLink} href={mapLinks.primary.url} target="_blank" rel="noopener noreferrer">
                {mapLinks.primary.label}
              </a>
              {' · '}
              <a className={styles.mapLink} href={mapLinks.referencePin.url} target="_blank" rel="noopener noreferrer">
                {mapLinks.referencePin.label}
              </a>
            </p>
          )}
        </section>
      )}

      {place.contacts.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{copy.sectionContact}</h2>
          <ul className={styles.list}>
            {place.contacts.map((c) => (
              <li key={c.id} className={styles.listItem}>
                <span className={styles.infoLabel}>{c.label ?? c.contact_type}</span>
                <ContactValue contact={c} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {place.prices.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{copy.sectionPrices}</h2>
          {trustedPrices.length > 0 && (
            <ul className={styles.list}>
              {trustedPrices.map((p) => (
                <li key={p.id} className={styles.listItem}>
                  <span>{p.service_name}</span>
                  <span>
                    {p.is_free
                      ? copy.free
                      // `trustedPrices` đã lọc canDisplayPrice() ở trên nên `amount` LUÔN có giá trị
                      // thật ở đây — API chỉ trả null cho bản ghi CHƯA tin cậy (đã bị lọc ra). Guard
                      // `!== null` chỉ để khớp kiểu `number | null` của contract, không phải một
                      // nhánh dữ liệu thật sự xảy ra.
                      : p.amount !== null
                        ? `${p.amount.toLocaleString('vi-VN')} ${p.currency}${p.unit ? ` / ${p.unit}` : ''}`
                        : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {hasUnverifiedPrices && <p className={styles.trustNote}>{priceVerifyingText(locale)}</p>}
        </section>
      )}

      {place.faqs.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{copy.sectionFaq}</h2>
          {place.faqs.map((f) => (
            <details key={f.id} className={styles.faq}>
              <summary>{f.question}</summary>
              <p>{f.answer}</p>
            </details>
          ))}
        </section>
      )}

      <ReviewsSection placeId={place.id} initialReviews={reviews} />
    </article>
  );
}

/**
 * Dòng giải thích nhẹ dưới badge trạng thái xác minh (Place Trust & Freshness Surface).
 *
 * Ba nhánh khớp `TrustBadge` (places/trust.ts):
 *  - `verified`: chỉ nói những gì CÓ BẰNG CHỨNG — nguồn (nếu có attribution) + ngày kiểm tra lần
 *    cuối (nếu có `verified_at`). Không có gì trong hai thứ đó thì không render dòng nào (badge ở
 *    header đã đủ nói "Đã xác minh"; không thêm một câu chung chung không có dữ kiện đứng sau).
 *  - `stale`: đã từng tin cậy, nay `expired`. Nếu còn `verified_at` (job hết hạn KHÔNG xoá nó),
 *    nói rõ đó là lần xác minh GẦN NHẤT, không phải hiện tại.
 *  - `unverified`: KHÔNG có badge ở header (xem trang gọi) — đây là nơi DUY NHẤT người đọc thấy
 *    "Chưa xác minh", như một dòng chữ trung tính, không phải một phán quyết tiêu cực.
 */
function TrustNote({
  badge,
  rawStatus,
  verifiedAtLabel,
  sourceLabel,
  sourceUrl,
  locale,
}: {
  badge: 'verified' | 'stale' | 'unverified';
  rawStatus: VerificationStatusValue;
  verifiedAtLabel: string | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
  locale: Locale;
}) {
  const copy = getPlaceDetailCopy(locale);

  if (badge === 'verified') {
    if (!sourceLabel && !verifiedAtLabel) return null;
    return (
      <p className={styles.trustNote}>
        {sourceLabel && (
          <>
            {sourceLabel}
            {sourceUrl && (
              <>
                {' '}
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
                  {copy.viewSource}
                </a>
              </>
            )}
          </>
        )}
        {sourceLabel && verifiedAtLabel && ' '}
        {verifiedAtLabel && copy.lastChecked(verifiedAtLabel)}
      </p>
    );
  }

  if (badge === 'stale') {
    return <p className={styles.trustNote}>{verifiedAtLabel ? copy.staleWithDate(verifiedAtLabel) : copy.staleNoDate}</p>;
  }

  // Public Beta trust disclosure (2026-08-27): `pending` ĐÚNG NGHĨA (chưa ai xem tới) đổi sang câu
  // này — `rejected` (đã bị từ chối, một trạng thái thật khác) VẪN giữ câu cũ bên dưới, không gộp
  // chung dù cả hai cùng rơi vào badge "unverified".
  if (isPendingVerification(rawStatus)) {
    return <p className={styles.trustNote}>{pendingDisclosureText(locale)}</p>;
  }

  return <p className={styles.trustNote}>{copy.unverifiedNote}</p>;
}

function contactHref(type: string, value: string): string | null {
  const t = type.toLowerCase();
  if (/phone|hotline|mobile|tel|zalo/.test(t) && /^[+\d][\d\s().-]+$/.test(value)) {
    return `tel:${value.replace(/[^+\d]/g, '')}`;
  }
  if (/mail/.test(t)) return `mailto:${value}`;
  if (/^https?:\/\//i.test(value)) return value;
  return null;
}

function ContactValue({ contact }: { contact: PlaceContact }) {
  const href = contactHref(contact.contact_type, contact.value);
  if (!href) return <span>{contact.value}</span>;
  const external = href.startsWith('http');
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {contact.value}
    </a>
  );
}
