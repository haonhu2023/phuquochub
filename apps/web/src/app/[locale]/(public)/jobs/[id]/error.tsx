'use client';

import { ErrorRetryState, useLogError } from '@/components/ui/ErrorRetryState';

export default function JobListingDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useLogError(error);
  return <ErrorRetryState titleVi="Không tải được tin tuyển dụng." titleEn="Couldn't load this job listing." onRetry={reset} />;
}
