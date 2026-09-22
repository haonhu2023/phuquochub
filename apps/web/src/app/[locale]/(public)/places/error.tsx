'use client';

import { ErrorRetryState, useLogError } from '@/components/ui/ErrorRetryState';
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
  useLogError(error);
  return (
    <ErrorRetryState
      titleVi="Không tải được dữ liệu địa điểm"
      titleEn="Couldn't load place data"
      onRetry={reset}
      className={styles.state}
      titleClassName={styles.stateTitle}
      buttonClassName={styles.btn}
    />
  );
}
