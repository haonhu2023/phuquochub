# ADR-016 — Mô hình Nhật ký Kiểm toán (Audit Log Model)

## Status

**Accepted** — 2026-07-13. Bổ sung tầng audit hành chính/bảo mật còn thiếu của Trust Layer (GAP-1). Không supersede ADR nào; **bổ sung** cho [ADR-008](ADR-008-verification-model.md) (verification_events) và [ADR-014](ADR-014-revision-model.md) (wiki_revisions).

## Context

- Cả **20 workflow** ([workflow.md](../workflow/workflow.md), [contribution.md](../workflow/contribution.md), [moderation.md](../workflow/moderation.md)) đều khai báo một mục **"Audit Log:"** với mã sự kiện cụ thể (`user.registered`, `auth.login.success`, `place.status_changed`, `moderation.decided`, `business.claim_approved`, `report.created`…).
- [rbac.md §2](../security/rbac.md) (nguyên tắc §9) và [security.md §9](../architecture/security.md) yêu cầu *"ghi vết mọi hành động đặc quyền: ai · permission · tài nguyên · scope · kết quả · thời điểm"*, **bất biến, chỉ ghi thêm**. Permission `System.Audit.View` đã tồn tại.
- **Nhưng** không có thực thể/bảng nào lưu các sự kiện này: không có trong [database.md §3](../data/database.md), không trong catalog §11, không trong [erd.md](../data/erd.md), không có endpoint. [security.md §12](../architecture/security.md) còn ghi mục mở *"Chuẩn định dạng bản ghi audit."*
- Đã có **3 tầng audit chuyên biệt**: `wiki_revisions` (lịch sử nội dung), `source_attributions` (provenance), `verification_events` (máy trạng thái xác minh). Cả ba chỉ bao phủ **thay đổi dữ liệu nội dung** — **không** bao phủ hành động **danh tính / phân quyền / hành chính**: đăng nhập, ban/mute, gán role, đổi lược đồ RBAC, impersonation, claim/transfer sở hữu, broadcast.

## Problem

Trust Layer đặt mục tiêu *"mọi thay đổi đều truy vết được"* và *"audit đầy đủ"*. Hiện các sự kiện đặc quyền không gắn với thay đổi nội dung (login, ban, role-assign, RBAC schema change, impersonation) **không được lưu ở đâu** ⇒ không thể điều tra, không đáp ứng tuân thủ, và các dòng "Audit Log:" trong workflow **không có đích ghi**.

## Decision

Chúng ta sẽ thêm thực thể **`audit_logs`** làm **tầng kiểm toán xuyên suốt (cross-cutting), append-only, bất biến** cho mọi hành động đặc quyền/đổi trạng thái. Thiết kế đầy đủ ở [database.md §3.21](../data/database.md).

- **Đa hình** (`entity_type` + `entity_id`, **không FK cứng**) — theo **ngoại lệ [ADR-003](ADR-003-no-polymorphic.md)** đã áp cho `source_attributions`/`wiki_revisions`: audit phải trỏ tới **mọi loại** tài nguyên và **không cascade** (phải sống sót khi tài nguyên bị xóa/soft-delete). Chỉ FK mềm `actor_id → users`.
- **Bất biến:** chỉ `INSERT`; **cấm** `UPDATE`/`DELETE`/soft-delete (cưỡng chế ở tầng ứng dụng + quyền ghi DB chỉ `INSERT`). Dọn dữ liệu bằng **retention policy** (giữ ≥12 tháng, archive lạnh), không sửa từng dòng.
- **Nội dung bản ghi** khớp yêu cầu security.md §9: `event, actor_id, actor_role, is_service_account, permission, scope, entity_type, entity_id, result, ip, user_agent, before, after, context, correlation_id, created_at`.
- **Bổ sung, không thay** `verification_events`: một transition Verification vẫn ghi chi tiết kỹ thuật (có cascade) ở `verification_events`, đồng thời ghi dấu vết hành chính "ai·quyền·kết quả" ở `audit_logs`.
- **Bề mặt đọc:** chỉ `GET` qua `System.Audit.View` ([api.md §24](../api/api.md)); **không** endpoint ghi (audit sinh nội bộ trong workflow). Đọc audit cũng bị self-audit.
- **Nguyên tắc workflow:** thêm vào [workflow.md §3](../workflow/workflow.md) — *"mọi dòng Audit Log ghi một bản ghi bất biến vào `audit_logs`"* — không phải sửa từng WF.

