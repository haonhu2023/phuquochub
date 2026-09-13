import { apiPost } from '@/lib/http';
import type { CreatePlaceEditProposalInput, PlaceEditProposalFieldKey } from '../types';

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
