import { grantSatisfies } from './authorization.util';
import type { AuthorizationContext, AuthorizationContextProvider } from './authorization-context';
import type { ScopedGrant } from './scoped-grant';

// ADR-019 D2/D6/D7 (Resource-Scoped Authorization, M0.1 — PDP Foundation). Module THUẦN, không phụ
// thuộc DB — cùng khuôn `authorization.util.ts`/`media-moderation.transition.ts`. Đây là nơi hai
// pha đánh giá (D2) và bảng quyết định Any/Managed/Own (D6) sống — KHÔNG tên role nào xuất hiện ở
// đây, chỉ mã permission, `effect`, và các cột scope trên `ScopedGrant`.
//
// `authorization.util.ts` (`grantSatisfies`/`isAllowed`) giữ NGUYÊN VẸN, KHÔNG sửa (D6) — module
// này TÁI DÙNG `grantSatisfies` cho phép so khớp mã permission (rank scope), và chỉ thêm ĐÚNG MỘT
// quy tắc mới: khớp theo DANH TÍNH tài nguyên khi rank đã thỏa nhưng grant thuộc scope
// Managed/Own. Một phần nhỏ của `parsePerm` (parse hậu tố scope của MÃ GRANT, không phải mã
// required) được viết lại có chủ đích ở `grantScopeOf()` dưới đây thay vì export hàm private của
// authorization.util.ts — giữ ranh giới "không sửa file đó" tuyệt đối, đổi lấy một hàm nhỏ, thuần,
// tự test độc lập.

type GrantScope = 'own' | 'managed' | 'any';

/**
 * Scope CỦA CHÍNH mã permission trên một grant (không phải của permission được yêu cầu — D6: "phép
 * kiểm tra được áp là phép kiểm tra thuộc về scope của chính grant"). `*`, `Module.*`, không hậu
 * tố, hoặc hậu tố `.Any` đều coi là 'any' (context-free) — đúng quy ước `authorization.util.ts`
 * (`grant không scope áp mọi tài nguyên, coi như Any`).
 */
export function grantScopeOf(code: string): GrantScope {
  if (code === '*' || code.endsWith('.*')) {
    return 'any';
  }
  const parts = code.split('.');
  const last = parts[parts.length - 1].toLowerCase();
  return last === 'own' || last === 'managed' ? last : 'any';
}

/**
 * D6 bảng quyết định — CHỈ gọi cho grant đã xác định là contextBound (scope 'managed' hoặc 'own').
 * Managed: so `businessId` của CHÍNH DÒNG grant với `ctx.businessId` — `businessId === null` (vd
 * user_roles gán nhầm ở scope_type='global') không khớp gì cả (fail closed theo cấu trúc, D6 "hệ
 * quả then chốt"). Own: so `ctx.ownerId` với `userId` của người gọi — KHÔNG so với grant, vì Own
 * luôn nói về CHÍNH người gọi.
 */
export function matchesScopedContext(grant: ScopedGrant, ctx: AuthorizationContext, userId: string): boolean {
  const scope = grantScopeOf(grant.code);
  if (scope === 'managed') {
    return grant.businessId !== null && grant.businessId === ctx.businessId;
  }
  if (scope === 'own') {
    return ctx.ownerId !== null && ctx.ownerId === userId;
  }
  // Không đạt tới đây trong thực tế — evaluateScopedAccess() chỉ gọi hàm này trên contextBound
  // (scope 'managed'/'own'); giữ lại làm chốt an toàn tường minh thay vì giả định.
  return false;
}

/**
 * D2 — đánh giá hai pha, phân giải ngữ cảnh LƯỜI. Đây là toàn bộ "bộ não" quyết định của PDP mở
 * rộng; `AuthorizationService.can()` chỉ nạp `grants` rồi gọi thẳng hàm này (D1: PDP duy nhất).
 *
 * KHÔNG BAO GIỜ gọi `contextProvider` nếu đã có grant context-free thỏa permission (bước 3) — đây
 * chính là điều bảo toàn "Any/wildcard không đổi một byte" cả về hành vi LẪN hiệu năng (không phân
 * giải ngữ cảnh cho super_administrator/contributor).
 */
export async function evaluateScopedAccess(
  grants: readonly ScopedGrant[],
  requiredPermission: string,
  userId: string,
  contextProvider?: AuthorizationContextProvider,
): Promise<boolean> {
  // Bước 1 (D7): deny tường minh thắng mọi allow, KHÔNG cần ngữ cảnh — ngữ nghĩa giữ nguyên hôm nay.
  const denied = grants.some((g) => g.effect === 'deny' && grantSatisfies(g.code, requiredPermission));
  if (denied) {
    return false;
  }

  // Bước 2: phân hoạch allow-grant thỏa permission (rank scope, qua grantSatisfies tái dùng)
  // theo scope CỦA CHÍNH GRANT (D6), không phải của requiredPermission.
  const satisfying = grants.filter((g) => g.effect === 'allow' && grantSatisfies(g.code, requiredPermission));
  const contextFree = satisfying.filter((g) => grantScopeOf(g.code) === 'any');

  // Bước 3: đường nhanh — Any/wildcard/không-hậu-tố, KHÔNG phân giải ngữ cảnh.
  if (contextFree.length > 0) {
    return true;
  }

  const contextBound = satisfying.filter((g) => grantScopeOf(g.code) !== 'any');

  // Bước 4: không có allow nào thỏa (context-free lẫn context-bound đều rỗng).
  if (contextBound.length === 0) {
    return false;
  }

  // Bước 5: đường chậm — giờ mới cần danh tính tài nguyên. Fail closed (INV-A1/A4/A5): thiếu
  // provider, provider trả null, hoặc provider ném lỗi đều là DENY — không bao giờ được hiểu là pass.
  if (!contextProvider) {
    return false;
  }

  let ctx: AuthorizationContext | null;
  try {
    ctx = await contextProvider();
  } catch {
    return false;
  }
  if (!ctx) {
    return false;
  }

  return contextBound.some((g) => matchesScopedContext(g, ctx as AuthorizationContext, userId));
}
