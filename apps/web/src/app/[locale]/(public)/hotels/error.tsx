'use client';

import { ErrorRetryState, useLogError } from '@/components/ui/ErrorRetryState';
import placesStyles from '@/modules/places/places.module.css';

// Error boundary cho trang danh sách /hotels (KHÔNG bao /hotels/[slug] — route đó đã có
// error.tsx riêng, cụ thể hơn nên được ưu tiên). Chỉ hiển thị thông báo thân thiện — KHÔNG lộ
// stack trace/thông tin nhạy cảm.
export default function HotelsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useLogError(error);
  return (
    <ErrorRetryState
      titleVi="Không tải được danh sách khách sạn"
      titleEn="Couldn't load hotels"
      onRetry={reset}
      className={placesStyles.state}
      titleClassName={placesStyles.stateTitle}
      buttonClassName={placesStyles.btn}
    />
  );
}
