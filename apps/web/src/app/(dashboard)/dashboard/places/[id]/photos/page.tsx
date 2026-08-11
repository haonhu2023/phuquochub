import type { Metadata } from 'next';
import { PhotosView } from '@/modules/place-photos/PhotosView';

// Server Component mỏng: params là Promise (Next 16). Metadata tĩnh (không fetch được ở server vì
// token nằm ở localStorage client) — cùng khuôn dashboard/places/[id]/contacts/page.tsx và
// dashboard/places/[id]/managers/page.tsx.
export const metadata: Metadata = {
  title: 'Ảnh của cơ sở · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default async function PlacePhotosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PhotosView placeId={id} />;
}
