'use client';

import { useEffect } from 'react';
import placeStyles from '@/modules/places/places.module.css';

// Error boundary cho segment /dashboard/places/edit-proposals — cùng khuôn places/report/error.tsx.
export default function ProposeEditError({
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
    <main>
      <div className={placeStyles.state} role="alert">
        <p className={placeStyles.stateTitle}>Đã xảy ra lỗi</p>
        <p>Không thể hiển thị màn hình đề xuất chỉnh sửa. Vui lòng thử lại.</p>
        <button type="button" className={placeStyles.btn} onClick={() => reset()}>
          Thử lại
        </button>
      </div>
    </main>
  );
}
