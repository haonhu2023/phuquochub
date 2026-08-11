import { apiDeleteAuth, apiGetAuth, apiPost } from '@/lib/http';
import type { BusinessManager, LookupBusinessUserResult } from '../types';

// Client API Business Manager Management. Bốn endpoint: hai đã có sẵn từ trước (POST/DELETE
// /business/{id}/managers[/:userId] — Business Manager Assignment/Revocation milestone), hai mới
// (GET .../managers, GET .../managers/lookup — prerequisite gap task). Cùng envelope/ApiError xử
// lý tập trung ở lib/http như place-management.api.ts/business-claims.api.ts.

/** GET /business/{id}/managers — manager hiệu lực của một cơ sở (owner-only, PermissionsGuard). */
export async function listBusinessManagers(placeId: string, accessToken: string): Promise<BusinessManager[]> {
  return apiGetAuth<BusinessManager[]>(`/business/${encodeURIComponent(placeId)}/managers`, accessToken, {
    cache: 'no-store',
  });
}

/**
 * GET /business/{id}/managers/lookup?email=... — tra user_id từ email CHÍNH XÁC để điền form gán
 * manager (KHÔNG có tìm kiếm mờ/liệt kê danh bạ — xem dto/business-manager.dto.ts phía API).
 */
export async function lookupBusinessUserByEmail(
  placeId: string,
  email: string,
  accessToken: string,
): Promise<LookupBusinessUserResult> {
  return apiGetAuth<LookupBusinessUserResult>(
    `/business/${encodeURIComponent(placeId)}/managers/lookup?email=${encodeURIComponent(email)}`,
    accessToken,
    { cache: 'no-store' },
  );
}

/** POST /business/{id}/managers — gán user_id (đã tra qua lookup) làm manager. */
export async function assignBusinessManager(placeId: string, userId: string, accessToken: string): Promise<void> {
  await apiPost(`/business/${encodeURIComponent(placeId)}/managers`, accessToken, { user_id: userId });
}

/** DELETE /business/{id}/managers/{userId} — thu hồi manager hiệu lực. */
export async function revokeBusinessManager(placeId: string, userId: string, accessToken: string): Promise<null> {
  return apiDeleteAuth<null>(
    `/business/${encodeURIComponent(placeId)}/managers/${encodeURIComponent(userId)}`,
    accessToken,
  );
}
