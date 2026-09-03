import Link from 'next/link';
import type { TourCard as TourCardType } from './types';
import { formatDifficulty, formatDuration, formatTourType } from './format';
import { formatPriceRange } from '@/modules/places/format';
import { PRICE_VERIFYING_TEXT, resolvePriceDisplay } from '@/modules/places/trust';
import { DEFAULT_LOCALE, localizedHref, type Locale } from '@/lib/locale';
import placesStyles from '@/modules/places/places.module.css';
import styles from './tours.module.css';

export function TourCard({ tour, locale = DEFAULT_LOCALE }: { tour: TourCardType; locale?: Locale }) {
  const typeLabel = formatTourType(tour.tour_type);
  const durationLabel = formatDuration(tour.duration_minutes);
  const difficultyLabel = formatDifficulty(tour.difficulty);
  // Public Beta price trust gate (2026-08-28): raw giá chỉ hiện khi verification_status đã tin
  // cậy — cùng invariant dùng chung mọi thẻ public (xem places/trust.ts).
  const { label: priceLabel, verifying: showPriceVerifying } = resolvePriceDisplay(
    formatPriceRange(tour.price_range),
    tour.verification_status,
  );

  return (
    <Link href={localizedHref(locale, `/tours/${tour.slug}`)} className={placesStyles.card}>
      {tour.cover_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh từ host bên ngoài (MinIO/CDN); next/image cần cấu hình remotePatterns (ngoài phạm vi slice này).
        <img className={placesStyles.thumb} src={tour.cover_image_url} alt={tour.name} loading="lazy" />
      ) : (
        <div className={placesStyles.thumbFallback} aria-hidden="true">
          {tour.name.charAt(0)}
        </div>
      )}

      <div className={placesStyles.cardBody}>
        <h2 className={placesStyles.cardTitle}>{tour.name}</h2>
        {tour.short_description && <p className={placesStyles.cardDesc}>{tour.short_description}</p>}
        {tour.ward && <p className={styles.departure}>Khởi hành: {tour.ward}</p>}

        <div className={placesStyles.cardMeta}>
          {tour.rating_avg !== null && (
            <span className={placesStyles.rating}>
              ★ {tour.rating_avg.toFixed(1)}
              {tour.rating_count > 0 ? ` (${tour.rating_count})` : ''}
            </span>
          )}
          {durationLabel && <span className={styles.duration}>⏱ {durationLabel}</span>}
          {(priceLabel || showPriceVerifying) && (
            <span className={placesStyles.price}>{priceLabel ?? PRICE_VERIFYING_TEXT}</span>
          )}
          {typeLabel && <span className={placesStyles.badge}>{typeLabel}</span>}
          {difficultyLabel && (
            <span className={`${placesStyles.badge} ${styles.difficultyBadge}`}>
              Độ khó: {difficultyLabel}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
