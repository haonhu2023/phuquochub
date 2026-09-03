'use client';

import { useEffect } from 'react';
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
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={placesStyles.state} role="alert">
      <p className={placesStyles.stateTitle}>Không tải được kết quả tìm kiếm</p>
      <p>Có thể do sự cố kết nối hoặc máy chủ đang bận. Vui lòng thử lại.</p>
      <button type="button" className={placesStyles.btn} onClick={() => reset()}>
        Thử lại
      </button>
    </div>
  );
}
