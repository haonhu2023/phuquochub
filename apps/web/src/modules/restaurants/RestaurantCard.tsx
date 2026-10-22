import Image from 'next/image';
import Link from 'next/link';
import type { RestaurantCard as RestaurantCardType } from './types';
import { formatPriceRange } from '@/modules/places/format';
import { priceVerifyingText, resolvePriceDisplay } from '@/modules/places/trust';
import { DEFAULT_LOCALE, localizedHref, type Locale } from '@/lib/locale';
import placesStyles from '@/modules/places/places.module.css';
import styles from './restaurants.module.css';

export function RestaurantCard({
  restaurant,
  locale = DEFAULT_LOCALE,
}: {
  restaurant: RestaurantCardType;
  locale?: Locale;
}) {
  // Public Beta price trust gate (2026-08-28): raw giá chỉ hiện khi verification_status đã tin
  // cậy — cùng invariant dùng chung mọi thẻ public (xem places/trust.ts).
  const { label: priceLabel, verifying: showPriceVerifying } = resolvePriceDisplay(
    formatPriceRange(restaurant.price_range, locale),
    restaurant.verification_status,
  );
  return (
    <Link href={localizedHref(locale, `/restaurants/${restaurant.slug}`)} className={placesStyles.card}>
      {restaurant.cover_image_url ? (
        // 2026-10-22 (rà soát hiệu năng) — same-origin, xem ghi chú PlaceCard.tsx.
        <Image
          className={placesStyles.thumb}
          src={restaurant.cover_image_url}
          alt={restaurant.name}
          width={800}
          height={600}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
      ) : (
        <div className={placesStyles.thumbFallback} aria-hidden="true">
          <span>{restaurant.name.charAt(0)}</span>
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
            <span className={placesStyles.price}>{priceLabel ?? priceVerifyingText(locale)}</span>
          )}
          {restaurant.is_local_specialty && (
            <span className={`${placesStyles.badge} ${styles.specialtyBadge}`}>
              {locale === 'en' ? 'Local specialty' : 'Đặc sản địa phương'}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
