// Kiểu FE cho Business Manager Management (prerequisite gap task, 2026-08-11). Wire format
// snake_case, khớp business-member.mapper.ts/dto/business-manager.dto.ts của API. KHÔNG có type
// nào trong @phuquochub/shared-types cho module Business (cùng tiền lệ modules/business-claims/
// types.ts) — dùng type FE cục bộ.

// Khớp BusinessManagerListItem (business-member.mapper.ts) — response của
// GET /business/{id}/managers. CHỈ manager hiệu lực (không owner, không revoked) — role LUÔN
// 'manager' nhưng field vẫn giữ để khớp contract backend 1-1, không tự suy diễn.
export interface BusinessManager {
  user_id: string;
  display_name: string;
  email: string;
  role: string;
  granted_at: string;
}

// Khớp response GET /business/{id}/managers/lookup — CỐ Ý không có `email` (client đã biết, xem
// business-managers.service.ts `lookupUserByEmail()` — không echo lại field caller đã tự cung cấp).
export interface LookupBusinessUserResult {
  user_id: string;
  display_name: string;
}
