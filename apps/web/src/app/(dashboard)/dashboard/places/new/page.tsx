import type { Metadata } from 'next';
import { NewPlaceView } from '@/modules/place-management/NewPlaceView';

export const metadata: Metadata = {
  title: 'Thêm địa điểm · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default async function NewPlacePage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  return <NewPlaceView initialCategory={category} />;
}
