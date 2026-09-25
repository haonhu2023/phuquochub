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
 *  contributor → moderator → administrator → super_administrator, và (2026-09-16) content_owner
 *  → contributor (SeedContentOwnerRole) — content_owner kế thừa CHÍNH XÁC cùng năng lực biên tập
 *  contributor mang lại, không hơn (đã đối chiếu trực tiếp từng migration seed, xem
 *  SeedContentOwnerRole1720005700000's own comment). */
const EDITORIAL_ROLES = ['content_owner', 'contributor', 'moderator', 'administrator', 'super_administrator'];

/**
 * Vai trò giữ `Moderation.Queue.View` (SeedModerationPermissions cho moderator+; content_owner
 * 2026-09-17 qua GrantContentOwnerMediaModerationScope — TRỰC TIẾP, không kế thừa từ moderator, xem
 * ghi chú đầy đủ tại migration đó). content_owner CHỈ giữ `Media.Moderate` (không `Review.Moderate`/
 * `Report.Resolve`/...) — hàng chờ vẫn hiện MỌI loại case (cùng hành vi trang `/dashboard/moderation`
 * đã có từ trước cho mọi vai trò), nhưng quyết định trên case KHÔNG PHẢI ảnh sẽ 403 ở backend, đúng
 * hợp đồng "hiển thị chỉ để không mời gọi thao tác chắc chắn bị từ chối, không phải lớp bảo mật".
 */
const MODERATION_ROLES = ['content_owner', 'moderator', 'administrator', 'super_administrator'];

/** Vai trò giữ `PlaceTranslation.Review.Any` (SeedPlaceTranslationReviewPermission,
 *  human-translation-review 2026-09-04) — cùng tập vai trò với kiểm duyệt hôm nay (cấp cho
 *  `moderator`, kế thừa lên `administrator`/`super_administrator`), tách riêng cờ vì đây là một
 *  năng lực khái niệm khác (duyệt bản dịch, không phải duyệt case kiểm duyệt) dù trùng vai trò.
 *  (2026-09-16) `content_owner` THÊM vào đây qua một grant TRỰC TIẾP RIÊNG
 *  (SeedContentOwnerModerationPermissions) — KHÔNG kế thừa được từ contributor, đây là năng lực
 *  MỚI THẬT SỰ cho content_owner, không phải một phần của "biên tập nội dung" nói chung. */
const TRANSLATION_REVIEW_ROLES = ['content_owner', 'moderator', 'administrator', 'super_administrator'];

/**
 * Vai trò giữ NGOẠI LỆ INV-12 (`Media.Moderate.Own`, SeedContentOwnerModerationPermissions,
 * 2026-09-16) — CHỈ `content_owner`. Cố tình KHÔNG suy ra từ `MODERATION_ROLES`: một
 * moderator/administrator KHÔNG giữ permission `.Own` này (xem canSelfApproveOwnMedia() ở
 * moderation.service.ts — rank "any" của Media.Moderate KHÔNG được phép ngầm thoả mãn yêu cầu
 * .Own một cách hiển thị ở đây, đúng bất biến backend đã cưỡng chế). Đây THUẦN TUÝ là hiển thị nút
 * "Duyệt ngay" — backend vẫn là nơi quyết định duy nhất.
 */
const SELF_APPROVE_MEDIA_ROLES = ['content_owner'];

/** Vai trò giữ `Guide.Edit.Any` (SeedGuideEditPermission, Guide CMS candidate 2026-09-18) —
 *  cùng tập vai trò với duyệt bản dịch (cấp cho `moderator`, kế thừa lên
 *  `administrator`/`super_administrator`); KHÔNG cấp cho `contributor` như biên tập địa điểm
 *  thường, vì một guide article xuất bản công khai không qua một bước duyệt riêng nào khác. */
const GUIDE_EDIT_ROLES = ['moderator', 'administrator', 'super_administrator', 'content_owner'];

/** Vai trò giữ `SiteContent.Edit` (S1, SiteContentSchema1720006400000) — cấp TRỰC TIẾP cho
 *  `content_owner` ONLY (không qua kế thừa, không cấp cho moderator/administrator như các quyền
 *  nội dung khác ở trên) — xem migration comment: đây là quyền vận hành nội dung trang chủ, không
 *  phải một khoảng biên tập/kiểm duyệt mọi vai trò kiểm duyệt cần. */
const SITE_CONTENT_EDIT_ROLES = ['content_owner'];

/** Vai trò giữ `Ops.BackupStatus.View` (BK1, SeedBackupStatusPermission1720006500000) — cấp TRỰC
 *  TIẾP cho `content_owner` ONLY, cùng nhóm với SiteContent.Edit: đây là siêu dữ liệu vận hành
 *  (tên/thời gian/kích thước file sao lưu), không phải một khoảng biên tập/kiểm duyệt nội dung. */
const BACKUP_STATUS_VIEW_ROLES = ['content_owner'];

/** Vai trò giữ `Place.Approve` (SeedRbac1720000300000 cấp `moderator`, kế thừa lên
 *  `administrator`/`super_administrator`; `content_owner` giữ TRỰC TIẾP qua
 *  SeedContentOwnerRole1720006200000 — cùng migration cấp Place.Edit.Any/Media.Moderate/
 *  Guide.Edit.Any). Trang "Việc cần làm" (`/dashboard/todo`, GET /owner-decisions) dùng permission
 *  này, KHÔNG dùng lại MODERATION_ROLES dù danh sách vai trò trùng nhau hôm nay — hai permission
 *  khác nhau về khái niệm (duyệt xuất bản địa điểm vs. duyệt case kiểm duyệt), xem cùng lý do tách
 *  TRANSLATION_REVIEW_ROLES ở trên. */
const PLACE_APPROVE_ROLES = ['content_owner', 'moderator', 'administrator', 'super_administrator'];

/** Vai trò giữ `PlaceEditProposal.Moderate` (SeedPlaceEditProposalPermissions1720006800000 cấp
 *  `moderator` trực tiếp, kế thừa lên `administrator`/`super_administrator`; `content_owner` giữ
 *  TRỰC TIẾP qua GrantContentOwnerPlaceEditProposalModeration1720006900000 — migration bổ sung
 *  2026-09-24 sau khi phát hiện content_owner đăng nhập được nhưng KHÔNG xử lý được đề xuất nào,
 *  vì role này không kế thừa `moderator`). Trang `/dashboard/edit-proposals` dùng permission này. */
const PLACE_EDIT_PROPOSAL_MODERATE_ROLES = ['content_owner', 'moderator', 'administrator', 'super_administrator'];

export interface UserCapabilities {
  /** Hiện lối vào "Biên tập nội dung" (sửa địa điểm chưa có chủ, thêm ảnh/giờ/liên hệ). */
  canEditorial: boolean;
  /** Hiện lối vào "Hàng chờ kiểm duyệt". */
  canModerate: boolean;
  /** Hiện lối vào "Duyệt bản dịch". */
  canReviewTranslations: boolean;
  /** Hiện nút "Duyệt ngay" trên ẢNH CHÍNH MÌNH tải lên (INV-12 exception, content_owner). */
  canSelfApproveOwnMedia: boolean;
  /** Hiện lối vào "Biên tập cẩm nang" (Guide CMS candidate). */
  canEditGuides: boolean;
  /** Hiện lối vào "Nội dung website" (S1 — hero/về chúng tôi/nổi bật/liên hệ-mạng xã hội trang chủ). */
  canEditSiteContent: boolean;
  /** Hiện khối "Tình trạng sao lưu" trên trang Hướng dẫn (BK1). */
  canViewBackupStatus: boolean;
  /** Hiện lối vào "Việc cần làm" (`/dashboard/todo`, GET /owner-decisions — Place.Approve). */
  canViewOwnerTodo: boolean;
  /** Hiện lối vào "Duyệt đề xuất chỉnh sửa" (`/dashboard/edit-proposals` — PlaceEditProposal.Moderate). */
  canReviewPlaceEditProposals: boolean;
}

export const NO_CAPABILITIES: UserCapabilities = {
  canEditorial: false,
  canModerate: false,
  canReviewTranslations: false,
  canSelfApproveOwnMedia: false,
  canEditGuides: false,
  canEditSiteContent: false,
  canViewBackupStatus: false,
  canViewOwnerTodo: false,
  canReviewPlaceEditProposals: false,
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
    canSelfApproveOwnMedia: codes.some((c) => SELF_APPROVE_MEDIA_ROLES.includes(c)),
    canEditGuides: codes.some((c) => GUIDE_EDIT_ROLES.includes(c)),
    canEditSiteContent: codes.some((c) => SITE_CONTENT_EDIT_ROLES.includes(c)),
    canViewBackupStatus: codes.some((c) => BACKUP_STATUS_VIEW_ROLES.includes(c)),
    canViewOwnerTodo: codes.some((c) => PLACE_APPROVE_ROLES.includes(c)),
    canReviewPlaceEditProposals: codes.some((c) => PLACE_EDIT_PROPOSAL_MODERATE_ROLES.includes(c)),
  };
}
