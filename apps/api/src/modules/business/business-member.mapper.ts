import { BusinessMember } from './entities/business-member.entity';
import type { ActiveManagerRow } from './repositories/business-members.repository';
import { MemberRole } from './business.enums';

// business_members không có dữ liệu riêng tư (khác BusinessClaim.evidence) — không cần tách
// summary/detail, trả nguyên hình dạng snake_case chuẩn (khớp data-dictionary). Dùng chung cho
// mọi hành động ghi vào bảng này (Manager Assignment/Revocation, Ownership Transfer) — cùng một
// dòng `business_members`, chỉ khác `role`.
export interface BusinessMemberResponse {
  id: string;
  place_id: string;
  user_id: string;
  role: string;
  granted_by: string | null;
  granted_at: string;
  revoked_at: string | null;
}

export function toBusinessMemberResponse(m: BusinessMember): BusinessMemberResponse {
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

// GET /business/{id}/managers (owner-facing danh sách quản lý viên) — hình dạng RIÊNG, HẸP HƠN
// BusinessMemberResponse có chủ đích: không `id`/`place_id`/`granted_by`/`revoked_at` (nội bộ,
// không cần cho màn hình này — danh sách vốn đã lọc revoked_at IS NULL nên "revoked_at" luôn null,
// vô nghĩa khi hiển thị). Thêm `display_name`/`email` (join từ `users`) — lý do CÓ MẶT `email`:
// đây là owner xem chính nhân sự HỌ đã mời quản lý cơ sở của họ, không phải hồ sơ công khai của
// người lạ; email cần thiết để owner nhận ra ĐÚNG người (nhiều user có thể trùng display_name).
export interface BusinessManagerListItem {
  user_id: string;
  display_name: string;
  email: string;
  role: string;
  granted_at: string;
}

export function toBusinessManagerListItem(row: ActiveManagerRow): BusinessManagerListItem {
  return {
    user_id: row.userId,
    display_name: row.displayName,
    email: row.email,
    role: MemberRole.MANAGER,
    granted_at: row.grantedAt.toISOString(),
  };
}
