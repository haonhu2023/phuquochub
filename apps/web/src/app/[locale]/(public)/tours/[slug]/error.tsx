'use client';

import { useEffect } from 'react';

// PLACE-041: error boundary cho /tours/[slug] — xem hotels/[slug]/error.tsx cho ghi chú đầy đủ.
export default function TourDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert">
      <p>Không tải được thông tin tour.</p>
      <p style={{ color: '#6b7280' }}>Có thể do sự cố kết nối hoặc máy chủ đang bận. Vui lòng thử lại.</p>
      <button type="button" onClick={() => reset()}>
        Thử lại
      </button>
    </div>
  );
}
