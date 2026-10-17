import type { Metadata } from 'next';
import { AdminRealEstateListingsView } from '@/modules/real-estate-listings/AdminRealEstateListingsView';

export const metadata: Metadata = {
  title: 'Quản lý tất cả tin bất động sản · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function AdminRealEstateListingsPage() {
  return <AdminRealEstateListingsView />;
}
