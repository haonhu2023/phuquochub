import Link from 'next/link';
import type { PlaceCard as PlaceCardType } from './types';
import { formatPriceRange } from './format';
import styles from './places.module.css';

// Thẻ địa điểm (presentational). Dùng ở danh sách + kết quả tìm kiếm.
//
// `titleAs` cho phép nơi gọi đặt tên địa điểm ĐÚNG bậc trong cây tiêu đề của trang đó. Mặc định
// `h2` — giữ NGUYÊN hành vi cũ cho mọi nơi gọi hiện có (trang danh sách: h1 trang + h2 thẻ). Trang
// chủ gom thẻ dưới một tiêu đề khối `h2` nên truyền `h3` để không làm phẳng cấu trúc tiêu đề.
export function PlaceCard({
  place,
  titleAs: TitleTag = 'h2',
}: {
  place: PlaceCardType;
  titleAs?: 'h2' | 'h3';
}) {
  const priceLabel = formatPriceRange(place.price_range);
  return (
    <Link href={`/places/${place.slug}`} className={styles.card}>
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
          {priceLabel && <span className={styles.price}>{priceLabel}</span>}
          {typeof place.distance_m === 'number' && <span>{formatDistance(place.distance_m)}</span>}
          {place.verification_status === 'verified' && (
            <span className={`${styles.badge} ${styles.badgeVerified}`}>Đã xác minh</span>
          )}
        </div>
      </div>
    </Link>
  );
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}
