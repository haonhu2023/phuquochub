import type { Metadata } from 'next';
import { EditPlaceView } from '@/modules/place-management/EditPlaceView';

// Server Component mỏng: params là Promise (Next 16). Metadata tĩnh (không fetch được place ở
// server vì token nằm ở localStorage client). Dashboard noindex.
export const metadata: Metadata = {
  title: 'Sửa địa điểm · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default async function EditPlacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditPlaceView placeId={id} />;
}
