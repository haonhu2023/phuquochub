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
// cho MỌI loại permission — kể cả `.Managed` LẪN `.Own`.** Phát hiện trong lúc triển khai M0.1 (xác
// nhận SỐNG qua e2e thật, không phải suy đoán): khác với `.Managed` (không ai giữ grant nào hôm nay
// — fail closed không đổi gì quan sát được), scope `.Own` ĐANG được nhiều route thật dựa vào ngay
// hôm nay — `Media.Upload.Own` (cấp cho `member`, gác `POST /media/presign`+`POST /media`),
// `User.Edit.Own` (`PATCH /users/me`) — và những route đó, đúng như ADR-019 D15 M0.3 mô tả, an toàn
// CHỈ nhờ quy ước cấu trúc (không có tham số `:id`, hành động luôn về CHÍNH người gọi), KHÔNG nhờ
// một phép kiểm tra ngữ cảnh nào. `PermissionsGuard` (M0.2, CHƯA đấu nối ở M0.1) gọi `can()` đúng 2
// tham số cho MỌI route — nếu nhánh "thiếu provider ⇒ deny" (D2 bước 5) áp dụng vô điều kiện cho cả
// `.Own`, những route đó sẽ 403 ngay lập tức, một hồi quy sống trên endpoint đang hoạt động, vi
// phạm thẳng ràng buộc cốt lõi của M0.1 ("no existing permission decision may change"). `.Own`
// hardening là NHIỆM VỤ TƯỜNG MINH của M0.3 (ADR-019 D15), không phải M0.1 — nên `can()` không kèm
// context giữ nguyên đường tương thích (rank-thuần, `isAllowed`) cho CẢ hai scope `.Managed` VÀ
// `.Own`; đường fail-closed hai-pha CHỈ kích hoạt khi caller CHỦ ĐỘNG truyền `contextProvider` — con
// đường mà KHÔNG caller thật nào trong M0.1 dùng tới (guard/M0.2 và lối thoát tầng service/D14 sẽ
// là những caller ĐẦU TIÊN, sau này).
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
