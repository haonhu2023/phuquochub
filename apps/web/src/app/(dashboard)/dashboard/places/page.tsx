import type { Metadata } from 'next';
import { MyPlacesView } from '@/modules/place-management/MyPlacesView';

// Server Component mỏng (chỉ metadata tĩnh) — nội dung thật là client (cần Bearer từ localStorage),
// cùng khuôn dashboard/moderation/page.tsx.
export const metadata: Metadata = {
  title: 'Địa điểm của tôi · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function MyPlacesPage() {
  return <MyPlacesView />;
}
