import { EditorialPlacesView } from '@/modules/editorial/EditorialPlacesView';

// Lối vào biên tập nội dung cho đội vận hành (Operator Bootstrap & Editorial Place Content).
// Nằm trong nhóm (dashboard) nên đã qua RouteGuard (bắt buộc đăng nhập); năng lực biên tập được
// kiểm tra thêm trong view, và backend vẫn là nơi cưỡng chế thật.
export const metadata = { title: 'Biên tập nội dung — PhuQuocHub' };

export default async function EditorialPlacesPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  return <EditorialPlacesView initialCategory={category ?? ''} />;
}
