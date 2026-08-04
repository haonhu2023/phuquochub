# ADR-019 — Phân quyền theo tài nguyên (Resource-Scoped Authorization)

## Status

**Accepted** — 2026-08-04.

Không supersede ADR nào. **Bổ sung** [ADR-007](ADR-007-rbac-model.md): đây là lần đầu tiên
`user_roles.business_id` và `user_roles.scope_type` — hai cột đã tồn tại từ Sprint 1 nhưng **chưa
bao giờ được PDP đọc** — thực sự tham gia vào quyết định phân quyền. ADR-007 giữ nguyên toàn bộ nội
dung quyết định lịch sử (mô hình 5 bảng, bỏ `users.role` ENUM); ADR này là **thẩm quyền triển khai**
cho phần "Điểm mở" mà chính ADR-007 §Consequences đã ghi nhận.

Là **điều kiện chặn (blocking prerequisite)** của [ADR-015](ADR-015-business-ownership-model.md) M3
(Claim Decision Workflow) — xem D1 mục §Quyết định Owner.

> Ngôn ngữ: tiếng Việt, khớp ADR-001…018. **Giữ nguyên tiếng Anh:** tên bảng, tên cột, giá trị enum,
> mã quyền, route API, tên class/file/interface/decorator.

## Context

### Luồng phân quyền hiện tại (kiểm chứng trực tiếp trong mã nguồn, 2026-08-04)

```
Request → JwtAuthGuard (global)      → xác thực JWT, gắn req.user.sub
        → PermissionsGuard (global)  → đọc metadata PERMISSIONS_KEY
             │  không khai báo permission → PASS (chỉ cần đã đăng nhập)
             └→ AuthorizationService.can(userId, permission)
                  → getEffectivePermissions(userId)
                       1. UserRolesRepository.findActiveRoleIds(userId)   -- CHỈ trả role_id[]
                       2. RolesRepository.expandWithAncestors(roleIds)    -- + tổ tiên DAG
                       3. RolesRepository.getPermissionsForRoles(roleIds) -- {code, effect}[]
                  → isAllowed(allow, deny, required)   (authorization.util.ts)
                       grantSatisfies() so sánh HẠNG scope: own(1) < managed(2) < any(3)
```

### Phát hiện quyết định

**Không một mắt xích nào trong chuỗi trên nhận id của tài nguyên.**

`AuthorizationService.can(userId, requiredPermission)` chỉ có **hai** tham số.
`getEffectivePermissions()` làm phẳng **mọi** dòng `user_roles` của một người — bất kể dòng đó mang
`business_id` nào — thành một cặp `{allow: string[], deny: string[]}`. `grantSatisfies()` chỉ so
sánh **hạng** scope (`grantedRank >= requiredRank`), **không bao giờ** so sánh *tài nguyên nào* mà
grant đó áp dụng.

Điểm mất mát thông tin nằm chính xác ở bước 1: `findActiveRoleIds()` `SELECT` ra đúng `role_id` và
vứt bỏ `business_id` lẫn `scope_type`. Sau bước đó, **không cách nào** truy ngược một permission
kế thừa qua DAG về dòng `user_roles` đã sinh ra nó.

**Hệ quả cụ thể:** `PlacesService.update()` không có bất kỳ kiểm tra sở hữu nào của riêng nó — chốt
chặn duy nhất trên `PATCH /places/:id` là `@RequirePermissions('Place.Edit.Managed')`. Một người giữ
`business_manager` cho **place A** hiện được phép sửa **place B, C, và mọi place khác trong hệ
thống**.

### Đây là khoảng trống ĐÃ ĐƯỢC BIẾT và ĐÃ ĐƯỢC GHI, không phải lỗi mới phát hiện

`contacts.controller.ts` mang đúng nguyên văn ghi chú của chính tác giả ban đầu:

> `// owner suy từ path (owner_type=PLACE). Scope Managed ở mức resource (chủ cơ sở) sẽ siết khi có business_members (Sprint 6) — hiện guard mức permission.`

`prices.controller.ts` mang ghi chú cùng hình dạng. ADR này **đóng đúng khoảng trống mà mã nguồn đã
tự lên lịch cho mình**, không phải phát hiện một defect bất ngờ.

### Vì sao chưa từng gây sự cố

**Chưa khai thác được hôm nay.** `RbacController` chỉ lộ `GET /roles` và `GET /permissions`; **không
một route HTTP nào** trong toàn hệ gán `business_manager`/`business_owner` cho ai
(`UserRolesRepository.assign()` tồn tại ở tầng repository, có tham số `businessId`, nhưng **không có
caller nào** từ một route). Hôm nay **không người dùng nào giữ một Managed grant**.

Khoảng trống trở nên **sống** đúng vào khoảnh khắc ADR-015 M3 (Claim Decision Workflow) bắt đầu cấp
`business_owner` thật qua `user_roles`.

## Problem

Làm cho scope `Managed` (và về sau `Own`) thực sự kiểm tra **danh tính tài nguyên**, mà:

1. giữ nguyên tuyệt đối mô hình RBAC hiện có (`Own`/`Managed`/`Any`, wildcard, deny thắng allow, kế
   thừa DAG);
