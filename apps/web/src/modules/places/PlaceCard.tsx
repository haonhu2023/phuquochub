import Link from 'next/link';
import type { PlaceCard as PlaceCardType } from './types';
import { formatPriceRange } from './format';
import { getTrustBadge, PRICE_VERIFYING_TEXT, resolvePriceDisplay, TRUST_BADGE_LABEL } from './trust';
import { DEFAULT_LOCALE, localizedHref, type Locale } from '@/lib/locale';
import styles from './places.module.css';

// Thẻ địa điểm (presentational). Dùng ở danh sách + kết quả tìm kiếm.
//
// `titleAs` cho phép nơi gọi đặt tên địa điểm ĐÚNG bậc trong cây tiêu đề của trang đó. Mặc định
// `h2` — giữ NGUYÊN hành vi cũ cho mọi nơi gọi hiện có (trang danh sách: h1 trang + h2 thẻ). Trang
// chủ gom thẻ dưới một tiêu đề khối `h2` nên truyền `h3` để không làm phẳng cấu trúc tiêu đề.
//
// `locale` (PR A): tuỳ chọn, mặc định `DEFAULT_LOCALE` — nơi gọi trong `[locale]/(public)/**` nên
// luôn truyền `locale` thật; mặc định chỉ để không crash nếu một nơi gọi nào đó quên truyền.
export function PlaceCard({
  place,
  titleAs: TitleTag = 'h2',
  locale = DEFAULT_LOCALE,
}: {
  place: PlaceCardType;
  titleAs?: 'h2' | 'h3';
  locale?: Locale;
}) {
  // Public Beta price trust gate (2026-08-28): giá thật CHỈ hiện khi verification_status đã tin
  // cậy — cùng invariant dùng chung cho mọi thẻ public (trang chi tiết, RestaurantCard, TourCard,
  // BeachCard, AttractionCard, popup bản đồ). Chưa tin cậy nhưng CÓ giá → PRICE_VERIFYING_TEXT.
  const { label: priceLabel, verifying: showPriceVerifying } = resolvePriceDisplay(
    formatPriceRange(place.price_range),
    place.verification_status,
  );
  // Thẻ chỉ hiện tín hiệu TÍCH CỰC — không hiện gì cho 'stale'/'unverified': một badge trung tính
  // ở mật độ danh sách chỉ là tiếng ồn, phần giải thích đầy đủ thuộc về trang chi tiết.
  const isVerified = getTrustBadge(place.verification_status) === 'verified';
  return (
    <Link href={localizedHref(locale, `/places/${place.slug}`)} className={styles.card}>
      {place.cover_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh từ host bên ngoài (MinIO/CDN); next/image cần cấu hình remotePatterns (ngoài phạm vi slice này).
        <img
          className={styles.thumb}
          src={place.cover_image_url}
          alt={place.name}
          loading="lazy"
        />
      ) : (
        <div className={styles.thumbFallback} aria-hidden="true">
          {place.name.charAt(0)}
        </div>
      )}

      <div className={styles.cardBody}>
        <TitleTag className={styles.cardTitle}>{place.name}</TitleTag>
        {place.short_description && <p className={styles.cardDesc}>{place.short_description}</p>}

        <div className={styles.cardMeta}>
          {place.rating_avg !== null && (
            <span className={styles.rating}>
              ★ {place.rating_avg.toFixed(1)}
              {place.rating_count > 0 ? ` (${place.rating_count})` : ''}
            </span>
          )}
          {(priceLabel || showPriceVerifying) && (
            <span className={styles.price}>{priceLabel ?? PRICE_VERIFYING_TEXT}</span>
          )}
          {typeof place.distance_m === 'number' && <span>{formatDistance(place.distance_m)}</span>}
          {isVerified && (
            <span className={`${styles.badge} ${styles.badgeVerified}`}>{TRUST_BADGE_LABEL.verified}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
