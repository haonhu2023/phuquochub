import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ProposeEditView } from '@/modules/place-edit-proposals/ProposeEditView';

// Server Component mỏng (chỉ metadata tĩnh) — cùng khuôn dashboard/places/report/page.tsx.
// useSearchParams (trong ProposeEditView) cần Suspense boundary khi phân tích tĩnh.
export const metadata: Metadata = {
  title: 'Đề xuất chỉnh sửa · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function ProposeEditPage() {
  return (
    <Suspense fallback={<main aria-busy="true">Đang tải…</main>}>
      <ProposeEditView />
    </Suspense>
  );
}