2. **không** kiểm tra tên role ở bất kỳ đâu;
3. **fail closed** khi một permission có scope cần ngữ cảnh tài nguyên mà không phân giải được;
4. giữ hành vi `Any`/wildcard **không đổi một byte nào**;
5. **không** nhân bản logic phân quyền vào từng service method;
6. mở rộng được sang `Own`, và sang chiều scope tương lai (organization/team/project/tenant) **mà
   không phải thiết kế lại lõi** — cụ thể là không phải sửa lại decorator API, resolver interface,
   luồng guard, hay bất kỳ call site nào ở controller.

## Decision

Chọn **thiết kế tổng quát `@AuthorizationContext(...)`, được hiệu chỉnh có chủ đích** (calibrated
generalization): lấy **hình dạng** tổng quát (một decorator, một resolver interface, một context
object, một điểm vào PDP) nhưng **từ chối** phần **ngữ nghĩa** tổng quát chưa được biện minh.

**Tuyên bố phạm vi phủ định (chống over-engineering) — ADR này KHÔNG xây:** policy DSL · resource-type
registry có kế thừa · ABAC attribute engine · cây tenant/organization · bảng ACL theo từng tài
nguyên · cache permission xuyên request. Context object có **đúng bốn trường**; PDP nhận **đúng một**
quy tắc quyết định mới.

### D1 — `AuthorizationService` vẫn là PDP DUY NHẤT; `PermissionsGuard` vẫn là PEP CHÍNH

**Không** tạo engine chính sách thứ hai. `AuthorizationService` được **mở rộng**, không bị thay thế.
`can(userId, permission, context?)` là façade công khai dùng chung cho **cả** guard **lẫn** các
caller động ở tầng service (D14). `PermissionsGuard` giữ nguyên trách nhiệm hiện tại — đọc metadata,
hỏi PDP, dịch boolean thành 403 — và **không tự ra bất kỳ quyết định chính sách nào**.

`getEffectivePermissions(userId)` được **giữ nguyên chữ ký và hình dạng trả về** (caller đã kiểm
chứng: chính `can()` và `authorization.service.spec.ts`), triển khai lại trên truy vấn mới bằng cách
bỏ các cột scope → **không thay đổi hành vi đối ngoại**.

### D2 — Đánh giá HAI PHA, phân giải ngữ cảnh LƯỜI (lazy)

```
evaluate(grants, requiredPermission, contextProvider) -> ALLOW | DENY:

  1. DENY CHECK (không cần ngữ cảnh, ngữ nghĩa GIỮ NGUYÊN):
       nếu tồn tại grant effect='deny' thỏa requiredPermission          -> DENY

  2. PHÂN HOẠCH các allow-grant thỏa requiredPermission
     (tái dùng grantSatisfies() của authorization.util.ts, KHÔNG sửa):
       contextFree  := grant có code '*', 'Module.*', scope 'Any', hoặc KHÔNG có hậu tố scope
       contextBound := grant có scope 'Managed' hoặc 'Own'

  3. ĐƯỜNG NHANH:
       nếu contextFree khác rỗng                                        -> ALLOW   (0 phân giải)

  4. nếu contextBound rỗng                                              -> DENY

  5. ĐƯỜNG CHẬM (giờ mới cần danh tính tài nguyên):
       ctx := await contextProvider()
       nếu ctx là null / thiếu provider / provider ném lỗi              -> DENY     (INV-A3…A5)
       nếu tồn tại g trong contextBound khớp ctx theo D6                -> ALLOW
       ngược lại                                                        -> DENY
```

Bước 3 chính là điều bảo toàn mục tiêu "`Any`/wildcard không đổi": một `contributor`
(`Place.Edit.Any`) hay `super_administrator` (`*`) **không bao giờ** chạm tới bước phân giải.

### D3 — `AuthorizationContext`: ĐÚNG bốn trường

```ts
export interface AuthorizationContext {
  /** Danh tính đối tượng bị tác động. Mang theo cho audit/log và cho chiều scope tương lai. */
  readonly resourceType: string;   // lowercase, khớp quy ước owner_type/entity_type sẵn có
  readonly resourceId: string;

  /** Chiều scope cho Managed grant. ADR-015 Model A: business_id === places.id. */
  readonly businessId: string | null;

  /** Chiều scope cho Own grant. */
  readonly ownerId: string | null;
}
```

`resourceType`/`resourceId` là **danh tính**; `businessId`/`ownerId` là **hai chiều scope thực sự
tồn tại trong schema hôm nay** (`user_roles.business_id`, và chiều tự-sở-hữu ngầm định). Một
`organizationId`/`tenantId` tương lai được thêm vào đây **theo kiểu cộng thêm**, không phá vỡ
consumer nào.

### D4 — Decorator API

```ts
export const AUTHZ_CONTEXT_KEY = 'authorizationContext';

/** Nguồn lấy định danh tài nguyên từ request. */
export type AuthzResourceSource =
  | { readonly from: 'param'; readonly name: string }   // route param, vd ':id'
  | { readonly from: 'principal' };                     // chính người gọi (route scope Own)

export interface AuthorizationContextOptions {
  readonly resourceType: string;
  readonly resource: AuthzResourceSource;
  /**
   * DI token của AuthorizationContextResolver.
   * CHỈ được bỏ trống khi id của resourceType CHÍNH LÀ businessId (trường hợp identity) —
   * khi đó IDENTITY_PLACE_RESOLVER được dùng ngầm định.
   * KHÔNG BAO GIỜ bỏ trống với ý nghĩa "không cần kiểm tra".
   */
  readonly resolver?: symbol;
}

export const AuthorizationContext: (opts: AuthorizationContextOptions) => MethodDecorator;
```

