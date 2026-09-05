import Link from 'next/link';
import type { BeachCard as BeachCardType } from './types';
import { formatPriceRange } from '@/modules/places/format';
import { getTrustBadge, PRICE_VERIFYING_TEXT, resolvePriceDisplay, TRUST_BADGE_LABEL } from '@/modules/places/trust';
import { DEFAULT_LOCALE, localizedHref, type Locale } from '@/lib/locale';
import placesStyles from '@/modules/places/places.module.css';
import styles from './beaches.module.css';

// Trỏ về /places/[slug]: bãi biển KHÔNG có trang chi tiết riêng (xem types.ts) — một Place chỉ
// có duy nhất một URL chi tiết, tránh nội dung trùng lặp cho SEO.
//
// CỐ Ý không hiển thị bất kỳ thông tin nào về tắm biển, cứu hộ, tiện ích hay chất lượng nước:
// schema không có trường nào cho chúng, và đó là thông tin an toàn — suy đoán từ mô tả rồi trình
// bày như dữ kiện là điều không được làm.
export function BeachCard({ beach, locale = DEFAULT_LOCALE }: { beach: BeachCardType; locale?: Locale }) {
  // Public Beta price trust gate (2026-08-28): raw giá chỉ hiện khi verification_status đã tin
  // cậy — cùng invariant dùng chung mọi thẻ public, không phụ thuộc category (xem places/trust.ts).
  const { label: priceLabel, verifying: showPriceVerifying } = resolvePriceDisplay(
    formatPriceRange(beach.price_range),
    beach.verification_status,
  );
  const isVerified = getTrustBadge(beach.verification_status) === 'verified';

  return (
    <Link href={localizedHref(locale, `/places/${beach.slug}`)} className={placesStyles.card}>
      {beach.cover_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh từ host bên ngoài (MinIO/CDN); next/image cần cấu hình remotePatterns (ngoài phạm vi slice này).
        <img
          className={placesStyles.thumb}
          src={beach.cover_image_url}
          alt={beach.name}
          loading="lazy"
        />
      ) : (
        <div className={placesStyles.thumbFallback} aria-hidden="true">
          <span>{beach.name.charAt(0)}</span>
        </div>
      )}

      <div className={placesStyles.cardBody}>
        <h2 className={placesStyles.cardTitle}>{beach.name}</h2>
        {beach.short_description && (
          <p className={placesStyles.cardDesc}>{beach.short_description}</p>
        )}
        {beach.ward && <p className={styles.ward}>{beach.ward}</p>}

        <div className={placesStyles.cardMeta}>
          {beach.rating_avg !== null && (
            <span className={placesStyles.rating}>
              ★ {beach.rating_avg.toFixed(1)}
              {beach.rating_count > 0 ? ` (${beach.rating_count})` : ''}
            </span>
          )}
          {/* price_range NULL nghĩa là CHƯA BIẾT, không phải "miễn phí" — chỉ hiện nhãn khi API
              thực sự trả giá trị, không suy ra "bãi biển thì luôn miễn phí". */}
          {(priceLabel || showPriceVerifying) && (
            <span className={placesStyles.price}>{priceLabel ?? PRICE_VERIFYING_TEXT}</span>
          )}
          {isVerified && (
            <span className={`${placesStyles.badge} ${placesStyles.badgeVerified}`}>{TRUST_BADGE_LABEL.verified}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
