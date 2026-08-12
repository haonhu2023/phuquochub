// Suy ra NĂNG LỰC hiển thị từ danh sách vai trò mà `GET /users/me` đã trả về sẵn (Operator
// Bootstrap & Editorial Place Content, 2026-08-12).
//
// VÌ SAO KHÔNG lộ toàn bộ đồ thị RBAC ra frontend: giao diện chỉ cần trả lời ĐÚNG HAI câu hỏi —
// "có hiện lối vào Biên tập không" và "có hiện lối vào Kiểm duyệt không". Gửi cả danh sách
// permission (hoặc cả cây kế thừa) ra client là mở rộng bề mặt thông tin nội bộ mà không đổi lại
// được gì. `roles` vốn ĐÃ nằm trong response `/users/me` từ trước milestone này, nên đây KHÔNG
// phải trường mới, không phải endpoint mới — chỉ là đọc thứ đã có.
//
// **Đây thuần tuý là UX.** Backend vẫn là nơi quyết định duy nhất: mọi endpoint biên tập/kiểm
// duyệt đều đi qua `PermissionsGuard` + PDP. Người dùng tự đặt cờ này trong localStorage/devtools
// chỉ nhìn thấy một liên kết dẫn tới một trang mà API sẽ trả 403 — không có gì bị nới lỏng.
// Ngược lại cũng đúng: cờ sai/thiếu chỉ làm ẩn liên kết, không bao giờ cấp thêm quyền.

/** Vai trò giữ năng lực BIÊN TẬP nội dung mọi địa điểm (`*.Any` — xem SeedRbac/SeedPlacePermissions
 *  và migration SeedEditorialMediaPermission). Trùng khớp với chuỗi kế thừa thực tế:
 *  contributor → moderator → administrator → super_administrator. */
const EDITORIAL_ROLES = ['contributor', 'moderator', 'administrator', 'super_administrator'];

/** Vai trò giữ `Moderation.Queue.View` + `Media.Moderate`/`Review.Moderate` (SeedModerationPermissions). */
const MODERATION_ROLES = ['moderator', 'administrator', 'super_administrator'];

export interface UserCapabilities {
  /** Hiện lối vào "Biên tập nội dung" (sửa địa điểm chưa có chủ, thêm ảnh/giờ/liên hệ). */
  canEditorial: boolean;
  /** Hiện lối vào "Hàng chờ kiểm duyệt". */
  canModerate: boolean;
}

export const NO_CAPABILITIES: UserCapabilities = { canEditorial: false, canModerate: false };

/**
 * Ánh xạ vai trò → năng lực. Nhận `string[]` bất kỳ (giá trị đến TỪ MẠNG — kiểu TypeScript ở biên
 * API là lời hứa, không phải bảo đảm lúc chạy) và không bao giờ ném: danh sách rỗng/không hợp lệ
 * đều trả về "không có năng lực nào", tức là ẩn hết lối vào — fail closed đúng hướng.
 */
export function capabilitiesFromRoles(roles: readonly unknown[] | null | undefined): UserCapabilities {
  if (!Array.isArray(roles)) return NO_CAPABILITIES;
  const codes = roles.filter((r): r is string => typeof r === 'string');
  return {
    canEditorial: codes.some((c) => EDITORIAL_ROLES.includes(c)),
    canModerate: codes.some((c) => MODERATION_ROLES.includes(c)),
  };
}
