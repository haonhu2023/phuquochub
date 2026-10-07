'use client';

import { ErrorRetryState, useLogError } from '@/components/ui/ErrorRetryState';

export default function RealEstateListingDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useLogError(error);
  return (
    <ErrorRetryState
      titleVi="Không tải được tin bất động sản."
      titleEn="Couldn't load this real estate listing."
      onRetry={reset}
    />
  );
}
