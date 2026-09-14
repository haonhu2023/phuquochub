import type { Metadata } from 'next';
import { MyPlaceEditProposalsView } from '@/modules/place-edit-proposals/MyPlaceEditProposalsView';

// Server Component mỏng (chỉ metadata tĩnh) — nội dung thật là client (cần Bearer từ localStorage),
// cùng khuôn dashboard/business-claims/page.tsx.
export const metadata: Metadata = {
  title: 'Đề xuất chỉnh sửa của tôi · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function MyPlaceEditProposalsPage() {
  return <MyPlaceEditProposalsView />;
}
