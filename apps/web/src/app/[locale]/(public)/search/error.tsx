'use client';

import { ErrorRetryState, useLogError } from '@/components/ui/ErrorRetryState';
import placesStyles from '@/modules/places/places.module.css';

// Error boundary cho /search — cùng khuôn placesStyles.state đã dùng ở hotels/restaurants/tours.
// Khác các route đó: /search THẬT SỰ await searchPlaces()/listCategories() ở Server Component, nên
// boundary này có bề mặt kích hoạt thực tế (lỗi mạng/máy chủ khi fetch) không chỉ mang tính phòng
// vệ.
export default function SearchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useLogError(error);
  return (
    <ErrorRetryState
      titleVi="Không tải được kết quả tìm kiếm"
      titleEn="Couldn't load search results"
      onRetry={reset}
      className={placesStyles.state}
      titleClassName={placesStyles.stateTitle}
      buttonClassName={placesStyles.btn}
    />
  );
}