Guard đọc bằng `reflector.getAllAndOverride(AUTHZ_CONTEXT_KEY, [handler, class])` — **đúng ngữ nghĩa
gộp** đang dùng cho `PERMISSIONS_KEY`, nên khai báo mức class có thể bị override ở từng handler.

### D5 — Resolver interface + đấu nối DI

```ts
export interface AuthorizationContextResolverInput {
  readonly resourceId: string;
  readonly resourceType: string;
  readonly userId: string;
}

export interface AuthorizationContextResolver {
  /**
   * Trả về context đầy đủ, hoặc null khi không phân giải được tài nguyên
   * (không tồn tại, đã xoá mềm, hoặc không gắn với business nào).
   * null => guard DENY (INV-A4). Ném lỗi cũng => DENY (INV-A5).
   * PHẢI thuần (không side effect) và TUYỆT ĐỐI KHÔNG cưỡng chế chính sách — chỉ phân giải danh tính.
   */
  resolve(input: AuthorizationContextResolverInput): Promise<AuthorizationContext | null>;
}
```

Resolver là provider `@Injectable()` đăng ký dưới một token `symbol` **trong chính module sở hữu tài
nguyên** (`PlacesModule` cấp place resolver, `ContactsModule` cấp contact resolver). Guard global lấy
chúng bằng `ModuleRef.get(token, { strict: false })` — cơ chế Nest chuẩn để một global guard tiêu thụ
provider của feature module, tránh **cả** registry tự chế **lẫn** vòng phụ thuộc từ `AuthzModule`
ngược vào feature module.

Hai resolver dùng chung nằm sẵn trong authz module, phủ phần lớn trường hợp:

```ts
/** Route mà id tài nguyên CHÍNH LÀ place/business id. Không thực hiện truy vấn nào. */
export const IDENTITY_PLACE_RESOLVER: symbol;
/** Route scope Own mà chủ thể là chính người gọi. Không thực hiện truy vấn nào. */
export const PRINCIPAL_RESOLVER: symbol;
```

### D6 — Quy tắc quyết định Any / Managed / Own / wildcard

Tồn tại **hai** nguồn scope: hậu tố trên **mã permission** (`Place.Edit.Managed`) và
`user_roles.scope_type`. Hôm nay chỉ nguồn thứ nhất được đọc; nguồn thứ hai được ghi nhưng chưa bao
giờ được tra.

**Quy tắc chốt: hậu tố trên mã permission QUYẾT ĐỊNH; `user_roles.business_id` CUNG CẤP ràng buộc
tài nguyên; `scope_type` là metadata đối chiếu.** Lựa chọn này giữ `authorization.util.ts` nguyên
vẹn từng byte (không thiết kế lại hành vi RBAC ngoài phạm vi) và tránh phát minh một khái niệm scope
thứ hai cạnh tranh với khái niệm đã có.

Phép kiểm tra được áp là phép kiểm tra **thuộc về scope của chính grant**, không phải của required —
đây chính là thứ làm bao hàm `Any ⊃ Managed ⊃ Own` hoạt động đúng:

| Scope của grant | Required scope | Cần ngữ cảnh | Quy tắc khớp |
|---|---|---|---|
| `*` / `Module.*` | bất kỳ | **Không** | Luôn thỏa (không đổi) |
| `Any` (hoặc không hậu tố) | bất kỳ | **Không** | Luôn thỏa (không đổi) |
| `Managed` | `Managed` | Có | `grant.businessId !== null && grant.businessId === ctx.businessId` |
| `Managed` | `Own` | Có | Như trên — người quản lý cơ sở được tác động lên tài nguyên trong cơ sở đó, kể cả tài nguyên do người khác sở hữu |
| `Own` | `Own` | Có | `ctx.ownerId !== null && ctx.ownerId === userId` |
| `Own` | `Managed` | — | Không bao giờ thỏa (hạng 1 < 2, không đổi) |

**Hệ quả then chốt (fail closed theo cấu trúc):** một grant hậu tố `Managed` đến từ một dòng
`user_roles` có `business_id = NULL` (vd `business_manager` bị gán nhầm ở `scope_type='global'`)
**không khớp gì cả và bị từ chối**. Nó **không thể** thoái hoá thành một allow bao trùm. Điều này
biến "gán đúng" thành **bất biến được PDP cưỡng chế**, không phải quy ước mà ADR-015 M3 phải nhớ.

**Không một tên role nào xuất hiện trong logic này.** Quyết định chỉ sinh ra từ mã permission,
`effect`, và các cột scope.

### D7 — Thứ tự ưu tiên allow/deny: GIỮ NGUYÊN

1. **`deny` tường minh thắng mọi `allow`**, đánh giá trước tiên (bước 1 của D2).
2. Deny đánh giá **không cần ngữ cảnh** — một deny khớp thì từ chối bất kể tài nguyên nào. Đây
   **chính xác** là hành vi hôm nay, được giữ **có chủ đích** chứ không bị đổi âm thầm.
