import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPlace } from '@/modules/places/api/places.api';
import { formatPriceRange } from '@/modules/places/format';
import { getOpeningToday, getOpeningWeek, hasOpeningHours } from '@/modules/places/openingHours';
import { ApiError } from '@/lib/http';
import type { PlaceContact, PlaceDetail, PlaceMedia } from '@/modules/places/types';
import styles from '@/modules/places/places.module.css';
import { buildPlaceJsonLd, serializeJsonLd } from '@/lib/structured-data';
import { listReviews } from '@/modules/reviews/api/reviews.api';
import { ReviewsSection } from '@/modules/reviews/ReviewsSection';
import type { Review } from '@/modules/reviews/types';
import { ClaimCta } from '@/modules/business-claims/ClaimCta';

interface Params {
  params: Promise<{ slug: string }>;
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
  const { slug } = await params;
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
    alternates: { canonical: `/places/${place.slug}` },
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
  const { slug } = await params;
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
  const priceLabel = formatPriceRange(place.price_range);
  const hasInfo = place.address || place.ward || priceLabel || hasHours;
  const mapHref = `https://www.google.com/maps?q=${place.location.lat},${place.location.lng}`;

  return (
    <article className={styles.detail}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildPlaceJsonLd(place)) }}
      />
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link href="/">Trang chủ</Link>
        <span className={styles.sep}>/</span>
        <Link href="/places">Địa điểm</Link>
        {browseListing && (
          <>
            <span className={styles.sep}>/</span>
            <Link href={browseListing.href}>{browseListing.label}</Link>
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
          {place.verification_status === 'verified' && (
            <span className={`${styles.badge} ${styles.badgeVerified}`}>Đã xác minh</span>
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
            {priceLabel && (
              <div className={styles.infoItem}>
                <dt className={styles.infoLabel}>Mức giá</dt>
                <dd className={styles.infoValue}>{priceLabel}</dd>
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
          <ul className={styles.list}>
            {place.prices.map((p) => (
              <li key={p.id} className={styles.listItem}>
                <span>{p.service_name}</span>
                <span>
                  {p.is_free
                    ? 'Miễn phí'
                    : `${p.amount.toLocaleString('vi-VN')} ${p.currency}${p.unit ? ` / ${p.unit}` : ''}`}
                </span>
              </li>
            ))}
          </ul>
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
