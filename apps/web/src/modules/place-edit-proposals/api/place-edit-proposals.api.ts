import { apiGetAuth, apiPost } from '@/lib/http';
import type {
  CreatePlaceEditProposalInput,
  DecidePlaceEditProposalInput,
  PlaceEditProposalFieldKey,
  PlaceEditProposalStatus,
  PlaceEditProposalView,
} from '../types';

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

/** GET /place-edit-proposals?status=&place_id= — hàng chờ duyệt (PlaceEditProposal.Moderate). */
export async function listPlaceEditProposals(
  accessToken: string,
  status?: PlaceEditProposalStatus,
): Promise<PlaceEditProposalView[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiGetAuth<PlaceEditProposalView[]>(`/place-edit-proposals${qs}`, accessToken, { cache: 'no-store' });
}

/**
 * POST /place-edit-proposals/{id}/decide (PlaceEditProposal.Moderate). Áp dụng approve NGAY qua
 * PlacesService.update() phía backend (transaction khoá + so hash giá trị gốc) — không có bước
 * "mở editor riêng" ở web, xem PlaceEditProposalsService.decide()'s doc comment. `ApiError.status`
 * phân biệt 409 (case đã xử lý) và (phía service) trạng thái CONFLICT trả về trong body 200 bình
 * thường — không phải lỗi HTTP, xem PlaceEditProposalStatus.CONFLICT.
 */
export async function decidePlaceEditProposal(
  id: string,
  input: DecidePlaceEditProposalInput,
  accessToken: string,
): Promise<PlaceEditProposalView> {
  return apiPost<PlaceEditProposalView>(`/place-edit-proposals/${encodeURIComponent(id)}/decide`, accessToken, input);
}
