import Link from 'next/link';
import type { RestaurantCard as RestaurantCardType } from './types';
import { formatPriceRange } from '@/modules/places/format';
import { PRICE_VERIFYING_TEXT, resolvePriceDisplay } from '@/modules/places/trust';
import placesStyles from '@/modules/places/places.module.css';
import styles from './restaurants.module.css';

export function RestaurantCard({ restaurant }: { restaurant: RestaurantCardType }) {
  // Public Beta price trust gate (2026-08-28): raw giá chỉ hiện khi verification_status đã tin
  // cậy — cùng invariant dùng chung mọi thẻ public (xem places/trust.ts).
  const { label: priceLabel, verifying: showPriceVerifying } = resolvePriceDisplay(
    formatPriceRange(restaurant.price_range),
    restaurant.verification_status,
  );
  return (
    <Link href={`/restaurants/${restaurant.slug}`} className={placesStyles.card}>
      {restaurant.cover_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh từ host bên ngoài (MinIO/CDN); next/image cần cấu hình remotePatterns (ngoài phạm vi slice này).
        <img
          className={placesStyles.thumb}
          src={restaurant.cover_image_url}
          alt={restaurant.name}
          loading="lazy"
        />
      ) : (
        <div className={placesStyles.thumbFallback} aria-hidden="true">
          {restaurant.name.charAt(0)}
        </div>
      )}

      <div className={placesStyles.cardBody}>
        <h2 className={placesStyles.cardTitle}>{restaurant.name}</h2>
        {restaurant.short_description && (
          <p className={placesStyles.cardDesc}>{restaurant.short_description}</p>
        )}
        {restaurant.cuisines.length > 0 && (
          <p className={styles.cuisineTags}>{restaurant.cuisines.join(' · ')}</p>
        )}

        <div className={placesStyles.cardMeta}>
          {restaurant.rating_avg !== null && (
            <span className={placesStyles.rating}>
              ★ {restaurant.rating_avg.toFixed(1)}
              {restaurant.rating_count > 0 ? ` (${restaurant.rating_count})` : ''}
            </span>
          )}
          {(priceLabel || showPriceVerifying) && (
            <span className={placesStyles.price}>{priceLabel ?? PRICE_VERIFYING_TEXT}</span>
          )}
          {restaurant.is_local_specialty && (
            <span className={`${placesStyles.badge} ${styles.specialtyBadge}`}>Đặc sản địa phương</span>
          )}
        </div>
      </div>
    </Link>
  );
}
