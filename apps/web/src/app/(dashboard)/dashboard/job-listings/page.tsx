import type { Metadata } from 'next';
import { MyJobListingsView } from '@/modules/job-listings/MyJobListingsView';

export const metadata: Metadata = {
  title: 'Tin tuyển dụng của tôi · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function MyJobListingsPage() {
  return <MyJobListingsView />;
}
