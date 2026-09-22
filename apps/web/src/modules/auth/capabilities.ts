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

/**
 * `content_owner` (SeedContentOwnerRole, launch-readiness pass 2026-09-22) thêm vào CẢ BỐN danh
 * sách bên dưới — role đó giữ trực tiếp (không qua kế thừa) `Place.Edit.Any`, `Media.Moderate`,
 * `PlaceTranslation.Review.Any` VÀ `Guide.Edit.Any` cùng lúc (xem migration
 * 1720006200000-SeedContentOwnerRole.ts). Thiếu ở đây không làm mất quyền API nào (mọi endpoint
 * vẫn tự gác qua PermissionsGuard), nhưng làm chính owner đăng nhập vào KHÔNG THẤY một lối vào
 * dashboard nào cho quyền họ thực sự có — phát hiện bằng cách đăng nhập thật, không phải suy luận
 * từ code: role có quyền API đầy đủ nhưng UI vẫn hiện như một `member` trơn.
 */

/** Vai trò giữ năng lực BIÊN TẬP nội dung mọi địa điểm (`*.Any` — xem SeedRbac/SeedPlacePermissions
 *  và migration SeedEditorialMediaPermission). Trùng khớp với chuỗi kế thừa thực tế:
 *  contributor → moderator → administrator → super_administrator. */
const EDITORIAL_ROLES = ['contributor', 'moderator', 'administrator', 'super_administrator', 'content_owner'];

/** Vai trò giữ `Moderation.Queue.View` + `Media.Moderate`/`Review.Moderate` (SeedModerationPermissions). */
const MODERATION_ROLES = ['moderator', 'administrator', 'super_administrator', 'content_owner'];

/** Vai trò giữ `PlaceTranslation.Review.Any` (SeedPlaceTranslationReviewPermission,
 *  human-translation-review 2026-09-04) — cùng tập vai trò với kiểm duyệt hôm nay (cấp cho
 *  `moderator`, kế thừa lên `administrator`/`super_administrator`), tách riêng cờ vì đây là một
 *  năng lực khái niệm khác (duyệt bản dịch, không phải duyệt case kiểm duyệt) dù trùng vai trò. */
const TRANSLATION_REVIEW_ROLES = ['moderator', 'administrator', 'super_administrator', 'content_owner'];

/** Vai trò giữ `Guide.Edit.Any` (SeedGuideEditPermission, Guide CMS candidate 2026-09-18) —
 *  cùng tập vai trò với duyệt bản dịch (cấp cho `moderator`, kế thừa lên
 *  `administrator`/`super_administrator`); KHÔNG cấp cho `contributor` như biên tập địa điểm
 *  thường, vì một guide article xuất bản công khai không qua một bước duyệt riêng nào khác. */
const GUIDE_EDIT_ROLES = ['moderator', 'administrator', 'super_administrator', 'content_owner'];

export interface UserCapabilities {
  /** Hiện lối vào "Biên tập nội dung" (sửa địa điểm chưa có chủ, thêm ảnh/giờ/liên hệ). */
  canEditorial: boolean;
  /** Hiện lối vào "Hàng chờ kiểm duyệt". */
  canModerate: boolean;
  /** Hiện lối vào "Duyệt bản dịch". */
  canReviewTranslations: boolean;
  /** Hiện lối vào "Biên tập cẩm nang" (Guide CMS candidate). */
  canEditGuides: boolean;
}

export const NO_CAPABILITIES: UserCapabilities = {
  canEditorial: false,
  canModerate: false,
  canReviewTranslations: false,
  canEditGuides: false,
};

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
    canReviewTranslations: codes.some((c) => TRANSLATION_REVIEW_ROLES.includes(c)),
    canEditGuides: codes.some((c) => GUIDE_EDIT_ROLES.includes(c)),
  };
}
