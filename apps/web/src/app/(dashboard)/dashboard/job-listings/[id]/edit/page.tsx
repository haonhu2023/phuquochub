import type { Metadata } from 'next';
import { EditJobListingView } from '@/modules/job-listings/EditJobListingView';

export const metadata: Metadata = {
  title: 'Sửa tin tuyển dụng · PhuQuocHub',
  robots: { index: false, follow: false },
};

interface Params {
  params: Promise<{ id: string }>;
}

export default async function EditJobListingPage({ params }: Params) {
  const { id } = await params;
  return <EditJobListingView id={id} />;
}
