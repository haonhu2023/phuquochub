'use client';

import { ErrorRetryState, useLogError } from '@/components/ui/ErrorRetryState';
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
  useLogError(error);
  return (
    <ErrorRetryState
      titleVi="Không tải được danh sách bãi biển"
      titleEn="Couldn't load beaches"
      onRetry={reset}
      className={placesStyles.state}
      titleClassName={placesStyles.stateTitle}
      buttonClassName={placesStyles.btn}
    />
  );
}
