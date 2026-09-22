import { apiGetAuth, apiPatchAuth, apiPost } from '@/lib/http';
import type { GuideArticleDetail, GuideArticleStatus, GuideBlockType } from '../../guide/types';

export interface GuideArticleSummary {
  id: string;
  slug: string;
  locale: string;
  title: string;
  status: GuideArticleStatus;
  updatedAt: string;
}

export function listGuideDrafts(accessToken: string): Promise<GuideArticleSummary[]> {
  return apiGetAuth<GuideArticleSummary[]>('/admin/guide-articles', accessToken);
}

export interface SaveGuideDraftInput {
  slug: string;
  locale: 'vi' | 'en';
  title: string;
  intro?: string;
  heroMediaId?: string;
  blocks: Array<{
    blockType: GuideBlockType;
    content: Record<string, unknown>;
    needsDecision?: boolean;
    decisionNote?: string;
  }>;
}

// All three reuse the SAME apiGetAuth/apiPost/apiPatchAuth helpers @/lib/http.ts already provides
// (Place Content Management MVP / moderation-queue precedent) — zero new HTTP plumbing.

export function getGuideDraft(id: string, accessToken: string): Promise<GuideArticleDetail> {
  return apiGetAuth<GuideArticleDetail>(`/admin/guide-articles/${id}`, accessToken);
}

export function createGuideDraft(
  input: SaveGuideDraftInput,
  accessToken: string,
): Promise<GuideArticleDetail> {
  return apiPost<GuideArticleDetail>('/admin/guide-articles', accessToken, input);
}

// PATCH body shape — deliberately NOT SaveGuideDraftInput + expectedContentVersion. slug/locale
// are set once at creation and immutable afterwards (same rule as Place — see UpdateGuideDraftDto
// on the API side); the API's PATCH DTO no longer accepts them, and with `forbidNonWhitelisted`
// on the server, sending them here would 400 the request rather than silently ignore it like
// before.
export interface UpdateGuideDraftInput {
  title: string;
  intro?: string;
  heroMediaId?: string;
  blocks: SaveGuideDraftInput['blocks'];
  expectedContentVersion: number;
}

// `expectedContentVersion` is the CAS token — always the value from the article the editor last
// loaded/saved. A stale value surfaces as ApiError.isConflict (409): the caller should tell the
// editor to reload rather than silently retry with a guessed version.
export function saveGuideDraft(
  id: string,
  input: UpdateGuideDraftInput,
  accessToken: string,
): Promise<GuideArticleDetail> {
  return apiPatchAuth<GuideArticleDetail>(`/admin/guide-articles/${id}`, accessToken, input);
}

export function publishGuideArticle(
  id: string,
  expectedContentVersion: number,
  accessToken: string,
): Promise<GuideArticleDetail> {
  return apiPost<GuideArticleDetail>(`/admin/guide-articles/${id}/publish`, accessToken, { expectedContentVersion });
}

// G-B (2026-09-22) — đối xứng publishGuideArticle: gỡ công khai về draft.
export function unpublishGuideArticle(
  id: string,
  expectedContentVersion: number,
  accessToken: string,
): Promise<GuideArticleDetail> {
  return apiPost<GuideArticleDetail>(`/admin/guide-articles/${id}/unpublish`, accessToken, { expectedContentVersion });
}

export function flagContentGap(
  id: string,
  blockId: string,
  note: string,
  accessToken: string,
): Promise<{ success: boolean }> {
  return apiPost<{ success: boolean }>(`/admin/guide-articles/${id}/flag-gap`, accessToken, { blockId, note });
}
