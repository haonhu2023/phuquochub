'use client';

import { ErrorRetryState, useLogError } from '@/components/ui/ErrorRetryState';

// PLACE-041: error boundary cho /restaurants/[slug] — xem hotels/[slug]/error.tsx cho ghi chú đầy đủ.
export default function RestaurantDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useLogError(error);
  return <ErrorRetryState titleVi="Không tải được thông tin nhà hàng." titleEn="Couldn't load restaurant details." onRetry={reset} />;
}
