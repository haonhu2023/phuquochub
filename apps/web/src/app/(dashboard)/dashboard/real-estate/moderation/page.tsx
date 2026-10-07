import type { Metadata } from 'next';
import { RealEstateListingModerationQueueView } from '@/modules/real-estate-listings/RealEstateListingModerationQueueView';

export const metadata: Metadata = {
  title: 'Duyệt tin bất động sản · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function RealEstateListingModerationPage() {
  return <RealEstateListingModerationQueueView />;
}