## Alternatives Considered

- **A — Không có bảng riêng, dựa vào log ứng dụng (stdout/ELK):** phi cấu trúc, không truy vấn theo tài nguyên, không đảm bảo bất biến/tuân thủ, không phục vụ endpoint `System.Audit.View`. → **Loại.**
- **B — Nhồi mọi audit vào `verification_events`/`wiki_revisions`:** hai bảng này có FK cứng + cascade theo entity cụ thể ⇒ không biểu diễn được sự kiện xuyên nhiều loại (login, ban, RBAC) và sẽ **mất** khi entity bị xóa. → **Loại** (sai bản chất).
- **C — Bảng audit riêng cho từng miền (`auth_audit`, `rbac_audit`, `moderation_audit`…):** toàn vẹn cao nhưng **nhân bản N bảng + N truy vấn UNION** cho một dòng thời gian điều tra; đi ngược mẫu "một sổ audit thống nhất". → **Loại** (over-engineer).
- **D — `audit_logs` đa hình, append-only, không cascade (chọn):** một sổ thống nhất, truy vấn theo `entity`/`actor`/`event`, bất biến, mở rộng loại mới không đổi schema — nhất quán với `source_attributions`. → **Chọn.**

## Consequences

### Positive

- Khép kín mục tiêu *"audit đầy đủ / mọi thay đổi truy vết được"*; mọi dòng "Audit Log:" của 20 workflow có đích ghi.
- `System.Audit.View` có bề mặt thực thi (endpoint `/audit`).
- Một dòng thời gian điều tra thống nhất cho mọi tài nguyên & mọi tác nhân (kể cả AI/hệ thống); phục vụ phát hiện leo quyền/thao tác hàng loạt (security.md §9).
- Mở rộng module tương lai (Jobs, Marketplace…) chỉ cần thêm giá trị `event`/`entity_type` — không đổi schema.

### Negative

- **Đa hình** → không FK/cascade gốc; toàn vẹn `entity_id` ở tầng ứng dụng, Prisma biểu diễn bằng `entity_type + entity_id` (cùng nhóm nợ với `source_attributions`/`wiki_revisions`).
- **Khối lượng lớn** → cần partition theo `created_at` + retention/archive; chi phí lưu trữ.
- Kỷ luật ghi: mỗi workflow phải phát audit nhất quán (giảm rủi ro bằng ghi tập trung ở tầng PEP/middleware, không rải rác).
- Rủi ro lộ PII trong `before/after` → bắt buộc **redact** trước khi ghi/khi trả API.

## Related Documents

- [database.md §3.21](../data/database.md) (thiết kế `audit_logs`), §7 (nguyên tắc audit), §11 (catalog) · [erd.md §2/§3/§5](../data/erd.md) · [api.md §24](../api/api.md) (`/audit`) · [security.md §9/§12](../architecture/security.md) · [rbac.md §2/§3.3/§4.10](../security/rbac.md) (`System.Audit.View`) · [workflow.md](../workflow/workflow.md)/[contribution.md](../workflow/contribution.md)/[moderation.md](../workflow/moderation.md) (dòng "Audit Log:")

## Related ADR

- [ADR-003](ADR-003-no-polymorphic.md) — ngoại lệ đa hình (audit là tham chiếu lỏng, nhiều loại, không cascade).
- [ADR-008](ADR-008-verification-model.md) — `verification_events` (audit chuyên biệt, có cascade) — **bổ sung**, không thay.
- [ADR-014](ADR-014-revision-model.md) — `wiki_revisions` (lịch sử nội dung) — cùng triết lý "audit bất biến".

## Notes

- Đề xuất: Principal Software Architect. Ngày: 2026-07-13. Nguồn: GAP-1 trong rà soát Trust Layer (kết Wave 1).
- Còn mở (theo dõi): chuẩn định dạng bản ghi chi tiết & retention (security.md §12); ghi audit tập trung ở PEP/middleware vs từng service; danh mục `event` chuẩn hóa đầy đủ.
- **Không** giải quyết GAP-2 (Source ADR), GAP-3/4 (Contribution/Report) — xử lý ở ADR riêng.
