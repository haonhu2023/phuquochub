'use client';

import { ErrorRetryState, useLogError } from '@/components/ui/ErrorRetryState';
import placesStyles from '@/modules/places/places.module.css';

// Error boundary cho trang danh sách /attractions. Điểm tham quan không có route
// /attractions/[slug] (chi tiết là /places/[slug]) nên đây là boundary duy nhất của nhánh này.
export default function AttractionsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useLogError(error);
  return (
    <ErrorRetryState
      titleVi="Không tải được danh sách điểm tham quan"
      titleEn="Couldn't load attractions"
      onRetry={reset}
      className={placesStyles.state}
      titleClassName={placesStyles.stateTitle}
      buttonClassName={placesStyles.btn}
    />
  );
}
