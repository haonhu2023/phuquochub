'use client';

import { useAuthenticatedImage } from '@/modules/media/useAuthenticatedImage';
import styles from './real-estate-listing-photos.module.css';

interface Props {
  url: string;
  accessToken: string;
  alt: string;
}

/**
 * Một thumbnail trong màn hình quản lý CỦA CHỦ TIN — `url` trỏ tới kênh `/owner-file`, đứng sau
 * `JwtAuthGuard` toàn cục (chỉ nhận header `Authorization`), nên không gắn thẳng vào `<img src>`
 * được (cùng lý do PhotoThumbnail của place-photos). Tách thành component riêng vì mỗi ô cần gọi
 * `useAuthenticatedImage` (hook) cho đúng một ảnh — không gọi được trong `.map()` ở component cha.
 */
export function RealEstateListingPhotoThumbnail({ url, accessToken, alt }: Props) {
  const { src, loading, error } = useAuthenticatedImage(url, accessToken);

  if (loading) {
    return <div className={styles.thumb} aria-busy="true" aria-hidden="true" />;
  }
  if (error || !src) {
    return (
      <div className={styles.thumb} role="img" aria-label={`Không tải được ảnh: ${alt}`}>
        <span className={styles.thumbErrorText}>Không tải được ảnh</span>
      </div>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img className={styles.thumb} src={src} alt={alt} />;
}
