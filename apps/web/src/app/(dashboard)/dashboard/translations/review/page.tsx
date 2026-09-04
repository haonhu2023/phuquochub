import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TranslationReviewQueueView } from '@/modules/translation-review/TranslationReviewQueueView';

// Trang là Server Component mỏng (chỉ export metadata tĩnh); nội dung là client (cần Bearer từ
// localStorage) — cùng quy ước dashboard/moderation/page.tsx. Dashboard KHÔNG index (robots
// noindex). Truy cập thực thi ở BE (403) — liên kết điều hướng bị ẩn khỏi dashboard cho người
// không giữ PlaceTranslation.Review.Any (xem capabilities.ts), nhưng route này KHÔNG bí mật: gõ
// thẳng URL vẫn chỉ dẫn tới ForbiddenState nếu BE từ chối.
export const metadata: Metadata = {
  title: 'Duyệt bản dịch · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function TranslationReviewPage() {
  // useSearchParams (trong TranslationReviewQueueView) cần Suspense boundary khi phân tích tĩnh.
  return (
    <Suspense fallback={<main aria-busy="true">Đang tải hàng chờ duyệt bản dịch…</main>}>
      <TranslationReviewQueueView />
    </Suspense>
  );
}
