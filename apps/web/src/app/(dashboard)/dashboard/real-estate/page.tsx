import type { Metadata } from 'next';
import { MyRealEstateListingsView } from '@/modules/real-estate-listings/MyRealEstateListingsView';

export const metadata: Metadata = {
  title: 'Tin bất động sản của tôi · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function MyRealEstateListingsPage() {
  return <MyRealEstateListingsView />;
}
