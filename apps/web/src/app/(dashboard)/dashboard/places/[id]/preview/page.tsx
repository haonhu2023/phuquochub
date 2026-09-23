import type { Metadata } from 'next';
import { PlacePreviewView } from '@/modules/place-management/PlacePreviewView';

// Server Component mỏng — cùng khuôn dashboard/places/[id]/{edit,contacts,photos}/page.tsx.
export const metadata: Metadata = {
  title: 'Xem trước địa điểm · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default async function PlacePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlacePreviewView placeId={id} />;
}
