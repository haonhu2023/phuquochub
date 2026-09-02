'use client';

import { useEffect } from 'react';
import placesStyles from '@/modules/places/places.module.css';

// Error boundary cho trang danh sách /beaches. Bãi biển không có route /beaches/[slug]
// (chi tiết là /places/[slug]) nên đây là boundary duy nhất của nhánh này.
export default function BeachesError({
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
      <p className={placesStyles.stateTitle}>Không tải được danh sách bãi biển</p>
      <p>Có thể do sự cố kết nối hoặc máy chủ đang bận. Vui lòng thử lại.</p>
      <button type="button" className={placesStyles.btn} onClick={() => reset()}>
        Thử lại
      </button>
    </div>
  );
}
