import type { Metadata } from 'next';
import { OwnerTodoView } from '@/modules/owner-todo/OwnerTodoView';

// Trang là Server Component mỏng (chỉ export metadata tĩnh); nội dung là client (cần Bearer từ
// localStorage) — cùng khuôn mẫu dashboard/moderation/page.tsx. Dashboard KHÔNG index. Truy cập
// thực thi ở BE (Place.Approve, 403 nếu thiếu) — link điều hướng bị ẩn khỏi dashboard cho người
// không có capability tương ứng (xem capabilities.ts, dashboard/page.tsx).
export const metadata: Metadata = {
  title: 'Việc cần làm · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function OwnerTodoPage() {
  return <OwnerTodoView />;
}
