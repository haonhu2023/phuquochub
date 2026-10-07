import type { Metadata } from 'next';
import { NewJobListingView } from '@/modules/job-listings/NewJobListingView';

export const metadata: Metadata = {
  title: 'Đăng tin tuyển dụng · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function NewJobListingPage() {
  return <NewJobListingView />;
}
