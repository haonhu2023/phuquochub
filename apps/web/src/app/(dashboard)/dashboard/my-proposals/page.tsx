import type { Metadata } from 'next';
import { MyProposalsView } from '@/modules/place-edit-proposals/MyProposalsView';

// Góp ý của tôi — chỉ người đã đăng nhập; dữ liệu lọc theo người gửi ở server. Không index.
export const metadata: Metadata = {
  title: 'Góp ý của tôi · PhuQuocHub',
  robots: { index: false, follow: false },
};

export default function MyProposalsPage() {
  return <MyProposalsView />;
}
