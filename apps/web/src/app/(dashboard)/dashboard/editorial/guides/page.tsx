import type { Metadata } from 'next';
import { GuideArticlesIndexView } from '@/modules/guide-editor/GuideArticlesIndexView';

export const metadata: Metadata = { title: 'Biên tập cẩm nang · PhuQuocHub', robots: { index: false } };

export default function GuidesPage() {
  return <GuideArticlesIndexView />;
}
