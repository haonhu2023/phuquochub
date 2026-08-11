import type { Metadata } from 'next';
import { ClaimReviewDetail } from '@/modules/business-claims/ClaimReviewDetail';

// Chi tiết + quyết định một yêu cầu xác nhận quyền quản lý. Dashboard KHÔNG index; quyền
// `Business.Verify` cưỡng chế ở backend (403 -> trạng thái "không có quyền" trong component).
export const metadata: Metadata = {
  title: 'Chi tiết yêu cầu xác nhận · PhuQuocHub',
  robots: { index: false, follow: false },
};

interface Params {
  params: Promise<{ id: string }>;
}

export default async function ClaimReviewDetailPage({ params }: Params) {
  const { id } = await params;
  return <ClaimReviewDetail claimId={id} />;
}
