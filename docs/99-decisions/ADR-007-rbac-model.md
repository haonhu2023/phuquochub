# ADR-007 — Mô hình Role/Permission (RBAC Model)

## Status
**Accepted** — 2026-07-12. Supersedes cột `users.role` ENUM trong [database.md §3.1](../data/database.md).

## Context
- [database.md §3.1](../data/database.md) trước đây để `users.role = ENUM(guest, user, contributor, moderator, admin)`; [glossary.md §1.2](../overview/glossary.md) liệt kê cùng 5 giá trị.
- [rbac.md](../security/rbac.md) thiết kế **10 vai trò** (Guest, Member, Local Guide, Contributor, Business Owner, Business Manager, Moderator, Administrator, Super Administrator, AI Agent) + nguyên tắc #1 *"không hardcode; Role→Permission và Role→Role là dữ liệu, sửa không cần deploy"*, kế thừa DAG, scope `Own/Managed/Any`.
- [security.md §4](../architecture/security.md) mô tả mô hình dữ liệu khái niệm (Principal · Role · Permission · ánh xạ N–N · DAG · scope binding · audit). [workflow.md WF-01](../workflow/workflow.md) đặt vai trò mặc định là **Member** (lệch tên "user").
- **Vấn đề:** ENUM cứng vi phạm nguyên tắc "role là dữ liệu"; thiếu 5 vai trò và lệch tên; không biểu diễn được scope Managed / đa vai trò / AI Agent / kế thừa; **không có bảng RBAC** nào để sinh Prisma ⇒ chặn cứng thiết kế schema.

## Decision
Chọn **Phương án A — RBAC hướng dữ liệu đầy đủ; bỏ hẳn `users.role` ENUM.** Thêm 5 bảng + một cờ principal ([database.md §3.9–3.13](../data/database.md)):

| Bảng | Vai trò |
|---|---|
| `roles` | vai trò (`code`, `is_system`, `is_assignable`) |
| `permissions` | quyền nguyên tử `Module.Action[.Scope]` (+ wildcard) |
| `role_permissions` | N–N Role↔Permission, có `effect = allow/deny` (explicit deny) |
| `role_parents` | kế thừa Role→Role (DAG, `CHECK` chống tự tham chiếu) |
| `user_roles` | gán vai trò cho principal + `scope_type` (`global/managed/own`) + `business_id` |

- **Bỏ** cột `users.role` ENUM; một principal giữ **nhiều** vai trò qua `user_roles`.
- **AI Agent** = `users.is_service_account = true` mang vai trò `ai_agent`, không kế thừa nhánh con người.

## Consequences
### Positive
- Khớp `rbac.md` + `security.md` (nguồn sự thật); không hardcode, sửa RBAC không cần deploy.
- Hỗ trợ scope Managed, kế thừa DAG, custom role, namespace mở rộng 10 năm (Jobs/Marketplace).
- Gỡ blocker sinh Prisma cho tầng phân quyền; một nguồn sự thật duy nhất.

### Negative / đánh đổi
- Thêm 5 bảng + seed vai trò/permission mặc định.
- Cần tính "effective permissions" + cache & vô hiệu hóa cache khi đổi role/permission ([security.md §5](../architecture/security.md)).
- **Điểm mở:** `user_roles.business_id` (scope Managed) **→ places** (Place đã claim); quan hệ sở hữu `business_members` **Accepted** — B8/[ADR-015](ADR-015-business-ownership-model.md). AI Agent hiện dùng cờ `is_service_account`; cân nhắc bảng `service_principals` riêng nếu số service tăng.

## Alternatives Considered
- **B — Giữ `users.role` ENUM, hoãn RBAC:** đơn giản cho MVP nhưng phá nguyên tắc lõi rbac.md, không biểu diễn scope/AI Agent/đa vai trò, tạo nợ kỹ thuật phải làm lại. → **Loại.**
- **C — Hybrid (RBAC chuẩn + cột cache `users.primary_role`):** tiện hiển thị/token nhanh nhưng thêm nguồn sự thật thứ hai, rủi ro lệch cache. → Không chọn mặc định; chỉ thêm cache nếu đo được nhu cầu.

## References
- [rbac.md §4–5.1](../security/rbac.md) · [security.md §4](../architecture/security.md) · [database.md §3.1 & §3.9–3.13](../data/database.md) · [api.md §10–10.1](../api/api.md) · [glossary.md §1.2](../overview/glossary.md) · [workflow.md WF-01](../workflow/workflow.md)
- Related ADR: [ADR-003](ADR-003-no-polymorphic.md) (nguyên tắc mô hình quan hệ) · [ADR-019](ADR-019-resource-scoped-authorization.md) (cưỡng chế `Managed`/`Own` theo tài nguyên — xem Addendum bên dưới)
- Nguồn: Blocker B1 trong rà soát docs/ chuẩn bị thiết kế Prisma. Quyết định 2026-07-12 (Data Architect).

## Addendum — cưỡng chế scope theo tài nguyên, 2026-08-04

**Không supersede, không sửa, không mở lại bất kỳ quyết định nào ở trên.** Mục này chỉ **trỏ tới**
thẩm quyền mới đã đảm nhận một phần việc mà chính ADR-007 đã ghi là còn mở.

ADR-007 chốt *mô hình dữ liệu* RBAC — trong đó `user_roles` mang `scope_type` (`global/managed/own`)
và `business_id` — nhưng **không** đặc tả cơ chế **cưỡng chế** scope `Managed`/`Own` ở tầng ứng
dụng. §Consequences ở trên đã ghi nhận đúng điều đó dưới mục **"Điểm mở"** (`user_roles.business_id`
→ places). Cho tới 2026-08-04, hệ quả thực tế là: hai cột này **được ghi nhưng chưa bao giờ được PDP
đọc** — `AuthorizationService.can()` chỉ nhận `(userId, permission)`, nên `Managed` được so sánh
theo **hạng** scope chứ không theo **danh tính tài nguyên**.

[**ADR-019 — Phân quyền theo tài nguyên**](ADR-019-resource-scoped-authorization.md) (**Accepted**,
2026-08-04) là thẩm quyền triển khai đóng khoảng trống đó. Tóm tắt phần liên quan tới ADR-007:

- `AuthorizationService` **vẫn là PDP duy nhất**; `PermissionsGuard` **vẫn là PEP chính** — ADR-019
  mở rộng, không thay thế, không tạo engine chính sách thứ hai.
- `authorization.util.ts` (`grantSatisfies`/`isAllowed`) được **tái dùng nguyên vẹn**: `Any`,
  wildcard (`*`, `Module.*`), permission không hậu tố scope, và thứ tự ưu tiên **deny thắng allow**
  giữ nguyên **không đổi một byte**.
- Bổ sung **duy nhất**: khi grant thỏa mãn nằm ở scope `Managed`/`Own`, PDP so `user_roles.business_id`
  của **chính dòng grant đó** với `businessId` của tài nguyên đích (hoặc `ownerId` với người gọi,
  cho `Own`).
- **Fail closed:** một grant hậu tố `Managed` đến từ dòng `user_roles` có `business_id = NULL` khớp
  **không gì cả** — không thể thoái hoá thành allow bao trùm.
- **Không đổi schema RBAC**: không bảng mới, không cột mới, không migration. Mọi thứ ADR-019 cần đã
  do ADR-007 tạo ra từ đầu.

Quyết định lịch sử của ADR-007 (bỏ `users.role` ENUM, 5 bảng hướng dữ liệu, kế thừa DAG, explicit
deny) **giữ nguyên hiệu lực và nguyên văn**.
