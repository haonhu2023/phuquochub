import { apiGetAuth, apiPost } from '@/lib/http';
import type { PresignResult } from '@/modules/media/uploadPipeline';
import type { PlaceEditProposalPhoto } from '../types';

// Mọi endpoint nằm dưới `/place-edit-proposals/{id}/media/…` — proposal id là ROUTE PARAM, không
// phải trường trong body (cùng lý do place-photos.api.ts không gửi place_id trong body).

export async function presignProposalPhoto(
  proposalId: string,
  input: { content_type: string; size: number; checksum_sha256: string },
  accessToken: string,
): Promise<PresignResult> {
  return apiPost<PresignResult>(`/place-edit-proposals/${encodeURIComponent(proposalId)}/media/presign`, accessToken, input);
}

export async function registerProposalPhoto(
  proposalId: string,
  key: string,
  accessToken: string,
): Promise<PlaceEditProposalPhoto> {
  return apiPost<PlaceEditProposalPhoto>(`/place-edit-proposals/${encodeURIComponent(proposalId)}/media`, accessToken, { key });
}

/** Ảnh của CHÍNH người gửi cho một đề xuất — mọi trạng thái kiểm duyệt. */
export async function listMyProposalPhotos(proposalId: string, accessToken: string): Promise<PlaceEditProposalPhoto[]> {
  return apiGetAuth<PlaceEditProposalPhoto[]>(`/place-edit-proposals/${encodeURIComponent(proposalId)}/media`, accessToken, {
    cache: 'no-store',
  });
}
