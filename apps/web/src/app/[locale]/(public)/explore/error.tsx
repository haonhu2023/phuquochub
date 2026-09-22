'use client';

import { ErrorRetryState, useLogError } from '@/components/ui/ErrorRetryState';
import placesStyles from '@/modules/places/places.module.css';

// Error boundary cho /explore — cùng khuôn placesStyles.state đã dùng ở hotels/restaurants/tours
// (§`docs/delivery/reports/ERROR-LOADING-BOUNDARIES-2026-08-02.md`). Trang này không tự fetch dữ
// liệu ở Server Component (chỉ render <SearchMapExplorer /> — client component tự xử lý lỗi fetch
// của chính nó), nên boundary này chủ yếu là phòng vệ (render-time exception ở cây con, hydration
// mismatch...) — vẫn đúng theo chỉ đạo bao phủ đồng nhất mọi route.
export default function ExploreError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useLogError(error);
  return (
    <ErrorRetryState
      titleVi="Không tải được trang khám phá"
      titleEn="Couldn't load the explore page"
      onRetry={reset}
      className={placesStyles.state}
      titleClassName={placesStyles.stateTitle}
      buttonClassName={placesStyles.btn}
    />
  );
}
