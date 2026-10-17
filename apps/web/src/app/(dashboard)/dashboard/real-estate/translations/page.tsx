import type { Metadata } from 'next';
import { RealEstateListingTranslationModerationQueueView } from '@/modules/real-estate-listings/RealEstateListingTranslationModerationQueueView';

export const metadata: Metadata = {
  title: 'Duyệt bản dịch tiếng Anh · Tin bất động sản · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function RealEstateListingTranslationModerationPage() {
  return <RealEstateListingTranslationModerationQueueView />;
}
