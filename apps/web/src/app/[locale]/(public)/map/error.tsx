'use client';

import { useEffect } from 'react';
import placesStyles from '@/modules/places/places.module.css';

// Error boundary cho /map — cùng khuôn placesStyles.state. Trang này chỉ render <MapView />
// (client component tự bắt lỗi fetch bbox của chính nó), nên boundary này chủ yếu là phòng vệ,
// theo đúng chỉ đạo bao phủ đồng nhất mọi route (như explore/error.tsx).
export default function MapError({
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
      <p className={placesStyles.stateTitle}>Không tải được bản đồ</p>
      <p>Có thể do sự cố kết nối hoặc máy chủ đang bận. Vui lòng thử lại.</p>
      <button type="button" className={placesStyles.btn} onClick={() => reset()}>
        Thử lại
      </button>
    </div>
  );
}
