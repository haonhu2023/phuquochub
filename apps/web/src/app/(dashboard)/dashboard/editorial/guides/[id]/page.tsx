import type { Metadata } from 'next';
import { GuideArticleEditorView } from '@/modules/guide-editor/GuideArticleEditorView';

export const metadata: Metadata = { title: 'Sửa cẩm nang · PhuQuocHub', robots: { index: false } };

export default async function GuideEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GuideArticleEditorView id={id} />;
}
