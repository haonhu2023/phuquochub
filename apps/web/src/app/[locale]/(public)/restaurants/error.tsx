'use client';

import { useEffect } from 'react';
import placesStyles from '@/modules/places/places.module.css';

// Error boundary cho trang danh sách /restaurants (KHÔNG bao /restaurants/[slug] — route đó đã
// có error.tsx riêng, cụ thể hơn nên được ưu tiên).
export default function RestaurantsError({
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
      <p className={placesStyles.stateTitle}>Không tải được danh sách nhà hàng</p>
      <p>Có thể do sự cố kết nối hoặc máy chủ đang bận. Vui lòng thử lại.</p>
      <button type="button" className={placesStyles.btn} onClick={() => reset()}>
        Thử lại
      </button>
    </div>
  );
}
