import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ModerationQueueView } from '@/modules/moderation/ModerationQueueView';

// Trang là Server Component mỏng (chỉ để export metadata tĩnh); nội dung là client (cần Bearer từ
// localStorage). Dashboard KHÔNG index (robots noindex). Truy cập thực thi ở BE (403) — link điều
// hướng bị ẩn khỏi dashboard vì FE session chưa lộ permission (xem báo cáo M6).
export const metadata: Metadata = {
  title: 'Hàng chờ kiểm duyệt · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function ModerationQueuePage() {
  // useSearchParams (trong ModerationQueueView) cần Suspense boundary khi phân tích tĩnh.
  return (
    <Suspense fallback={<main aria-busy="true">Đang tải hàng chờ kiểm duyệt…</main>}>
      <ModerationQueueView />
    </Suspense>
  );
}
