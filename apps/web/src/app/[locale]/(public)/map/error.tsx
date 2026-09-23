'use client';

import { ErrorRetryState, useLogError } from '@/components/ui/ErrorRetryState';
import placesStyles from '@/modules/places/places.module.css';

// Error boundary cho /map — cùng khuôn placesStyles.state. Trang này chỉ render <MapView />
// (client component tự bắt lỗi fetch bbox của chính nó), nên boundary này chủ yếu là phòng vệ,
// theo đúng chỉ đạo bao phủ đồng nhất mọi route (như explore/error.tsx).
export default function MapError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useLogError(error);
  return (
    <ErrorRetryState
      titleVi="Không tải được bản đồ"
      titleEn="Couldn't load the map"
      onRetry={reset}
      className={placesStyles.state}
      titleClassName={placesStyles.stateTitle}
      buttonClassName={placesStyles.btn}
    />
  );
}
