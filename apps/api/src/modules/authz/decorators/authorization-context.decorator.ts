import { SetMetadata } from '@nestjs/common';
import { AUTHZ_CONTEXT_KEY } from '../authorization-context';

// ADR-019 D4 (Resource-Scoped Authorization, M0.2 — PEP + Resolvers + Rollout). `AUTHZ_CONTEXT_KEY`
// đã khai báo TRƯỚC ở authorization-context.ts (M0.1) — file này chỉ thêm hình dạng options + hàm
// decorator, đúng những gì M0.1 cố ý để lại cho M0.2.

/** Nguồn lấy định danh tài nguyên từ request. */
export type AuthzResourceSource =
  | { readonly from: 'param'; readonly name: string } // route param, vd ':id'
  | { readonly from: 'principal' }; // chính người gọi (route scope Own)

export interface AuthorizationContextOptions {
  readonly resourceType: string;
  readonly resource: AuthzResourceSource;
  /**
   * DI token của AuthorizationContextResolver.
   * CHỈ được bỏ trống khi id của resourceType CHÍNH LÀ businessId (trường hợp identity) — khi đó
   * IDENTITY_PLACE_RESOLVER được dùng ngầm định.
   * KHÔNG BAO GIỜ bỏ trống với ý nghĩa "không cần kiểm tra".
   */
  readonly resolver?: symbol;
}

/**
 * Khai báo ngữ cảnh tài nguyên mà một handler (hoặc cả controller) cần để PermissionsGuard phân
 * giải grant `Managed`/`Own`. Đọc bằng `reflector.getAllAndOverride` — cùng ngữ nghĩa gộp đang
 * dùng cho `PERMISSIONS_KEY` (`RequirePermissions`): khai báo mức class có thể bị override ở từng
 * handler (D4). Không mã hoá tên role, không chứa logic chính sách — chỉ khai báo NƠI lấy danh
 * tính tài nguyên.
 */
export const AuthorizationContext = (opts: AuthorizationContextOptions) =>
  SetMetadata(AUTHZ_CONTEXT_KEY, opts);
