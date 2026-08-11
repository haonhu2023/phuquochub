import type { Metadata } from 'next';
import { ContactsView } from '@/modules/place-contacts/ContactsView';

// Server Component mỏng: params là Promise (Next 16). Metadata tĩnh (không fetch được ở server vì
// token nằm ở localStorage client) — cùng khuôn dashboard/places/[id]/edit/page.tsx và
// dashboard/places/[id]/managers/page.tsx.
export const metadata: Metadata = {
  title: 'Quản lý liên hệ · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default async function PlaceContactsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContactsView placeId={id} />;
}
