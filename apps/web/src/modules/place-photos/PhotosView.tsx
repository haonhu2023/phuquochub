'use client';

import Link from 'next/link';
import placeStyles from '@/modules/places/places.module.css';
import { PlacePhotosManager } from './PlacePhotosManager';

interface Props {
  placeId: string;
}

/**
 * Trang dashboard đầy đủ `/dashboard/places/{id}/photos` — breadcrumb + tiêu đề trang, THÂN thực
 * sự nằm ở `PlacePhotosManager` (dùng chung với drawer "📷 Quản lý ảnh" trên trang công khai,
 * `PlacePhotosButton`, 2026-09-17). Tách ra để hai nơi hiển thị không có hai bản logic tải/duyệt/
 * sắp xếp/đặt bìa lệch nhau theo thời gian.
 */
export function PhotosView({ placeId }: Props) {
  return (
    <main>
      <nav className={placeStyles.breadcrumb} aria-label="Breadcrumb">
        <Link href="/dashboard/places">Địa điểm của tôi</Link>
        <span className={placeStyles.sep}>/</span>
        <Link href={`/dashboard/places/${placeId}/edit`}>Chỉnh sửa</Link>
        <span className={placeStyles.sep}>/</span>
        <span aria-current="page">Ảnh</span>
      </nav>

      <header className={placeStyles.pageHeader}>
        <h1 className={placeStyles.pageTitle}>Ảnh của cơ sở</h1>
        <p className={placeStyles.pageLede}>
          Ảnh bạn tải lên sẽ được kiểm duyệt trước khi hiển thị công khai trên trang cơ sở.
        </p>
      </header>

      <PlacePhotosManager placeId={placeId} />
    </main>
  );
}
