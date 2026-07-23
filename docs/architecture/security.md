# PhuQuocHub — Kiến trúc bảo mật (Security Architecture)

> **Mục đích:** mô tả **cơ chế kỹ thuật** thực thi bảo mật — đặc biệt là cách hệ thống RBAC được đánh giá và cưỡng chế — sao cho không hardcode và mở rộng được 10 năm. Danh mục vai trò/permission nằm ở [security/rbac.md](../security/rbac.md); xác thực ở [security/auth.md](../security/auth.md). Tài liệu **chỉ thiết kế**, không code, không SQL.

## 1. Nguyên tắc bảo mật tổng thể

1. **Deny by default** — mọi truy cập bị từ chối trừ khi có quyền rõ ràng.
2. **Least privilege** — cấp tối thiểu; quyền cao càng hẹp càng tốt.
3. **Defense in depth** — nhiều lớp: biên (rate limit, CORS) → xác thực → phân quyền → kiểm tra scope → audit.
4. **Không hardcode quyền** — quy tắc là *dữ liệu/cấu hình*, không phải điều kiện `if role == ...` trong code.
5. **Tách AuthN/AuthZ** — nhận diện tách khỏi cấp quyền.
6. **Fail closed** — khi bộ đánh giá quyền lỗi/không chắc → từ chối, không "cho qua".

## 2. Ranh giới AuthN ↔ AuthZ

```
Request ─► [AuthN] xác thực principal (JWT/OAuth)  ── auth.md
        └► [AuthZ] đánh giá quyền trên tài nguyên   ── tài liệu này + rbac.md
```

- **AuthN** trả về *principal* (user hoặc AI Agent) + danh tính, không quyết định quyền.
- **AuthZ** nhận principal → giải ra **effective permissions** → so với permission mà hành động yêu cầu → kiểm tra **scope** → cho phép/từ chối.

## 3. Mô hình PDP–PEP (cưỡng chế phân quyền)

Áp dụng mẫu **Policy Enforcement Point / Policy Decision Point**:

```
                 ┌───────────────── PEP ─────────────────┐
Request ─► Guard trên endpoint  (khai báo permission cần) │
          │  requires: "Place.Approve"                    │
          └──────────────┬────────────────────────────────┘
                         ▼
              ┌────────── PDP ───────────┐   nguồn dữ liệu:
              │ 1. Lấy effective perms   │◄── Role→Permission (data)
              │ 2. Khớp permission cần   │◄── Role→Role kế thừa (data)
              │ 3. Đánh giá scope/điều   │◄── quan hệ sở hữu / business
              │    kiện ngữ cảnh (ABAC)  │
              │ 4. Trả Allow / Deny      │
              └──────────┬───────────────┘
                         ▼
                  Allow → chạy · Deny → 403 + audit
```

- **PEP** = điểm chặn khai báo *"hành động này cần permission X"* (không chứa logic role).
- **PDP** = bộ quyết định thuần, đọc cấu hình RBAC + ngữ cảnh; **là nơi duy nhất** biết cách suy ra quyền.
- Ưu điểm: thêm module/role/permission chỉ đổi *dữ liệu* mà PDP đọc — PEP và lõi không đổi.

## 4. Mô hình dữ liệu phân quyền (khái niệm)

Chỉ mô tả khái niệm (chi tiết bảng ở tài liệu data, không đưa SQL ở đây):

| Khái niệm | Vai trò |
|---|---|
| **Principal** | user hoặc AI Agent |
| **Role** | gói permission |
| **Permission** | năng lực `Module.Action[.Scope]` |
| **Role ↔ Permission** | ánh xạ nhiều–nhiều (dữ liệu) |
| **Role ↔ Role** | quan hệ kế thừa (DAG) |
| **Principal ↔ Role** | gán vai trò (có thể kèm scope: cơ sở nào) |
| **Scope binding** | ràng buộc ngữ cảnh: `Own`, `Managed(business_id)`, `Any` |
| **Audit log** | vết mọi quyết định đặc quyền |

> Vì tất cả là dữ liệu, có thể chỉnh RBAC **không cần deploy** — đúng nguyên tắc "không hardcode".

> **Hiện thực dữ liệu:** các khái niệm trên ánh xạ tới bảng `roles`, `permissions`, `role_permissions`, `role_parents`, `user_roles` ([database.md §3.9–3.13](../data/database.md)); Principal gồm `users` (người) và `users.is_service_account=true` (AI Agent). Cột `users.role` ENUM **đã bị loại bỏ** ([ADR-007](../99-decisions/ADR-007-rbac-model.md), **Accepted**).

## 5. Suy ra quyền hiệu lực (Effective permissions)

