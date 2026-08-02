'use client';

import { useEffect } from 'react';
import placesStyles from '@/modules/places/places.module.css';

// Error boundary cho /dashboard — cùng khuôn placesStyles.state đã dùng ở mọi route khác (khuôn
// "state" là quy ước chung toàn app, không riêng module places — /search cũng đã tái dùng).
// DashboardPage là 'use client' (useAuth), không await dữ liệu ở Server Component, nên boundary
// này chủ yếu bắt lỗi render-time (vd useAuth() được gọi ngoài AuthProvider) — phòng vệ, theo
// đúng chỉ đạo bao phủ đồng nhất mọi route.
export default function DashboardError({
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
      <p className={placesStyles.stateTitle}>Không tải được bảng điều khiển</p>
      <p>Có thể do sự cố kết nối hoặc máy chủ đang bận. Vui lòng thử lại.</p>
      <button type="button" className={placesStyles.btn} onClick={() => reset()}>
        Thử lại
      </button>
    </div>
  );
}
