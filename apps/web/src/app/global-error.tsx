'use client';

import { useEffect } from 'react';

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
