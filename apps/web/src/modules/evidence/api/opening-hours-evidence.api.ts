import { apiGetAuth, apiPost } from '@/lib/http';
import type {
  OpeningHoursEvidencePendingView,
  ReviewOpeningHoursEvidenceInput,
  ReviewOpeningHoursEvidenceResult,
  SubmitOpeningHoursEvidenceInput,
  SubmitOpeningHoursEvidenceResult,
} from '../types';

/** POST /places/:id/opening-hours-evidence (Place.Edit.Managed/.Any theo đúng :id). */
export async function submitOpeningHoursEvidence(
  placeId: string,
  input: SubmitOpeningHoursEvidenceInput,
  accessToken: string,
): Promise<SubmitOpeningHoursEvidenceResult> {
  return apiPost<SubmitOpeningHoursEvidenceResult>(`/places/${encodeURIComponent(placeId)}/opening-hours-evidence`, accessToken, input);
}

/** GET /opening-hours-evidence/pending (Source.Verify). */
export async function listPendingOpeningHoursEvidence(accessToken: string): Promise<OpeningHoursEvidencePendingView[]> {
  return apiGetAuth<OpeningHoursEvidencePendingView[]>('/opening-hours-evidence/pending', accessToken, { cache: 'no-store' });
}

/** POST /opening-hours-evidence/:id/review (Source.Verify). */
export async function reviewOpeningHoursEvidence(
  evidenceArtifactId: string,
  input: ReviewOpeningHoursEvidenceInput,
  accessToken: string,
): Promise<ReviewOpeningHoursEvidenceResult> {
  return apiPost<ReviewOpeningHoursEvidenceResult>(`/opening-hours-evidence/${encodeURIComponent(evidenceArtifactId)}/review`, accessToken, input);
}
