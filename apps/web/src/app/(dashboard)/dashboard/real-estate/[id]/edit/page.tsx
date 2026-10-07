import type { Metadata } from 'next';
import { EditRealEstateListingView } from '@/modules/real-estate-listings/EditRealEstateListingView';

export const metadata: Metadata = {
  title: 'Sửa tin bất động sản · PhuQuocHub',
  robots: { index: false, follow: false },
};

interface Params {
  params: Promise<{ id: string }>;
}

export default async function EditRealEstateListingPage({ params }: Params) {
  const { id } = await params;
  return <EditRealEstateListingView id={id} />;
}
