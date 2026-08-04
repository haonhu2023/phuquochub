import type { Metadata } from 'next';
import { ModerationCaseView } from '@/modules/moderation/ModerationCaseView';

// Server Component mỏng: params là Promise (Next 16). Metadata tĩnh (không fetch được case ở server
// vì token nằm ở localStorage client). Dashboard noindex.
export const metadata: Metadata = {
  title: 'Chi tiết case kiểm duyệt · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default async function ModerationCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ModerationCaseView id={id} />;
}
