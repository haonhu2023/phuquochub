import type { Metadata } from 'next';
import { OpeningHoursEvidenceSubmitView } from '@/modules/evidence/OpeningHoursEvidenceSubmitView';

export const metadata: Metadata = {
  title: 'Nộp bằng chứng giờ mở cửa · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default async function OpeningHoursEvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OpeningHoursEvidenceSubmitView placeId={id} />;
}
