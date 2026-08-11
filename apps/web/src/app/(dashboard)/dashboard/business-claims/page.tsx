import type { Metadata } from 'next';
import { MyClaimsView } from '@/modules/business-claims/MyClaimsView';

// Server Component mỏng (chỉ metadata tĩnh) — nội dung thật là client (cần Bearer từ localStorage),
// cùng khuôn dashboard/places/page.tsx.
export const metadata: Metadata = {
  title: 'Yêu cầu xác nhận quyền quản lý · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function MyBusinessClaimsPage() {
  return <MyClaimsView />;
}
