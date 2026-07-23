'use client';

import { useEffect } from 'react';
import styles from '@/modules/places/places.module.css';

// Error boundary cho segment /places (bao cả /places/[slug]).
// Chỉ hiển thị thông báo thân thiện — KHÔNG lộ stack trace/thông tin nhạy cảm.
export default function PlacesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Ghi log phía client để debug; nội dung không hiển thị cho người dùng.
    console.error(error);
  }, [error]);

  return (
    <div className={styles.state} role="alert">
      <p className={styles.stateTitle}>Không tải được dữ liệu địa điểm</p>
      <p>Có thể do sự cố kết nối hoặc máy chủ đang bận. Vui lòng thử lại.</p>
      <button type="button" className={styles.btn} onClick={() => reset()}>
        Thử lại
      </button>
    </div>
  );
}
