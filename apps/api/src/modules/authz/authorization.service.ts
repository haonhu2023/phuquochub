import { Injectable } from '@nestjs/common';
import { UserRolesRepository } from '../rbac/repositories/user-roles.repository';
import { isAllowed } from './authorization.util';
import type { AuthorizationContextProvider } from './authorization-context';
import { evaluateScopedAccess } from './scoped-authorization.util';
import type { ScopedGrant } from './scoped-grant';

export interface EffectivePermissions {
  allow: string[];
  deny: string[];
}

// PDP (Policy Decision Point) — DUY NHẤT (ADR-019 D1). security.md §5: gom role (trực tiếp + kế
// thừa DAG) → hợp nhất permission → wildcard → deny thắng; ADR-019 mở rộng thêm ĐÚNG MỘT khả năng:
// khi grant thỏa mãn ở scope Managed/Own, so khớp DANH TÍNH tài nguyên (business_id/owner_id của
// chính dòng user_roles gốc), không chỉ hạng scope. `evaluateScopedAccess`/`grantScopeOf`
// (scoped-authorization.util.ts) là nơi thuật toán hai pha (D2) và bảng quyết định (D6) sống —
// service này chỉ nạp dữ liệu (MỘT truy vấn — `getScopedGrants`, ADR-019 D12) rồi giao cho PDP thuần
// đó quyết định. `authorization.util.ts` (`grantSatisfies`/`isAllowed`) giữ NGUYÊN VẸN, không sửa.
//
// **`can()` KHÔNG kèm `contextProvider` PHẢI tái tạo ĐÚNG hành vi hạng-scope-thuần TỪ TRƯỚC ADR-019
// cho MỌI loại permission — kể cả `.Managed` LẪN `.Own`.** Đây là một bất biến CỦA CHÍNH `can()`,
// không phải một trạng thái tạm thời: `can()` KHÔNG tự quyết định khi nào cần ngữ cảnh — đó là
// trách nhiệm của CALLER (D1, `can()`/`canWithGrants()` chỉ là façade PDP dùng chung). Lịch sử: phát
// hiện trong lúc triển khai M0.1 rằng nếu nhánh "thiếu provider ⇒ deny" (D2 bước 5) bị áp dụng vô
// điều kiện, hai route `.Own` đang sống hôm nay khi đó (`Media.Upload.Own`, `User.Edit.Own`) — an
// toàn CHỈ nhờ quy ước cấu trúc (không tham số `:id`), KHÔNG có `@AuthorizationContext` nào — sẽ
// 403 SAI ngay lập tức. Sửa bằng cách giữ đường tương thích (rank-thuần, `isAllowed`) làm mặc định
// cho callers không truyền context.
//
// **Cập nhật M0.3 (Own-Scope Hardening, ADR-019 D15):** `PermissionsGuard` nay truyền
// `contextProvider` cho CẢ `.Managed` LẪN `.Own` (không chỉ `.Managed` như M0.2) — cả 3 handler
// `.Own` đang sống đều mang `@AuthorizationContext({ resource: { from: 'principal' } },
// PRINCIPAL_RESOLVER)` (D16), nên trên đường request thật, `can()`/`canWithGrants()` cho `.Own` LUÔN
// nhận context hợp lệ, không còn rơi vào nhánh "thiếu provider" nữa. Đường tương thích không-context
// ở trên VẪN giữ nguyên (không xoá) — đó là bất biến của `can()` tự thân, phục vụ mọi caller tương
// lai chưa/không truyền context (vd `ModerationService.decide()`, D14), không phải một ngoại lệ chỉ
// tồn tại vì `.Own` "chưa được cứng hoá".
@Injectable()
export class AuthorizationService {
  constructor(private readonly userRolesRepo: UserRolesRepository) {}

  /**
   * Giữ NGUYÊN chữ ký và hình dạng trả về (ADR-019 D1) — triển khai lại trên `getScopedGrants()`
   * (một truy vấn, thay 3 truy vấn cũ), bỏ các cột scope khi tách allow/deny. Không đổi hành vi đối
   * ngoại: hai caller đã kiểm chứng (`can()` ở dưới, và test hiện có) vẫn nhận đúng hình dạng cũ.
   */
  async getEffectivePermissions(userId: string): Promise<EffectivePermissions> {
    const grants = await this.userRolesRepo.getScopedGrants(userId);
    return {
      allow: grants.filter((g) => g.effect === 'allow').map((g) => g.code),
      deny: grants.filter((g) => g.effect === 'deny').map((g) => g.code),
    };
  }

  /**
   * Principal có được thực hiện `requiredPermission` không.
   *
   * KHÔNG truyền `contextProvider` → đường TƯƠNG THÍCH: hạng scope thuần (`isAllowed`, đúng logic
   * đã chạy trước ADR-019, KHÔNG đổi) — bắt buộc để không hồi quy `.Own` đang sống (xem ghi chú đầu
   * file). Đây là đường MỌI caller thật hôm nay đi qua (`PermissionsGuard`, `ModerationService.decide()`).
   *
   * CÓ truyền `contextProvider` → đường MỚI (ADR-019 D2/D6): hai pha, fail-closed cho grant
   * `.Managed`/`.Own` không khớp danh tính tài nguyên. `contextProvider` LƯỜI — chỉ gọi ở "đường
   * chậm", sau khi đã xác nhận không có grant context-free (Any/wildcard) nào thỏa mãn. Lối thoát
   * tầng service (D14) tự dựng `AuthorizationContext` rồi bọc trong một provider để gọi ĐÚNG nhánh
   * này — một PDP duy nhất, không có đường quyết định thứ hai nào khác. Chưa có caller thật nào
   * trong M0.1 truyền `contextProvider` — nhánh này ship TỐI, chỉ được kiểm chứng bằng unit test.
   */
  async can(
    userId: string,
    requiredPermission: string,
    contextProvider?: AuthorizationContextProvider,
  ): Promise<boolean> {
    const grants = await this.userRolesRepo.getScopedGrants(userId);
    return this.canWithGrants(grants, userId, requiredPermission, contextProvider);
  }

  /**
   * ADR-019 D11 (M0.2 — PEP + Resolvers + Rollout). Đúng phần quyết định của `can()` ở trên, nhưng
   * nhận `grants` đã nạp SẴN thay vì tự truy vấn — cho phép `PermissionsGuard` nạp `ScopedGrant[]`
   * ĐÚNG MỘT LẦN mỗi request (qua `RequestScopedGrantCache`) rồi tái dùng cho MỌI permission trong
   * `@RequirePermissions('A','B',...)`, xoá khuếch đại 3×N truy vấn hiện có. `AuthorizationService`
   * vẫn là PDP DUY NHẤT (D1) — đây KHÔNG phải một engine quyết định thứ hai, chỉ tách bước "nạp dữ
   * liệu" khỏi bước "quyết định" để caller kiểm soát vòng đời nạp.
   */
  async canWithGrants(
    grants: readonly ScopedGrant[],
    userId: string,
    requiredPermission: string,
    contextProvider?: AuthorizationContextProvider,
  ): Promise<boolean> {
    if (!contextProvider) {
      return isAllowed(
        grants.filter((g) => g.effect === 'allow').map((g) => g.code),
        grants.filter((g) => g.effect === 'deny').map((g) => g.code),
        requiredPermission,
      );
    }

    return evaluateScopedAccess(grants, requiredPermission, userId, contextProvider);
  }
}
