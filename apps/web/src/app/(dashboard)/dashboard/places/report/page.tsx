import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReportPlaceView } from '@/modules/place-reports/ReportPlaceView';

// Server Component mỏng (chỉ metadata tĩnh) — cùng khuôn dashboard/business-claims/new/page.tsx.
// useSearchParams (trong ReportPlaceView) cần Suspense boundary khi phân tích tĩnh.
export const metadata: Metadata = {
  title: 'Báo thông tin sai · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function ReportPlacePage() {
  return (
    <Suspense fallback={<main aria-busy="true">Đang tải…</main>}>
      <ReportPlaceView />
    </Suspense>
  );
}
