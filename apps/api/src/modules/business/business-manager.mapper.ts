import { BusinessMember } from './entities/business-member.entity';

// business_members không có dữ liệu riêng tư (khác BusinessClaim.evidence) — không cần tách
// summary/detail, trả nguyên hình dạng snake_case chuẩn (khớp data-dictionary).
export interface BusinessManagerResponse {
  id: string;
  place_id: string;
  user_id: string;
  role: string;
  granted_by: string | null;
  granted_at: string;
  revoked_at: string | null;
}

export function toBusinessManagerResponse(m: BusinessMember): BusinessManagerResponse {
  return {
    id: m.id,
    place_id: m.placeId,
    user_id: m.userId,
    role: m.role,
    granted_by: m.grantedBy,
    granted_at: m.grantedAt.toISOString(),
    revoked_at: m.revokedAt ? m.revokedAt.toISOString() : null,
  };
}
