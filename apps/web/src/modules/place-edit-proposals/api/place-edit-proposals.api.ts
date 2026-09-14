import { apiGetAuth, apiPost } from '@/lib/http';
import type { CreatePlaceEditProposalInput, MyPlaceEditProposal, PlaceEditProposalFieldKey } from '../types';

// POST /places/{id}/edit-proposals — trả 201 CREATED (PlaceEditProposalsController.submit). Cùng
// khuôn reportPlace (place-reports.api.ts): một hàm mỏng, envelope/ApiError xử lý tập trung ở
// lib/http. Không đọc body trả về — web MVP chỉ cần biết gửi thành công hay không.
export async function submitPlaceEditProposal<K extends PlaceEditProposalFieldKey>(
  placeId: string,
  input: CreatePlaceEditProposalInput<K>,
  accessToken: string,
): Promise<void> {
  await apiPost<null>(`/places/${encodeURIComponent(placeId)}/edit-proposals`, accessToken, input);
}

// GET /place-edit-proposals/mine — "Đề xuất của tôi" (PlaceEditProposalsController.listMine, tự
// lọc theo JWT, KHÔNG nhận tham số proposer nào từ client). Cùng khuôn listMyBusinessClaims
// (business-claims.api.ts). `cache: 'no-store'` — trạng thái đổi khi kiểm duyệt viên xử lý, không
// cache phía Next.js.
export async function listMyPlaceEditProposals(accessToken: string): Promise<MyPlaceEditProposal[]> {
  return apiGetAuth<MyPlaceEditProposal[]>('/place-edit-proposals/mine', accessToken, { cache: 'no-store' });
}