3. **Deny-by-default:** không có allow nào thỏa ⇒ từ chối.
4. Hiện **không tồn tại dòng `deny` nào trong cơ sở dữ liệu** (mọi `role_permissions` đã seed đều
   `'allow'`), nên ngữ nghĩa deny-có-scope hôm nay là thuần lý thuyết. Xem D5 mục §Quyết định Owner.

### D8 — Bất biến FAIL-CLOSED

| # | Tình huống | Kết quả |
|---|---|---|
| **INV-A1** | Route khai báo permission `.Managed`/`.Own` nhưng **không** có `@AuthorizationContext` và không áp dụng được identity resolver ngầm định | **DENY** — cấu hình sai không bao giờ được phép dễ dãi |
| **INV-A2** | Token resolver không đăng ký / không tìm thấy qua `ModuleRef` | **DENY** + ghi log lỗi |
| **INV-A3** | Context phân giải xong có `businessId === null` trong khi scope của grant là `Managed` | **DENY** |
| **INV-A4** | Resolver trả `null` (không tồn tại, xoá mềm, không gắn business) | **DENY** |
| **INV-A5** | Resolver ném lỗi | **DENY** + ghi log lỗi — ngoại lệ **không bao giờ** được hiểu là pass |
| **INV-A6** | Permission **không** có hậu tố scope (`Media.Moderate`, `Place.Approve`, toàn bộ Moderation M1–M7) | **Đường cũ nguyên vẹn** — không ngữ cảnh, không phân giải, y hệt hôm nay |
| **INV-A7** | Mọi nhánh từ chối (pha 1 lẫn pha 2) | Cùng **một** thông điệp 403 `Thiếu quyền: ${permission}` — xem D10 |

### D9 — Kiểm tra lúc khởi động (BẮT BUỘC — Owner D2)

Lúc bootstrap ứng dụng, quét **mọi** controller handler đã đăng ký. Nếu một handler khai báo một
permission có required scope là `Managed` hoặc `Own` mà **không** phân giải được
`@AuthorizationContext` metadata hợp lệ cho handler đó (kể cả qua identity resolver ngầm định), **quá
trình khởi động PHẢI thất bại**.

Thông điệp lỗi **phải** nêu đích danh:

- controller (tên class),
- handler (tên method),
- route (khi lấy được),
- mã permission vi phạm,
- metadata ngữ cảnh còn thiếu.

**Không** hoãn phép kiểm này sang chỉ-lúc-request. Cưỡng chế lúc request (INV-A1) **vẫn giữ nguyên**
như **phòng thủ theo chiều sâu** — hai lớp, không phải một thay cho lớp kia. Lý do: biến một lớp
thiếu sót tương lai (quên decorator trên route mới) từ "403 âm thầm hoặc, tệ hơn, một route lọt lưới"
thành **lỗi deploy-time không thể bỏ qua**.

### D10 — 403 đồng nhất, không tiết lộ sự tồn tại (Owner D4)

Cả thất bại pha 1 lẫn pha 2 đều ném đúng thông điệp hiện có `Thiếu quyền: ${permission}`. Một thông
điệp riêng cho "tài nguyên tồn tại nhưng không phải của bạn" sẽ là một **existence oracle**; giữ đồng
nhất để không rò rỉ sự tồn tại của tài nguyên cho người giữ permission nhưng không giữ tài nguyên.

**Đánh đổi 403-vs-404 (chấp nhận, có ghi chép):** guard chạy **trước** service nên không phân biệt
được "place không tồn tại" với "place của người khác", và trả 403 cho cả hai. Điều này **chỉ** ảnh
hưởng caller giữ **duy nhất** scope `Managed`/`Own` — bất kỳ ai có `Any`/wildcard đều dừng ở pha 1 và
**không bao giờ** chạm tới phân giải, nên hành vi 404 ở tầng service của admin/contributor **giữ
nguyên**. Phương án thay thế (phân-giải-rồi-404) bị **loại**: nó biến guard thành existence oracle
cho đúng nhóm người mà ta đang siết.

### D11 — Ghi nhớ theo phạm vi request (BẮT BUỘC — Owner D3)

Việc nạp `ScopedGrant[]` **phải thực thi tối đa MỘT lần cho mỗi request đã xác thực**.

| Yêu cầu | Chốt |
|---|---|
| Cache xuyên request | **Cấm** |
| Cache TTL | **Cấm** |
| Redis / dependency mới | **Cấm** |
| Cache toàn cục khả biến (global mutable) | **Cấm** |
| Cơ chế | Ghi nhớ **Promise** hoặc `ScopedGrant[]` đã phân giải trên một **request-scoped context** |
| Truy vấn permission đồng thời trong CÙNG request | **Phải chia sẻ đúng một Promise đang bay** (in-flight), không nạp lại |
| Kết quả resolver | **Được phép** ghi nhớ theo khoá `resolver/resource` trong phạm vi request, khi nhiều permission cần cùng một ngữ cảnh |

Điều này đồng thời **xoá bỏ một khuếch đại đang tồn tại**: `PermissionsGuard` hiện lặp qua mảng
`required` và gọi `can()` cho từng phần tử, mỗi lần lại chạy trọn 3 truy vấn ⇒ `@RequirePermissions('A','B')`
tốn **3 × N** truy vấn. Sau ADR này: **1 truy vấn cho toàn bộ request**.

