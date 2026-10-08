'use client';

import { useEffect, useState } from 'react';
import { listRealEstateListingPhotos } from './api/real-estate-listing-photos.api';
import type { RealEstateListingPhoto } from './types';
import styles from './real-estate-listing-photos.module.css';

interface Props {
  listingId: string;
}

/**
 * Lưới ảnh CÔNG KHAI trên trang chi tiết tin — `photo.url` trỏ tới `GET /real-estate-listings/
 * {id}/photos/{photoId}/file`, một route `@Public()` (302 tới signed GET URL), nên gắn thẳng vào
 * `<img src>` được bình thường — KHÁC kênh chủ tin (`RealEstateListingPhotosManager`), nơi
 * `/owner-file` đứng sau xác thực và cần `useAuthenticatedImage`.
 *
 * Không hiển thị gì (không cả khung rỗng) khi tin chưa có ảnh — ảnh là phần bổ sung, không phải
 * nội dung bắt buộc phải có mặt trên trang.
 */
export function RealEstateListingPhotoGallery({ listingId }: Props) {
  const [photos, setPhotos] = useState<RealEstateListingPhoto[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listRealEstateListingPhotos(listingId)
      .then((result) => {
        if (!cancelled) setPhotos(result);
      })
      .catch(() => {
        if (!cancelled) setPhotos([]);
      });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  if (!photos || photos.length === 0) return null;

  return (
    <ul className={styles.grid} aria-label="Ảnh của tin">
      {photos.map((photo, index) => (
        <li key={photo.id} className={styles.tile}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.thumb} src={photo.url} alt={`Ảnh ${index + 1} của tin`} loading="lazy" />
        </li>
      ))}
    </ul>
  );
}
