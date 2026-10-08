import type { Metadata } from 'next';
import { MySavedItemsView } from '@/modules/saved-items/MySavedItemsView';

export const metadata: Metadata = {
  title: 'Tin đã lưu · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function MySavedItemsPage() {
  return <MySavedItemsView />;
}
