'use client';

import { useEffect } from 'react';
import { useLocale } from '@/lib/LocaleContext';

// X1 (2026-09-22) — trước bản này, MỖI route public có một `error.tsx` gần như trùng lặp y hệt
// (tiêu đề + "Có thể do sự cố kết nối..." + nút "Thử lại"), toàn bộ hardcode tiếng Việt kể cả dưới
// `/en`. Gom lại MỘT component dùng chung: sửa i18n một chỗ thay vì rải ternary vào 13 file, và
// route nào cần tiêu đề riêng chỉ truyền `titleVi`/`titleEn`. KHÔNG đụng đến trạng thái HTTP —
// khác `notFound()`, một lỗi ném ra (uncaught throw) đã quyết định status TRƯỚC KHI error.tsx
// (luôn là Client Component — yêu cầu bắt buộc của React Error Boundary) render, nên đọc locale
// qua Context ở đây an toàn, không lặp lại rủi ro đã gặp với not-found.tsx.
export function ErrorRetryState({
  titleVi,
  titleEn,
  onRetry,
  className,
  titleClassName,
  buttonClassName,
}: {
  titleVi: string;
  titleEn: string;
  onRetry: () => void;
  className?: string;
  titleClassName?: string;
  buttonClassName?: string;
}) {
  const locale = useLocale();
  return (
    <div className={className} role="alert">
      <p className={titleClassName}>{locale === 'en' ? titleEn : titleVi}</p>
      <p>
        {locale === 'en'
          ? 'This may be a connection issue or the server is busy. Please try again.'
          : 'Có thể do sự cố kết nối hoặc máy chủ đang bận. Vui lòng thử lại.'}
      </p>
      <button type="button" className={buttonClassName} onClick={onRetry}>
        {locale === 'en' ? 'Try again' : 'Thử lại'}
      </button>
    </div>
  );
}

/** Ghi log lỗi phía client để debug — KHÔNG hiển thị nội dung lỗi/stack cho người dùng. Dùng
 *  trong `useEffect` của mỗi `error.tsx` gọi component này. */
export function useLogError(error: Error & { digest?: string }): void {
  useEffect(() => {
    console.error(error);
  }, [error]);
}
