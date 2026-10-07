import type { Metadata } from 'next';
import { NewRealEstateListingView } from '@/modules/real-estate-listings/NewRealEstateListingView';

export const metadata: Metadata = {
  title: 'Đăng tin bất động sản · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function NewRealEstateListingPage() {
  return <NewRealEstateListingView />;
}
