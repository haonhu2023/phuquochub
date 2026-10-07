'use client';

import { ErrorRetryState, useLogError } from '@/components/ui/ErrorRetryState';
import placesStyles from '@/modules/places/places.module.css';

export default function RealEstateListingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useLogError(error);
  return (
    <ErrorRetryState
      titleVi="Không tải được danh sách bất động sản"
      titleEn="Couldn't load real estate listings"
      onRetry={reset}
      className={placesStyles.state}
      titleClassName={placesStyles.stateTitle}
      buttonClassName={placesStyles.btn}
    />
  );
}
