'use client';

import { useLogError } from '@/components/ui/ErrorRetryState';
import placeStyles from '@/modules/places/places.module.css';

// Error boundary cho segment /dashboard/audit-log — cùng khuôn dashboard/moderation/error.tsx.
export default function AuditLogError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useLogError(error);

  return (
    <main>
      <div className={placeStyles.state} role="alert">
        <p className={placeStyles.stateTitle}>Đã xảy ra lỗi</p>
        <p>Không thể hiển thị nhật ký quản trị. Vui lòng thử lại.</p>
        <button type="button" className={placeStyles.btn} onClick={() => reset()}>
          Thử lại
        </button>
      </div>
    </main>
  );
}
