import type { Metadata } from 'next';
import { ManagersView } from '@/modules/business-managers/ManagersView';

// Server Component mỏng: params là Promise (Next 16). Metadata tĩnh (không fetch được ở server vì
// token nằm ở localStorage client) — cùng khuôn dashboard/places/[id]/edit/page.tsx.
export const metadata: Metadata = {
  title: 'Quản lý người quản lý · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default async function PlaceManagersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ManagersView placeId={id} />;
}