### D12 — Truy vấn MỘT-CÂU: `ScopedGrant` qua recursive CTE

Chuỗi 3 truy vấn hiện tại **đánh mất ràng buộc scope** ngay ở bước 1 (§Context). Thay bằng **một**
recursive CTE mang ràng buộc scope của dòng gốc đi xuyên qua DAG:

```
Hình dạng đặc tả (KHÔNG phải SQL cuối cùng):

WITH RECURSIVE seed AS (
    SELECT id AS user_role_id, role_id, scope_type, business_id
      FROM user_roles
     WHERE user_id = $1 AND revoked_at IS NULL          -- dùng idx_user_roles_user
),
expanded AS (
    SELECT user_role_id, role_id, scope_type, business_id FROM seed
    UNION                                                -- UNION (không ALL): dừng đúng trên DAG hình thoi
    SELECT e.user_role_id, rp.parent_role_id, e.scope_type, e.business_id
      FROM expanded e JOIN role_parents rp ON rp.role_id = e.role_id
)
SELECT DISTINCT e.user_role_id, e.scope_type, e.business_id, p.code, rperm.effect
  FROM expanded e
  JOIN role_permissions rperm ON rperm.role_id = e.role_id
  JOIN permissions      p     ON p.id = rperm.permission_id
```

```ts
export interface ScopedGrant {
  readonly code: string;                              // 'Place.Edit.Managed' | 'Place.Edit.Any' | '*' | …
  readonly effect: 'allow' | 'deny';
  readonly scopeType: 'global' | 'managed' | 'own';   // từ dòng user_roles gốc
  readonly businessId: string | null;                 // từ dòng user_roles gốc
}
```

**Đây là cải thiện hiệu năng ròng: 3 truy vấn → 1.** Không cần index mới — `idx_user_roles_user
(user_id) WHERE revoked_at IS NULL` sẵn có phục vụ neo CTE, và số dòng mỗi người dùng ở mức một chữ số.

### D13 — KHÔNG migration trong M0 (Owner D6)

`user_roles.business_id`, `user_roles.scope_type`, `role_parents`, `role_permissions` **đã tồn tại**
(seed từ Sprint 1 / Wave 1) và đã mang đủ mọi thứ thiết kế này cần. M0 là thay đổi **thuần tầng ứng
dụng**: không `ALTER TABLE`, không enum mới, không backfill.

`CHECK (scope_type <> 'managed' OR business_id IS NOT NULL)` là **hardening đáng làm nhưng hoãn** —
**không** phải điều kiện tiên quyết về tính đúng đắn, vì D6 đã fail closed trên `business_id = NULL`.

### D14 — Lối thoát ở tầng service: CÙNG một PDP

Khi metadata route **không thể** nêu tên tài nguyên một cách an toàn, caller tự dựng
`AuthorizationContext` và gọi **chính** `AuthorizationService.can(userId, permission, context)`.
**Một engine, không phải hai.**

Trường hợp tham chiếu duy nhất hiện có: `ModerationService.decide()` — `target_type` chỉ biết được
lúc runtime **sau khi** đã khoá dòng case, điều mà metadata route không diễn đạt được. Hôm nay nó gọi
`can(actorId, permission)` với permission **không có hậu tố scope** ⇒ đi đường pha 1 ⇒ **hành vi
không đổi**.

### D15 — Milestone

| # | Milestone | Phạm vi | Đổi hành vi? |
|---|---|---|---|
| **M0.1** | **PDP Foundation** | Truy vấn recursive CTE + hình dạng `ScopedGrant`; interface `AuthorizationContext`/resolver; mở rộng `evaluate`/`can(…, context?)`; giữ `getEffectivePermissions()` làm façade. Bộ unit test đầy đủ. **Không đấu nối vào đâu cả** — không đụng guard, không đụng controller. | **Không** — ship tối (dark ship), rủi ro bằng 0 |
| **M0.2** | **PEP + Resolvers + Rollout** | Decorator `@AuthorizationContext`; guard đọc metadata, dựng thunk lười, phân giải qua `ModuleRef`, mặc định fail-closed; **kiểm tra lúc khởi động (D9)**; ghi nhớ theo request (D11); identity + contact + price resolver; gắn decorator cho **cả 8 handler**. E2E đỏ-rồi-xanh + live validation trên Docker thật. | **Có** — đây là nơi khoảng trống thực sự đóng lại |
| **M0.3** | **Own-Scope Hardening** | Mở rộng đúng cơ chế đó sang route scope `Own` (`PATCH /users/me`, `Media.Upload.Own`). Hôm nay chúng an toàn **chỉ nhờ quy ước cấu trúc** (không có tham số `:id`), **không** nhờ bất kỳ phép kiểm tra nào — route `Own` đầu tiên được xây kèm `:id` tường minh sẽ mở lại đúng lỗi này dưới một nhãn scope khác. Là nhất quán + phòng xa, **không** phải defect đang hoạt động. | Có, chỉ theo hướng siết |

M0.1 và M0.2 **phải** ship **trước** ADR-015 M3. M0.3 có thể đi độc lập sau đó.

