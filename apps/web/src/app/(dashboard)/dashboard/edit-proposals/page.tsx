import type { Metadata } from 'next';
import { PlaceEditProposalsQueueView } from '@/modules/place-edit-proposals/PlaceEditProposalsQueueView';

// Server Component mỏng (chỉ metadata tĩnh) — cùng khuôn dashboard/moderation/page.tsx. Dashboard
// KHÔNG index. Truy cập thực thi ở BE (PlaceEditProposal.Moderate, 403 nếu thiếu) — link điều
// hướng bị ẩn khỏi dashboard cho người không có capability tương ứng.
export const metadata: Metadata = {
  title: 'Duyệt đề xuất chỉnh sửa · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function PlaceEditProposalsQueuePage() {
  return <PlaceEditProposalsQueueView />;
}
