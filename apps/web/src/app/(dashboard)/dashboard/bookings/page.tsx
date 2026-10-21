import type { Metadata } from 'next';
import { MyBookingsView } from '@/modules/bookings/MyBookingsView';

// Server Component mỏng (chỉ metadata tĩnh) — nội dung thật là client (cần Bearer từ localStorage),
// cùng khuôn dashboard/places/page.tsx.
export const metadata: Metadata = {
  title: 'Đặt chỗ của cơ sở tôi · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function MyBookingsPage() {
  return <MyBookingsView />;
}
