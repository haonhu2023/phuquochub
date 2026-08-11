import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NewClaimView } from '@/modules/business-claims/NewClaimView';

// Server Component mỏng (chỉ metadata tĩnh) — cùng khuôn dashboard/moderation/page.tsx và
// dashboard/places/page.tsx. useSearchParams (trong NewClaimView) cần Suspense boundary khi phân
// tích tĩnh.
export const metadata: Metadata = {
  title: 'Xác nhận quyền quản lý · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function NewBusinessClaimPage() {
  return (
    <Suspense fallback={<main aria-busy="true">Đang tải…</main>}>
      <NewClaimView />
    </Suspense>
  );
}
