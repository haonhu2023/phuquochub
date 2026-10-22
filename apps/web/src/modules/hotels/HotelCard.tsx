import Image from 'next/image';
import Link from 'next/link';
import type { HotelCard as HotelCardType } from './types';
import { DEFAULT_LOCALE, localizedHref, type Locale } from '@/lib/locale';
import placesStyles from '@/modules/places/places.module.css';
import styles from './hotels.module.css';

const HOTEL_TYPE_LABELS: Record<Locale, Record<string, string>> = {
  vi: {
    resort: 'Resort',
    hotel: 'Khách sạn',
    homestay: 'Homestay',
    villa: 'Villa',
    guesthouse: 'Nhà nghỉ',
    apartment: 'Căn hộ',
  },
  en: {
    resort: 'Resort',
    hotel: 'Hotel',
    homestay: 'Homestay',
    villa: 'Villa',
    guesthouse: 'Guesthouse',
    apartment: 'Apartment',
  },
};

export function HotelCard({ hotel, locale = DEFAULT_LOCALE }: { hotel: HotelCardType; locale?: Locale }) {
  const typeLabel = HOTEL_TYPE_LABELS[locale][hotel.hotel_type] ?? hotel.hotel_type;
  return (
    <Link href={localizedHref(locale, `/hotels/${hotel.slug}`)} className={placesStyles.card}>
      {hotel.cover_image_url ? (
        // 2026-10-22 (rà soát hiệu năng) — same-origin, xem ghi chú PlaceCard.tsx.
        <Image
          className={placesStyles.thumb}
          src={hotel.cover_image_url}
          alt={hotel.name}
          width={800}
          height={600}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
      ) : (
        <div className={placesStyles.thumbFallback} aria-hidden="true">
          <span>{hotel.name.charAt(0)}</span>
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
            <span
              className={styles.stars}
              aria-label={locale === 'en' ? `${hotel.star_rating} stars` : `${hotel.star_rating} sao`}
            >
              {'★'.repeat(hotel.star_rating)}
            </span>
          )}
          <span className={placesStyles.badge}>{typeLabel}</span>
        </div>
      </div>
    </Link>
  );
}
