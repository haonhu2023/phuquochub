import Link from 'next/link';
import type { HotelCard as HotelCardType } from './types';
import placesStyles from '@/modules/places/places.module.css';
import styles from './hotels.module.css';

const HOTEL_TYPE_LABELS: Record<string, string> = {
  resort: 'Resort',
  hotel: 'Khách sạn',
  homestay: 'Homestay',
  villa: 'Villa',
  guesthouse: 'Nhà nghỉ',
  apartment: 'Căn hộ',
};

export function HotelCard({ hotel }: { hotel: HotelCardType }) {
  const typeLabel = HOTEL_TYPE_LABELS[hotel.hotel_type] ?? hotel.hotel_type;
  return (
    <Link href={`/hotels/${hotel.slug}`} className={placesStyles.card}>
      {hotel.cover_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh từ host bên ngoài (MinIO/CDN); next/image cần cấu hình remotePatterns (ngoài phạm vi slice này).
        <img
          className={placesStyles.thumb}
          src={hotel.cover_image_url}
          alt={hotel.name}
          loading="lazy"
        />
      ) : (
        <div className={placesStyles.thumbFallback} aria-hidden="true">
          {hotel.name.charAt(0)}
        </div>
      )}

      <div className={placesStyles.cardBody}>
        <h2 className={placesStyles.cardTitle}>{hotel.name}</h2>
        {hotel.short_description && <p className={placesStyles.cardDesc}>{hotel.short_description}</p>}

        <div className={placesStyles.cardMeta}>
          {hotel.rating_avg !== null && (
            <span className={placesStyles.rating}>
              ★ {hotel.rating_avg.toFixed(1)}
              {hotel.rating_count > 0 ? ` (${hotel.rating_count})` : ''}
            </span>
          )}
          {hotel.star_rating !== null && (
            <span className={styles.stars} aria-label={`${hotel.star_rating} sao`}>
              {'★'.repeat(hotel.star_rating)}
            </span>
          )}
          <span className={placesStyles.badge}>{typeLabel}</span>
        </div>
      </div>
    </Link>
  );
}
