'use client';

import { ErrorRetryState, useLogError } from '@/components/ui/ErrorRetryState';
import placesStyles from '@/modules/places/places.module.css';

// Error boundary cho trang danh sách /jobs (KHÔNG bao /jobs/[id] — route đó có error.tsx riêng).
export default function JobListingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useLogError(error);
  return (
    <ErrorRetryState
      titleVi="Không tải được danh sách tin tuyển dụng"
      titleEn="Couldn't load job listings"
      onRetry={reset}
      className={placesStyles.state}
      titleClassName={placesStyles.stateTitle}
      buttonClassName={placesStyles.btn}
    />
  );
}