### D16 — Kiểm chứng: TOÀN BỘ handler Managed đang sống (8 handler / 5 controller)

Kiểm đếm trực tiếp bằng grep trên `apps/api/src`, 2026-08-04:

| # | Controller | Route | Permission | `:id` là | Resolver | Chi phí truy vấn |
|---|---|---|---|---|---|---|
| 1 | `PlacesController` | `PATCH /places/:id` | `Place.Edit.Managed` | place id | `IDENTITY_PLACE_RESOLVER` | **0** |
| 2 | `HotelsController` | `PATCH /hotels/:id/rooms` | `Place.Edit.Managed` | place id | `IDENTITY_PLACE_RESOLVER` | **0** |
| 3 | `RestaurantsController` | `PATCH /restaurants/:id/menu` | `Place.Edit.Managed` | place id | `IDENTITY_PLACE_RESOLVER` | **0** |
| 4 | `ContactsController` | `POST /places/:id/contacts` | `Contact.Edit.Managed` | place id | `IDENTITY_PLACE_RESOLVER` | **0** |
| 5 | `ContactsController` | `PATCH /contacts/:id` | `Contact.Edit.Managed` | contact id | `CONTACT_AUTHZ_RESOLVER` | 1 (có index) |
| 6 | `ContactsController` | `DELETE /contacts/:id` | `Contact.Edit.Managed` | contact id | `CONTACT_AUTHZ_RESOLVER` | 1 (có index) |
| 7 | `PricesController` | `POST /places/:id/prices` | `Price.Edit.Managed` | place id | `IDENTITY_PLACE_RESOLVER` | **0** |
| 8 | `PricesController` | `PATCH /prices/:id` | `Price.Edit.Managed` | price id | `PRICE_AUTHZ_RESOLVER` | 1 (có index) |

**5 trong 8 không cần truy vấn nào** — ADR-015 Model A khiến `business_id === places.id`, nên tham
số route **chính là** câu trả lời. Hai resolver tra cứu đọc `contacts.owner_id` (`owner_type='place'`)
và `price_history.entity_id` (`entity_type='place'`), đều có composite index sẵn.

Thay đổi ở call site là **đúng một dòng decorator cho mỗi handler**. Thân
`PlacesService`/`ContactsService`/`PricesService`/`HotelsService`/`RestaurantsService`: **không đổi
một dòng nào**.

`Media.Upload.Managed` đã seed và đã cấp cho `business_manager` nhưng **chưa route nào yêu cầu nó**
(`presign`/`register` chỉ đòi `Media.Upload.Own`) ⇒ **không có gì phải sửa hôm nay**; cơ chế mở rộng
sang đó không tốn thiết kế mới.

## Alternatives Considered

- **A — `@ManagedResource(...)` chuyên biệt** (resolver `string → businessId`). Đơn giản hơn, ít trừu
  tượng hơn, rủi ro over-engineer thấp nhất *cho đúng nhu cầu hôm nay*. → **Không chọn:** không diễn
  đạt được `Own` (vốn đã nằm trong kế hoạch M0.3) và không hấp thụ được chiều scope thứ hai mà không
  phải sửa lại decorator + resolver contract + **toàn bộ call site**. Phần đắt của thay đổi này là
  call site, không phải logic; A bảo đảm ta trả giá đó **hai lần**.
- **B — Kiểm tra ở tầng service, mỗi method một lần** (theo khuôn INV-12 self-moderation của
  `ModerationService`). Là tiền lệ có thật, đang chạy. → **Không chọn làm cơ chế chính:** thủ công và
  theo từng call site; 5 service phải nhớ thêm kiểm tra, và **mọi** service Managed tương lai cũng
  vậy. Mâu thuẫn trực tiếp với mục tiêu "không nhân bản kiểm tra". Giữ làm **lối thoát** cho trường
  hợp động thật sự (D14).
- **C — Để `user_roles.scope_type` quyết định thay vì hậu tố permission.** → **Loại:** tạo khái niệm
  scope thứ hai cạnh tranh với khái niệm `authorization.util.ts` đã cài, và buộc viết lại
  `grantSatisfies()` — đúng thứ "thiết kế lại hành vi RBAC ngoài phạm vi" mà ADR này cấm mình.
- **D — Phân giải ngữ cảnh HĂM HỞ (eager) cho mọi request có scope.** Đơn giản hơn (không thunk lười).
  → **Loại:** bắt `super_administrator`/`contributor` trả chi phí phân giải cho mọi request dù họ
  luôn thắng ở pha 1 — vi phạm mục tiêu "`Any`/wildcard không đổi" ở khía cạnh hiệu năng.
- **E — Policy engine đầy đủ (ABAC/OPA/CASL).** Diễn đạt được mọi thứ. → **Loại:** engine chính sách
  thứ hai (vi phạm ràng buộc tường minh), dependency mới, và một mô hình quyền song song với RBAC
  hướng dữ liệu mà ADR-007 đã chốt.
- **F — Gộp luôn cache permission xuyên request (TTL/Redis) vào M0.** Sẽ cải thiện hiệu năng nhiều
  hơn nữa. → **Loại (Owner D3):** đó là nợ hệ thống có sẵn, độc lập; gộp vào sẽ **mở rộng bán kính
  ảnh hưởng của một bản vá bảo mật** và thêm dependency. Ghi nhớ theo request (D11) đã lấy được phần
  lợi ích an toàn nhất mà không mang theo rủi ro vô hiệu hoá cache.

