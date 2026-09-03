import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPlace } from '@/modules/places/api/places.api';
import { formatPriceRange } from '@/modules/places/format';
import { getOpeningToday, getOpeningWeek, hasOpeningHours } from '@/modules/places/openingHours';
import {
  canDisplayPrice,
  formatVerifiedAt,
  getTrustBadge,
  isPendingVerification,
  PENDING_DISCLOSURE_TEXT,
  PRICE_VERIFYING_TEXT,
  resolvePriceDisplay,
  summarizeTrustSources,
  TRUST_BADGE_LABEL,
} from '@/modules/places/trust';
import { ApiError } from '@/lib/http';
import type { PlaceContact, PlaceDetail, PlaceMedia, VerificationStatusValue } from '@/modules/places/types';
import styles from '@/modules/places/places.module.css';
import { buildPlaceJsonLd, serializeJsonLd } from '@/lib/structured-data';
import { listReviews } from '@/modules/reviews/api/reviews.api';
import { ReviewsSection } from '@/modules/reviews/ReviewsSection';
import type { Review } from '@/modules/reviews/types';
import { ClaimCta } from '@/modules/business-claims/ClaimCta';
import { localizedHref, type Locale } from '@/lib/locale';

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
const BROWSE_LISTING_BY_CATEGORY: Record<string, { href: string; label: string }> = {
  attraction: { href: '/attractions', label: 'Điểm tham quan' },
  beach: { href: '/beaches', label: 'Bãi biển' },
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
    place = await getPlace(slug);
  } catch {
    return { title: `Địa điểm · ${SITE}` };
  }

  const title = `${place.name} · ${SITE}`;
  const description = metaDescription(place);
  const image = place.cover_image_url ?? place.media[0]?.url ?? undefined;

  return {
    title,
    description,
    alternates: { canonical: localizedHref(locale, `/places/${place.slug}`) },
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
export default async function PlaceDetailPage({ params }: Params) {
  const { slug, locale: localeParam } = await params;
  const locale = localeParam as Locale;
  let place: PlaceDetail;
  try {
    place = await getPlace(slug);
  } catch (err) {
    // Phân biệt: resource không tồn tại (404) → notFound(); lỗi khác → ném lên error.tsx.
    if (err instanceof ApiError && err.isNotFound) {
      notFound();
    }
    throw err;
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
  const openingToday = getOpeningToday(place.opening_hours);
  const openingWeek = getOpeningWeek(place.opening_hours);
  // Public Beta price trust gate (2026-08-28): price_range của MỌI place — bất kể category — chỉ
  // hiển thị giá trị THẬT khi verification_status đã tin cậy (canDisplayPrice, places/trust.ts).
  // Chưa tin cậy thì thay bằng PRICE_VERIFYING_TEXT (không bao giờ giá trị thật), CHỈ khi thật sự
  // có price_range để ẩn (place chưa từng nhập giá thì không bịa ra một dòng "đang xác minh" cho
  // thứ chưa tồn tại). KHÔNG còn phụ thuộc category: bản trước chỉ ẩn giá cho category "thương
  // mại" (isCommercialCategory) — rủi ro rò giá sai của một attraction/beach/market chưa xác minh
  // là như nhau, gate này không được phép đoán qua category.
  const { label: priceLabel, verifying: showPriceVerifying } = resolvePriceDisplay(
    formatPriceRange(place.price_range),
    place.verification_status,
  );
  // Trust & Freshness Surface: badge suy từ verification_status theo CHÍNH SÁCH đã có ở backend
  // (verified/official/community_verified = tin cậy; expired = đã lâu chưa xác minh lại — job
  // expireOverdue() đã hạ nó xuống đây, không phải một ngưỡng ngày tự đặt ở web). 'unverified'
  // KHÔNG hiện badge cạnh tiêu đề (cùng nguyên tắc opening-hours 'unknown' bên dưới) — chỉ hiện
  // một dòng giải thích nhẹ trong trustNote.
  const trustBadge = getTrustBadge(place.verification_status);
  const trustSource = summarizeTrustSources(place.trust_sources);
  const verifiedAtLabel = place.verified_at ? formatVerifiedAt(place.verified_at) : null;
  const hasInfo = place.address || place.ward || priceLabel || showPriceVerifying || hasHours;
  const mapHref = `https://www.google.com/maps?q=${place.location.lat},${place.location.lng}`;
  // Public Beta price trust gate — "Giá dịch vụ" (2026-08-28): mỗi dòng `PlacePrice` đã mang sẵn
  // `verification_status` RIÊNG của chính bản ghi giá đó (price_history.verification_status,
  // KHÔNG phải verification_status của place) — dùng ĐÚNG field đó, cùng canDisplayPrice() dùng
  // cho price_range, không suy ra trust của một dòng giá từ trust của place chứa nó. MỘT dòng
  // disclosure DÙNG CHUNG cho cả mục thay vì lặp lại cho từng dòng giá chưa xác minh.
  const trustedPrices = place.prices.filter((p) => canDisplayPrice(p.verification_status));
  const hasUnverifiedPrices = place.prices.some((p) => !canDisplayPrice(p.verification_status));

  return (
    <article className={styles.detail}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildPlaceJsonLd(place)) }}
      />
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link href={localizedHref(locale, '/')}>Trang chủ</Link>
        <span className={styles.sep}>/</span>
        <Link href={localizedHref(locale, '/places')}>Địa điểm</Link>
        {browseListing && (
          <>
            <span className={styles.sep}>/</span>
            <Link href={localizedHref(locale, browseListing.href)}>{browseListing.label}</Link>
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
              {TRUST_BADGE_LABEL[trustBadge]}
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
        />
      </header>

      <ClaimCta placeId={place.id} placeName={place.name} />

      {place.media.length > 0 && (
        <div className={styles.gallery}>
          {place.media.map((m) => (
            <figure key={m.id} className={styles.galleryFigure}>
              {/* eslint-disable-next-line @next/next/no-img-element -- ảnh host bên ngoài; next/image cần remotePatterns (ngoài phạm vi). */}
              <img
                className={styles.galleryImg}
                src={m.thumbnail_url ?? m.url}
                alt={m.alt_text ?? m.caption ?? place.name}
                loading="lazy"
              />
              <MediaCredit media={m} />
            </figure>
          ))}
        </div>
      )}

      {place.description && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Giới thiệu</h2>
          <p>{place.description}</p>
        </section>
      )}

      {hasInfo && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Thông tin</h2>
          <dl className={styles.infoGrid}>
            {place.address && (
              <div className={styles.infoItem}>
                <dt className={styles.infoLabel}>Địa chỉ</dt>
                <dd className={styles.infoValue}>{place.address}</dd>
              </div>
            )}
            {place.ward && (
              <div className={styles.infoItem}>
                <dt className={styles.infoLabel}>Khu vực</dt>
                <dd className={styles.infoValue}>{place.ward}</dd>
              </div>
            )}
            {(priceLabel || showPriceVerifying) && (
              <div className={styles.infoItem}>
                <dt className={styles.infoLabel}>Mức giá</dt>
                <dd className={styles.infoValue}>{priceLabel ?? PRICE_VERIFYING_TEXT}</dd>
              </div>
            )}
            {hasHours && (
              <div className={styles.infoItem}>
                <dt className={styles.infoLabel}>Giờ mở cửa</dt>
                <dd className={styles.infoValue}>
                  {openingToday.hours ?? 'Chưa có thông tin'}
                  {openingToday.note && ` — ${openingToday.note}`}
                </dd>
              </div>
            )}
          </dl>

          {/* Lịch tuần trong <details>: hôm nay đã hiện sẵn ở trên, cả tuần chỉ cần khi người đọc
              đang lên kế hoạch cho ngày khác. Mặc định đóng để khối Thông tin không bị đẩy dài. */}
          {openingWeek.length > 0 && (
            <details className={styles.faq}>
              <summary>Giờ mở cửa cả tuần</summary>
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
          <a className={styles.mapLink} href={mapHref} target="_blank" rel="noopener noreferrer">
            Xem trên bản đồ →
          </a>
        </section>
      )}

      {place.contacts.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Liên hệ</h2>
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
          <h2 className={styles.sectionTitle}>Giá dịch vụ</h2>
          {trustedPrices.length > 0 && (
            <ul className={styles.list}>
              {trustedPrices.map((p) => (
                <li key={p.id} className={styles.listItem}>
                  <span>{p.service_name}</span>
                  <span>
                    {p.is_free
                      ? 'Miễn phí'
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
          {hasUnverifiedPrices && <p className={styles.trustNote}>{PRICE_VERIFYING_TEXT}</p>}
        </section>
      )}

      {place.faqs.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Câu hỏi thường gặp</h2>
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
 * Dòng ghi công ảnh.
 *
 * Với `license_type = 'open_license'` (CC BY/BY-SA), hiển thị credit + link giấy phép LÀ điều kiện
 * được phép dùng ảnh — không phải chi tiết trang trí. Vì thế nó render ngay dưới ảnh, luôn nhìn
 * thấy được, không giấu trong `title`/tooltip.
 *
 * Không có `attribution` thì không render gì: các cơ sở khác (ảnh do chủ cơ sở cung cấp, ảnh
 * người dùng đăng, ảnh thuộc phạm vi công cộng) không đòi ghi công, và bịa ra một dòng credit
 * trống chỉ làm nhiễu.
 */
function MediaCredit({ media }: { media: PlaceMedia }) {
  if (!media.attribution) return null;
  return (
    <figcaption className={styles.mediaCredit}>
      {media.attribution}
      {media.license_url && (
        <>
          {' · '}
          <a href={media.license_url} target="_blank" rel="noopener noreferrer nofollow">
            Giấy phép
          </a>
        </>
      )}
    </figcaption>
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
}: {
  badge: 'verified' | 'stale' | 'unverified';
  rawStatus: VerificationStatusValue;
  verifiedAtLabel: string | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
}) {
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
                  Xem nguồn
                </a>
              </>
            )}
          </>
        )}
        {sourceLabel && verifiedAtLabel && ' '}
        {verifiedAtLabel && `Kiểm tra lần cuối: ${verifiedAtLabel}.`}
      </p>
    );
  }

  if (badge === 'stale') {
    return (
      <p className={styles.trustNote}>
        {verifiedAtLabel
          ? `Lần xác minh gần nhất: ${verifiedAtLabel} — thông tin có thể đã thay đổi từ đó.`
          : 'Thông tin cần được kiểm tra lại.'}
      </p>
    );
  }

  // Public Beta trust disclosure (2026-08-27): `pending` ĐÚNG NGHĨA (chưa ai xem tới) đổi sang câu
  // này — `rejected` (đã bị từ chối, một trạng thái thật khác) VẪN giữ câu cũ bên dưới, không gộp
  // chung dù cả hai cùng rơi vào badge "unverified".
  if (isPendingVerification(rawStatus)) {
    return <p className={styles.trustNote}>{PENDING_DISCLOSURE_TEXT}</p>;
  }

  return <p className={styles.trustNote}>Chưa xác minh — thông tin do cộng đồng đóng góp.</p>;
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
