import type { Metadata } from 'next';
import { NewPlaceView } from '@/modules/place-management/NewPlaceView';

export const metadata: Metadata = {
  title: 'Thêm địa điểm · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function NewPlacePage() {
  return <NewPlaceView />;
}