## Consequences

### Positive

- Đóng khoảng trống leo thang đặc quyền **trước khi** nó trở nên khai thác được (ADR-015 M3).
- **Nhanh hơn:** 3 truy vấn → 1 ở mọi đường; xoá khuếch đại `3 × N` khi một route đòi nhiều permission.
- **Không nhân bản** kiểm tra: 8 handler được bảo vệ bằng 8 dòng decorator, **0 dòng** trong service.
- `Any`/wildcard/scope-less/deny **không đổi một byte** — toàn bộ Moderation M1–M7 miễn nhiễm.
- Kiểm tra lúc khởi động (D9) biến "quên decorator" từ lỗ hổng âm thầm thành **lỗi deploy-time**.
- Mở rộng sang `Own` (M0.3) và sang chiều scope tương lai **không** đụng decorator API, resolver
  contract, luồng guard, hay call site nào.
- Một PDP duy nhất được bảo toàn — kể cả lối thoát tầng service cũng đi qua đúng `can()`.

### Negative / đánh đổi

- Thêm một khái niệm (`AuthorizationContext` + resolver) mà người mới phải học trước khi thêm một
  route Managed — **giảm nhẹ** bằng D9: quên là **không khởi động được**, không phải im lặng sai.
- Ba trong tám handler tốn thêm **một** truy vấn có index (3 → 2 truy vấn, vẫn ít hơn hôm nay).
- 403 thay vì 404 cho tài nguyên không phân giải được, với caller chỉ có Managed/Own (D10) — đánh đổi
  có chủ đích, đã cân nhắc, chọn nghiêng về không rò rỉ.
- Truy vấn CTE mang scope xuyên DAG là mã **mới**, không phải bản sao một khuôn sẵn có ⇒ phải có unit
  test riêng, cẩn thận (đặc biệt nhánh kế thừa `business_owner ← business_manager`).
- ADR này **không** có nghĩa "không bao giờ phải đụng lõi nữa": thêm một chiều scope thật sự mới
  (`organizationId`) **vẫn** cần một cột `user_roles`, một migration, và một quy tắc khớp trong D6.
  Thứ được bảo đảm là **decorator API, resolver interface, luồng guard và mọi call site đứng yên**.

## Related Documents

- [rbac.md](../security/rbac.md) — quy ước `Module.Action[.Scope]`, `Any ⊃ Managed ⊃ Own`
- [security.md §4–5](../architecture/security.md) — PDP/PEP, deny thắng, kế thừa DAG
- [database.md §3.9–3.13](../data/database.md) — `roles`/`permissions`/`role_permissions`/`role_parents`/`user_roles`
- [business.md](../data/modules/business.md) — `business_id = places.id` (ADR-015 Model A) mà `businessId` của context ánh xạ tới

## Related ADR

- [ADR-007](ADR-007-rbac-model.md) — mô hình RBAC được **bổ sung**, không thay thế; xem §Addendum của ADR-007
- [ADR-015](ADR-015-business-ownership-model.md) — nguồn của ngữ nghĩa `business_id → places`; M3 của nó **bị chặn** bởi ADR này
- [ADR-018](ADR-018-moderation-foundation.md) — nguồn của lối thoát tầng service (`ModerationService.decide()`), tiền lệ Addendum
- [ADR-003](ADR-003-no-polymorphic.md) — nguyên tắc mô hình quan hệ mà resolver contacts/prices tuân theo

## Notes

- Đề xuất và chốt 2026-08-04. Phát hiện gốc đến từ §Dependencies của bản đánh giá kỹ thuật ADR-015
  ("Finding A"), được kiểm chứng **trực tiếp trong mã nguồn** (`PermissionsGuard`,
  `AuthorizationService`, `authorization.util.ts`, `UserRolesRepository`) và trên **schema Postgres
  thật**, không suy ra từ tài liệu.
- Bản kiểm đếm 8 handler (D16) **sửa lại** con số "3 route" ghi trong bản đánh giá đầu tiên —
  `HotelsController` và `RestaurantsController` đã bị bỏ sót ở lần đếm đó.
- **Không một artifact triển khai nào được tạo cùng ADR này** (không code, không migration, không
  test, không sửa controller/guard/service/repository) — đúng chỉ đạo Owner.
- Điều kiện để ADR này cần xem lại: (1) thêm một chiều scope mới (organization/team/tenant) → mở rộng
  D3 + D6; (2) xuất hiện nhu cầu deny theo tài nguyên → mở lại D7/Owner D5; (3) đo được nhu cầu cache
  permission xuyên request → mở lại Alternative F.

## Quyết định Owner

### 1. Đã chốt

