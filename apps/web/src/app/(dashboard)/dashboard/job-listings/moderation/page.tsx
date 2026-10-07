import type { Metadata } from 'next';
import { JobListingModerationQueueView } from '@/modules/job-listings/JobListingModerationQueueView';

export const metadata: Metadata = {
  title: 'Duyệt tin tuyển dụng · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function JobListingModerationPage() {
  return <JobListingModerationQueueView />;
}
