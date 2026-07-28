import Link from 'next/link';
import type { TourCard as TourCardType } from './types';
import { formatDifficulty, formatDuration, formatTourType } from './format';
import { formatPriceRange } from '@/modules/places/format';
import placesStyles from '@/modules/places/places.module.css';
import styles from './tours.module.css';

export function TourCard({ tour }: { tour: TourCardType }) {
  const typeLabel = formatTourType(tour.tour_type);
  const durationLabel = formatDuration(tour.duration_minutes);
  const difficultyLabel = formatDifficulty(tour.difficulty);
  const priceLabel = formatPriceRange(tour.price_range);

  return (
    <Link href={`/tours/${tour.slug}`} className={placesStyles.card}>
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
          {priceLabel && <span className={placesStyles.price}>{priceLabel}</span>}
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
