import Link from 'next/link';
import type { AttractionCard as AttractionCardType } from './types';
import { formatPriceRange } from '@/modules/places/format';
import { getTrustBadge, TRUST_BADGE_LABEL } from '@/modules/places/trust';
import placesStyles from '@/modules/places/places.module.css';
import styles from './attractions.module.css';

// Trỏ về /places/[slug]: điểm tham quan KHÔNG có trang chi tiết riêng (xem types.ts) —
// một Place chỉ có duy nhất một URL chi tiết, tránh nội dung trùng lặp cho SEO.
export function AttractionCard({ attraction }: { attraction: AttractionCardType }) {
  const priceLabel = formatPriceRange(attraction.price_range);
  const isVerified = getTrustBadge(attraction.verification_status) === 'verified';

  return (
    <Link href={`/places/${attraction.slug}`} className={placesStyles.card}>
      {attraction.cover_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh từ host bên ngoài (MinIO/CDN); next/image cần cấu hình remotePatterns (ngoài phạm vi slice này).
        <img
          className={placesStyles.thumb}
          src={attraction.cover_image_url}
          alt={attraction.name}
          loading="lazy"
        />
      ) : (
        <div className={placesStyles.thumbFallback} aria-hidden="true">
          {attraction.name.charAt(0)}
        </div>
      )}

      <div className={placesStyles.cardBody}>
        <h2 className={placesStyles.cardTitle}>{attraction.name}</h2>
        {attraction.short_description && (
          <p className={placesStyles.cardDesc}>{attraction.short_description}</p>
        )}
        {attraction.ward && <p className={styles.ward}>{attraction.ward}</p>}

        <div className={placesStyles.cardMeta}>
          {attraction.rating_avg !== null && (
            <span className={placesStyles.rating}>
              ★ {attraction.rating_avg.toFixed(1)}
              {attraction.rating_count > 0 ? ` (${attraction.rating_count})` : ''}
            </span>
          )}
          {/* Không có giá vé dạng số trong dữ liệu Place — chỉ hiển thị mức giá khi API thực sự
              trả price_range; KHÔNG bịa "Liên hệ để biết giá" cho điểm tham quan chưa có dữ liệu. */}
          {priceLabel && <span className={placesStyles.price}>{priceLabel}</span>}
          {isVerified && (
            <span className={`${placesStyles.badge} ${placesStyles.badgeVerified}`}>{TRUST_BADGE_LABEL.verified}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
