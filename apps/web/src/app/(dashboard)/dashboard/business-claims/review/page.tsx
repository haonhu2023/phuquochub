import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ClaimsReviewView } from '@/modules/business-claims/ClaimsReviewView';

// Server Component mỏng (chỉ export metadata tĩnh); nội dung là client (cần Bearer từ localStorage).
// Dashboard KHÔNG index. Quyền `Business.Verify` cưỡng chế Ở BACKEND (403) — cùng quy ước
// /dashboard/moderation: liên kết không hiện trên bảng điều khiển chung vì session FE chưa lộ
// permission, nên không thể biết trước ai bấm vào sẽ bị 403.
export const metadata: Metadata = {
  title: 'Duyệt yêu cầu xác nhận quyền quản lý · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function ClaimsReviewPage() {
  // useSearchParams (trong ClaimsReviewView) cần Suspense boundary khi phân tích tĩnh.
  return (
    <Suspense fallback={<main aria-busy="true">Đang tải hàng đợi duyệt yêu cầu…</main>}>
      <ClaimsReviewView />
    </Suspense>
  );
}
