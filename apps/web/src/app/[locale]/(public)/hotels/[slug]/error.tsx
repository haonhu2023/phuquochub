'use client';

import { ErrorRetryState, useLogError } from '@/components/ui/ErrorRetryState';

// PLACE-041: error boundary cho /hotels/[slug] — trước đây không tồn tại, và trang này coi
// MỌI lỗi (kể cả 5xx/mạng) là 404 (xem page.tsx). Giờ lỗi thật (không phải 404) tới đây thay vì
// làm crash cả ứng dụng. Không lộ stack trace/thông tin nhạy cảm cho người dùng.
export default function HotelDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useLogError(error);
  return <ErrorRetryState titleVi="Không tải được thông tin khách sạn." titleEn="Couldn't load hotel details." onRetry={reset} />;
}
