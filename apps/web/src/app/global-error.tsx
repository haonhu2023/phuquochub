'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

// PLACE-041: root-level catch-all error boundary — không tồn tại trước đây. Chỉ kích hoạt khi
// lỗi xảy ra trong chính root layout (rất hiếm — mọi route khác đã có error.tsx riêng của
// segment). Next.js yêu cầu global-error.tsx tự render <html>/<body> vì nó THAY THẾ root layout
// khi kích hoạt.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    // 2026-10-22 (error-tracking gap) — không dùng useLogError() dùng chung ở đây: hook đó sống
    // trong components/ui/ErrorRetryState.tsx, còn boundary này KHÔNG render ErrorRetryState (nó
    // thay thế cả root layout nên tối giản tối đa, xem ghi chú PLACE-041 ở trên) — gọi thẳng
    // Sentry.captureException() cho rõ ràng thay vì import một hook chỉ để dùng một nửa.
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="vi">
      <body>
        <div role="alert" style={{ padding: '2rem', textAlign: 'center' }}>
          <p>Đã có lỗi xảy ra.</p>
          <p style={{ color: '#6b7280' }}>Vui lòng thử lại sau.</p>
          <button type="button" onClick={() => reset()}>
            Thử lại
          </button>
        </div>
      </body>
    </html>
  );
}
