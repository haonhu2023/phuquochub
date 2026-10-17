import type { Metadata } from 'next';
import { JobListingTranslationModerationQueueView } from '@/modules/job-listings/JobListingTranslationModerationQueueView';

export const metadata: Metadata = {
  title: 'Duyệt bản dịch tiếng Anh · Tin tuyển dụng · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function JobListingTranslationModerationPage() {
  return <JobListingTranslationModerationQueueView />;
}
