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
- Related ADR: [ADR-003](ADR-003-no-polymorphic.md) (nguyên tắc mô hình quan hệ)
- Nguồn: Blocker B1 trong rà soát docs/ chuẩn bị thiết kế Prisma. Quyết định 2026-07-12 (Data Architect).
