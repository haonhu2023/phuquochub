'use client';

import { useAuthenticatedImage } from '@/modules/media/useAuthenticatedImage';
import styles from './place-photos.module.css';

interface Props {
  url: string;
  accessToken: string;
  alt: string;
}

/**
 * MỘT thumbnail — tách khỏi `PlacePhotosManager` vì mỗi ô cần gọi `useAuthenticatedImage` (hook)
 * cho ĐÚNG một ảnh của chính nó; hook không gọi được trong vòng lặp `.map()` ở component cha.
 */
export function PhotoThumbnail({ url, accessToken, alt }: Props) {
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

  // src là Object URL (blob:) tạo từ fetch có xác thực — next/image không xử lý được (remotePatterns
  // không áp dụng cho blob:).
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={styles.thumb} src={src} alt={alt} />;
}
