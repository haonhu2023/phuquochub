import type { Metadata } from 'next';
import { ListingReportsQueueView } from '@/modules/listing-reports/ListingReportsQueueView';

export const metadata: Metadata = {
  title: 'Hàng chờ báo cáo · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function ListingReportsQueuePage() {
  return <ListingReportsQueueView />;
}