1. Gom mọi Role của principal (trực tiếp + kế thừa qua DAG).
2. Hợp (union) toàn bộ Permission của các role đó.
3. Nở wildcard: `Place.*` → mọi action Place; `*` → toàn bộ.
4. Với mỗi yêu cầu, kiểm tra **scope**: `Any` (mọi tài nguyên) ⊃ `Managed` (tài nguyên thuộc business được giao) ⊃ `Own` (tài nguyên do chính mình tạo).
5. (Tùy chọn) áp **explicit deny** ưu tiên hơn allow cho tình huống cấm cụ thể.

Kết quả nên được **cache** theo principal và **vô hiệu hóa cache** khi đổi role/permission.

## 6. Scope & điều kiện ngữ cảnh (ABAC-lite)

RBAC trả lời *"có năng lực không"*; scope trả lời *"trên đúng tài nguyên không"*:

- **Own:** `resource.created_by == principal.id`.
- **Managed:** tồn tại quan hệ *principal → business → resource* đang hiệu lực (Owner/Manager).
- **Any:** không ràng buộc tài nguyên.
- **Điều kiện trạng thái:** vd chỉ `Approve` khi `status = pending`.

Đây là ranh giới chống lỗ hổng **IDOR/leo quyền ngang** — chỉ có permission là chưa đủ nếu tài nguyên không thuộc scope.

## 7. Token & claims

- Access token (JWT) mang **định danh + role tối thiểu**, không nhồi toàn bộ permission (tránh token phình & lệch khi quyền đổi).
- Server **luôn đánh giá lại** effective permissions phía backend (không tin danh sách quyền do client gửi).
- Chi tiết vòng đời token: [auth.md](../security/auth.md).

## 8. Bảo mật AI Agent (service principal)

- AI Agent dùng **credential dịch vụ riêng** (không phải phiên người dùng), phạm vi hẹp chỉ `AI.*` + tạo nháp `pending`.
- **Không có** quyền `Publish/Approve/Verify/Delete`; mọi output là đề xuất chờ người duyệt (human-in-the-loop).
- Rate-limit và **audit riêng**; có thể thu hồi tức thời qua `AI.Agent.Manage`.
- Nguyên tắc: *AI đề xuất, con người quyết định* — khớp provenance `type=ai`, reliability thấp nhất trong [data/modules/source.md](../data/modules/source.md).

## 9. Kiểm toán & quan sát (Audit)

- Ghi vết mọi hành động đặc quyền: *ai · permission · tài nguyên · scope · kết quả · thời điểm*.
- Bất biến, chỉ ghi thêm; phục vụ điều tra & tuân thủ.
- Cảnh báo hành vi bất thường (leo quyền, thao tác hàng loạt).

## 10. Mối đe dọa & giảm thiểu (tóm tắt)

| Mối đe dọa | Giảm thiểu |
|---|---|
| Leo quyền dọc (privilege escalation) | Deny by default, không hardcode, Super Admin tối thiểu + audit |
| Leo quyền ngang / IDOR | Kiểm tra scope (Own/Managed) ở PDP |
| Token giả/hết hạn | Xác thực chữ ký, hạn ngắn, refresh thu hồi được |
| Lạm dụng AI | Quyền hẹp, output `pending`, rate-limit, audit |
| Rò rỉ qua API công khai | API key + quota `Developer.*`, không lộ dữ liệu nhạy cảm |
| Đổi RBAC trái phép | Chỉ Super Admin `Permission.Manage`, 4-eyes, audit |

## 11. Mở rộng 10 năm

- **Module mới (Jobs, Real Estate, Marketplace, Mobile):** đăng ký namespace + action chuẩn → PDP đọc ngay, PEP chỉ khai báo permission cần.
- **Vai trò mới:** ghép từ permission có sẵn (custom role), không sửa lõi.
- **Ủy quyền scoped tái sử dụng:** mẫu Owner→Manager áp cho Shop→Staff, Agency→Agent.
- **Versioning schema quyền:** cho phép nâng cấp danh mục permission có kiểm soát.

## 12. Ghi chú — nội dung bổ sung sau

- [ ] Sơ đồ luồng PEP→PDP chi tiết (sequence).
- [ ] Quy tắc cache & invalidation effective permissions.
- [ ] Chuẩn định dạng bản ghi audit.
- [ ] Chính sách secret/credential cho AI Agent & bên thứ ba.
- [ ] Mối liên hệ với `deployment.md` (bảo mật hạ tầng, mạng).

---

*Tài liệu liên quan: [security/rbac.md](../security/rbac.md), [security/auth.md](../security/auth.md), [architecture.md](./architecture.md), [data/modules/source.md](../data/modules/source.md)*
