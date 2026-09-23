'use client';

import { ErrorRetryState, useLogError } from '@/components/ui/ErrorRetryState';

// PLACE-041: error boundary cho /tours/[slug] — xem hotels/[slug]/error.tsx cho ghi chú đầy đủ.
export default function TourDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useLogError(error);
  return <ErrorRetryState titleVi="Không tải được thông tin tour." titleEn="Couldn't load tour details." onRetry={reset} />;
}
