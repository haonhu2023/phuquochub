import type { Metadata } from 'next';
import { AdminJobListingsView } from '@/modules/job-listings/AdminJobListingsView';

export const metadata: Metadata = {
  title: 'Quản lý tất cả tin tuyển dụng · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function AdminJobListingsPage() {
  return <AdminJobListingsView />;
}