| # | Quyết định | Nội dung chốt |
|---|---|---|
| **D1** | Vị trí milestone | M0 là **track kiến trúc bảo mật độc lập**, tách khỏi ADR-015. **Phải hoàn tất trước** khi ADR-015 M3 được phép cấp bất kỳ `business_owner`/`business_manager` thật nào. |
| **D2** | Kiểm tra lúc khởi động | **Bắt buộc.** Quét mọi handler lúc bootstrap; thiếu context metadata cho permission `Managed`/`Own` ⇒ **khởi động thất bại**, nêu đích danh controller · handler · route · mã permission · metadata thiếu. **Không** hoãn sang chỉ-lúc-request; cưỡng chế lúc request vẫn giữ làm phòng thủ chiều sâu. Xem D9. |
| **D3** | Ghi nhớ theo request | **Bắt buộc.** Nạp `ScopedGrant` tối đa **một lần mỗi request**. Cấm cache xuyên request/TTL/Redis/dependency mới/global mutable. Chia sẻ Promise đang bay giữa các phép kiểm đồng thời. Kết quả resolver được phép ghi nhớ theo khoá `resolver/resource` trong request. Xem D11. |
| **D4** | 403 vs 404 | Chấp nhận **403 đồng nhất** cho caller Managed/Own khi không phân giải được ngữ cảnh; **không** tiết lộ tài nguyên có tồn tại hay không. Caller `Any`/wildcard giữ nguyên hành vi 404 ở tầng service. Xem D10. |
| **D5** | Deny có scope | **Giữ nguyên** ngữ nghĩa deny bao trùm hiện tại. **Không** đưa deny giới hạn theo tài nguyên vào M0. Xem D7. |
| **D6** | CHECK toàn vẹn `user_roles` | **Hoãn.** Không migration trong M0. PDP **đã** fail closed khi Managed grant có `business_id = NULL`. Một migration hardening tương lai *có thể* thêm `CHECK (scope_type <> 'managed' OR business_id IS NOT NULL)`. Xem D13. |
| **D7** | Tài liệu ADR | Tạo bản ghi kiến trúc **độc lập, Accepted** cho M0 (chính là ADR-019 này) + **Addendum/tham chiếu** ở ADR-007 giải thích rằng việc cưỡng chế Managed/Own do thẩm quyền mới này triển khai. **Không** viết lại quyết định lịch sử của ADR-007. |

### 2. Quyết định còn mở

**Không còn quyết định nào.** D1–D7 đã chốt toàn bộ. Các hạng mục còn lại đều được phân loại tường
minh thành **đã hoãn kèm điều kiện mở lại** (CHECK toàn vẹn — D6; deny theo tài nguyên — D5; cache
xuyên request — Alternative F) hoặc **ngoài phạm vi** (§Tuyên bố phạm vi phủ định ở đầu §Decision).
Không hạng mục nào chặn M0.1.

## Tình trạng triển khai (Implementation Status)

*(Mục này CHỈ ghi lại tiến độ triển khai — KHÔNG sửa bất kỳ nội dung quyết định nào ở D1–D16/
Quyết định Owner. Cùng quy ước ADR-018's milestone banner, áp cho một ADR có nhiều milestone.)*

**M0.1 — PDP Foundation: ✅ ĐÃ TRIỂN KHAI (2026-08-04).** Contract `AuthorizationContext`/
`AuthorizationContextResolver` (D3/D5); truy vấn recursive CTE một-câu `ScopedGrant`
(`UserRolesRepository.getScopedGrants`, D12) — kiểm chứng SỐNG trên Postgres thật, kể cả trường hợp
DAG hình thoi dùng chính đồ thị `role_parents` đã seed (`moderator` → `{contributor, local_guide}`
→ `member`), không cần migration hay role giả; `evaluateScopedAccess`/`grantScopeOf`
(scoped-authorization.util.ts) — thuật toán hai pha (D2) + bảng quyết định (D6), 27 unit test;
`AuthorizationService.can(userId, permission, contextProvider?)` mở rộng — **ship TỐI, KHÔNG guard/
controller nào gọi kèm context** — xác nhận bằng toàn bộ regression (BE unit 106 suite/1203 test,
BE e2e 21 suite/177 test, real Docker). `RequestScopedGrantCache` (D11) — nền tảng ghi nhớ theo
request, đã test đầy đủ, CHƯA đấu nối vào guard (đó là việc của M0.2).

**Phát hiện quan trọng lúc triển khai:** bản đầu vô tình cho đường "không context" của `can()`
fail-closed VÔ ĐIỀU KIỆN cho cả scope `Managed` LẪN `Own` — an toàn với `Managed` (không ai giữ
grant đó hôm nay) nhưng phá vỡ `Own` ĐANG SỐNG (`Media.Upload.Own`, `User.Edit.Own` — an toàn hôm
nay CHỈ nhờ quy ước cấu trúc, đúng như D15 M0.3 đã mô tả, KHÔNG nhờ phép kiểm tra nào). Bắt được
bằng chính bộ e2e thật (20 test thất bại) — sửa bằng cách giữ đường "không context" tương thích
NGUYÊN VẸN (rank-thuần, `isAllowed`) cho MỌI scope, chỉ kích hoạt đường fail-closed mới khi caller
CHỦ ĐỘNG truyền `contextProvider`. Xem chi tiết đầy đủ:
[M0-RESOURCE-SCOPED-AUTHORIZATION-PDP-FOUNDATION-2026-08-04.md](../delivery/reports/M0-RESOURCE-SCOPED-AUTHORIZATION-PDP-FOUNDATION-2026-08-04.md).

**M0.2 — PEP + Resolvers + Rollout:** CHƯA bắt đầu.
**M0.3 — Own-Scope Hardening:** CHƯA bắt đầu.
