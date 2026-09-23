'use client';

import { ErrorRetryState, useLogError } from '@/components/ui/ErrorRetryState';

// PLACE-041: error boundary cho /events/[slug] — xem hotels/[slug]/error.tsx cho ghi chú đầy đủ.
export default function EventDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useLogError(error);
  return <ErrorRetryState titleVi="Không tải được thông tin sự kiện." titleEn="Couldn't load event details." onRetry={reset} />;
}
