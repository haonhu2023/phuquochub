import { apiGetAuth } from '@/lib/http';
import type { OwnerDecisionItem } from '../types';
import { previewPlace } from '@/modules/place-management/api/place-management.api';

// Trang "Việc cần làm" — TÁI SỬ DỤNG hai endpoint đã có, không thêm route API mới:
//   GET /owner-decisions?status=pending  (Place.Approve — content_owner giữ trực tiếp, xem
//     SeedContentOwnerRole1720006200000) — danh sách câu hỏi đang chờ quyết định.
//   GET /places/:id/preview              (Place.Edit.Managed/.Any — content_owner giữ .Any) — lấy
//     tên/slug địa điểm để hiển thị, cùng endpoint EditPlaceView đã dùng để tải form sửa.
// KHÔNG có mapper snake_case ở phía API cho owner-decisions (xem types.ts) nên đọc thẳng camelCase.

/** GET /owner-decisions?status=pending&limit=&offset= */
export async function listPendingOwnerDecisions(
  accessToken: string,
  { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<OwnerDecisionItem[]> {
  const qs = new URLSearchParams({ status: 'pending', limit: String(limit), offset: String(offset) });
  return apiGetAuth<OwnerDecisionItem[]>(`/owner-decisions?${qs.toString()}`, accessToken, { cache: 'no-store' });
}

/**
 * Ghép tên/slug địa điểm cho từng item (item chỉ có `placeId`). Chỉ gọi cho các `placeId` KHÁC
 * NHAU (Set) — một place có thể có nhiều câu hỏi đang chờ cùng lúc (nhiều field xung đột), không
 * gọi previewPlace() lặp lại cho cùng một id. Item nào previewPlace() 403/404 (place đã bị xoá,
 * hoặc — không nên xảy ra vì cùng permission — quyền vừa bị thu hồi) thì giữ placeName=null, KHÔNG
 * làm hỏng cả trang: đây là hiển thị phụ trợ, không phải điều kiện để thấy hàng đó.
 */
export async function resolvePlaceNames(
  placeIds: readonly (string | null)[],
  accessToken: string,
): Promise<Map<string, { name: string; slug: string }>> {
  const uniqueIds = [...new Set(placeIds.filter((id): id is string => id != null))];
  const entries = await Promise.all(
    uniqueIds.map(async (id): Promise<[string, { name: string; slug: string } | null]> => {
      try {
        const place = await previewPlace(id, accessToken);
        return [id, { name: place.name, slug: place.slug }];
      } catch {
        return [id, null];
      }
    }),
  );
  const map = new Map<string, { name: string; slug: string }>();
  for (const [id, value] of entries) {
    if (value) map.set(id, value);
  }
  return map;
}
