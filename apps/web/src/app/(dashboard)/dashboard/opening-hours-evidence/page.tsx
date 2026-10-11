import type { Metadata } from 'next';
import { OpeningHoursEvidenceQueueView } from '@/modules/evidence/OpeningHoursEvidenceQueueView';

export const metadata: Metadata = {
  title: 'Duyệt bằng chứng giờ mở cửa · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function OpeningHoursEvidenceModerationPage() {
  return <OpeningHoursEvidenceQueueView />;
}
