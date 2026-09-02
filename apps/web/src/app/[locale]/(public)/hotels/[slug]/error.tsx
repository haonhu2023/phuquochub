'use client';

import { useEffect } from 'react';

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
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert">
      <p>Không tải được thông tin khách sạn.</p>
      <p style={{ color: '#6b7280' }}>Có thể do sự cố kết nối hoặc máy chủ đang bận. Vui lòng thử lại.</p>
      <button type="button" onClick={() => reset()}>
        Thử lại
      </button>
    </div>
  );
}
