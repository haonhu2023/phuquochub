import { apiDeleteAuth, apiGetAuth, apiPost } from '@/lib/http';
import type { SavedItemTargetType, SavedItemView } from '../types';

export async function listMySavedItems(accessToken: string): Promise<SavedItemView[]> {
  return apiGetAuth<SavedItemView[]>('/saved-items', accessToken, { cache: 'no-store' });
}

export async function saveItem(targetType: SavedItemTargetType, targetId: string, accessToken: string): Promise<void> {
  await apiPost<null>('/saved-items', accessToken, { target_type: targetType, target_id: targetId });
}

export async function unsaveItem(targetType: SavedItemTargetType, targetId: string, accessToken: string): Promise<void> {
  await apiDeleteAuth<null>(`/saved-items/${encodeURIComponent(targetType)}/${encodeURIComponent(targetId)}`, accessToken);
}
