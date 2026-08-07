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

---

## Tình trạng triển khai — H-1 THU HỒI ACCESS TOKEN (2026-08-06)

**✅ ĐÃ TRIỂN KHAI.** Milestone hardening hẹp, đóng finding **H-1** của Production Readiness Review
(rà soát toàn repo, read-only, 2026-08-06 — báo cáo đó KHÔNG được ghi thành file trong repo này nên
không có tài liệu để dẫn link): *"Access tokens cannot be revoked; deactivated or banned users retain
API access until JWT_ACCESS_TTL expires."*

Liên quan tới ADR này vì đây là **hành động đặc quyền thuộc miền danh tính** mà §Bối cảnh (dòng 12/16)
nêu thẳng là chưa được bao phủ. Milestone này **KHÔNG** thêm audit event nào cho auth (đó là finding
H-3 riêng, vẫn còn mở) — nó chỉ làm cho việc **đổi vai trò** (đã có audit `role.assigned`/
`role.revoked` từ trước) thực sự có hiệu lực NGAY trên phiên đang chạy.

**Cơ chế: mốc thu hồi (revocation epoch) trên Redis, cưỡng chế tại `JwtAuthGuard`.**
- Khoá `authrev:{userId}` = mốc thu hồi (epoch **giây**), TTL = `jwt.accessTtl`. Sau khoảng đó mọi
  token cấp trước mốc đều tự hết hạn nên khoá không còn mang thông tin — tự tiêu, dung lượng là
  O(số user vừa bị thu hồi), KHÔNG cần job dọn dẹp.
- **KHÔNG đổi định dạng JWT.** Dùng `iat` vốn đã có trong MỌI access token (`@nestjs/jwt` →
  `jsonwebtoken` tự thêm `iat`; `AuthModule` chỉ đặt `expiresIn`). Token cấp TRƯỚC khi tính năng này
  triển khai vẫn hoạt động — không migration token, không deploy đồng bộ.
- **Chi phí: đúng MỘT `GET` Redis mỗi request đã xác thực. KHÔNG truy vấn DB.** Route `@Public()`
  return TRƯỚC bước này (đã có e2e khẳng định kênh công khai không phụ thuộc Redis).
- `AuthRevocationModule` đặt ở `core/` + `@Global()` theo ĐÚNG tiền lệ `AuditModule`: ba consumer nằm
  ở ba module khác nhau và `AuthModule` đã import `UsersModule`, nên đặt service trong `AuthModule`
  sẽ tạo VÒNG LẶP module. Không dùng `forwardRef`.

**Ba trigger đã nối (Owner Decision D1-A/D3):** gán vai trò thành công, thu hồi vai trò thành công
(cả hai trong `UsersService`, thu hồi token của user **ĐÍCH**), và endpoint MỚI
`POST /auth/logout-all` (đã xác thực, `userId` LUÔN từ JWT — không từ body). Logout-all xoá CẢ mốc
access **và** mọi refresh token của user đó; để làm được việc thứ hai, Redis được thêm chỉ mục
`refresh:user:{userId}` (SET các `jti`) — trước đây chỉ có `refresh:{jti} → userId` nên không có đường
nào liệt kê token của một user. Đây là chỉ mục THUẦN BỔ TRỢ: **ngữ nghĩa xoay vòng refresh không đổi**
(vẫn single-use, vẫn kiểm `jti`, vẫn kiểm `isActive`), và **KHÔNG** phải family/reuse detection (đó là
finding H-5, vẫn còn mở).

**Fail closed (Owner Decision D2).** Redis lỗi khi kiểm tra ⇒ **từ chối** request (401) + log mức
`error`; TUYỆT ĐỐI không quay về "chỉ tin chữ ký". Chỉ lỗi **hạ tầng/điều khiển** (Redis không đọc
được, mốc hỏng, token thiếu `iat`) mới log `error` — token bị thu hồi bình thường là thất bại xác thực
THÔNG THƯỜNG, không log error (nếu không, mỗi lần logout-all sẽ bơm rác vào log lỗi).

**Không nuốt lỗi bảo mật (Owner "security-side-effect rule").** `revokeAllForUser()` ném
`ServiceUnavailableException` khi Redis lỗi. Ghi nhận thẳng: mutation `user_roles` nằm ở Postgres,
mốc thu hồi nằm ở Redis — **KHÔNG có transaction chung**. Nếu Redis lỗi, vai trò trong DB **đã commit**
và audit **đã ghi** (thứ tự DB → audit → revoke là có chủ đích, để hành động đặc quyền luôn có vết),
nhưng token cũ CHƯA bị thu hồi. Ta chọn phơi lỗi cho caller thay vì im lặng; giải pháp mạnh hơn
(outbox/retry) cần hạ tầng chưa có trong repo và KHÔNG thuộc phạm vi H-1.

**Giới hạn nội tại, nêu thẳng — độ phân giải 1 giây.** `iat` tính theo GIÂY (RFC 7519), nên mốc cũng
theo giây và một token cấp CÙNG GIÂY với lệnh thu hồi sẽ KHÔNG bị thu hồi (cửa sổ bỏ sót ≤ 1s). Đây là
lựa chọn CÓ CHỦ ĐÍCH thay cho so sánh mili-giây, vì hướng kia sẽ từ chối SAI một token vừa cấp hợp lệ
ngay sau lệnh thu hồi (vd logout-all rồi đăng nhập lại trong cùng giây). Xoá hẳn cửa sổ này đòi thêm
claim mili-giây, tức ĐỔI định dạng JWT.

**Giới hạn phạm vi, nêu thẳng (Owner Decision D1-A).** Repo **KHÔNG** có endpoint deactivate/ban
(permission `User.Ban` đã seed từ `SeedRbac` và cấp cho `administrator` nhưng KHÔNG có enforcement
point nào) và **KHÔNG** có luồng đổi/đặt lại mật khẩu — `is_active=false` hiện chỉ đạt được bằng SQL
ngoài luồng ứng dụng. Vì vậy:
- luồng deactivate/ban/đổi mật khẩu **tương lai PHẢI gọi** `AuthRevocationService.revokeAllForUser()`
  — primitive được expose công khai chính cho mục đích đó;
- **vô hiệu hoá bằng SQL ĐƠN THUẦN KHÔNG phát ra tín hiệu thu hồi nào**, nên KHÔNG vô hiệu hoá access
  token ngay: token sống tới hết TTL. Hai e2e khẳng định CẢ HAI mặt này (một chứng minh cơ chế khi có
  gọi primitive, một ghi nhận trung thực hành vi khi không gọi). Đường đăng nhập/`rotate` refresh thì
  vẫn chặn ngay vì cả hai đã kiểm `isActive` từ trước.

**Kiểm chứng:** BE unit 129 suite/1527 test (+2 suite, +31 test); e2e MỚI
`auth-token-revocation.e2e-spec.ts` 13/13 trên Redis + Postgres THẬT (gồm fail-closed bằng cách mô
phỏng sự cố Redis thật tại đúng chỗ guard đọc, và khẳng định TTL của khoá). Chi tiết đầy đủ:
[H-1-ACCESS-TOKEN-REVOCATION-2026-08-06.md](../delivery/reports/H-1-ACCESS-TOKEN-REVOCATION-2026-08-06.md).

**Vẫn còn mở sau milestone này (có chủ đích):** H-3 (không có audit event nào cho auth:
`user.registered`/`auth.login.success`/`auth.logout` — miền mà ADR này viết ra để bao phủ), H-4
(`POST /auth/refresh` chưa có auth-throttle), H-5 (chưa có phát hiện tái dùng refresh token /
thu hồi theo family), và endpoint `User.Ban` vẫn chưa tồn tại.

---

## Tình trạng triển khai — H-3 SỰ KIỆN AUDIT CHO AUTHENTICATION (2026-08-07)

**✅ ĐÃ TRIỂN KHAI.** Đóng finding **H-3** của Production Readiness Review (rà soát toàn repo,
read-only, 2026-08-06 — báo cáo đó KHÔNG được ghi thành file trong repo này): *"Auth currently emits
no audit events, despite ADR-016 explicitly requiring identity/auth events."* Đây CHÍNH là khoảng
trống mà §Context của ADR này (dòng 9) nêu làm ví dụ MỞ ĐẦU — `user.registered`/`auth.login.success`
được liệt kê SONG SONG với `place.status_changed`/`moderation.decided`/`business.claim_approved`
ngay từ ngày ADR-016 được viết (2026-07-13), nhưng miền auth là miền DUY NHẤT trong danh sách đó
CHƯA từng có bất kỳ lời gọi `AuditService.record()` nào cho tới milestone này.

**7 sự kiện, đúng danh sách yêu cầu:** `user.registered`, `auth.login.success`, `auth.login.failure`,
`auth.refresh.success`, `auth.refresh.failure`, `auth.logout`, `auth.logout_all`. Toàn bộ nằm trong
`AuthService` — controller vẫn mỏng, không service nào khác bị đụng tới ngoài `TokenService` (chỉ
thêm typed metadata cho lỗi refresh, KHÔNG tự ghi audit — xem dưới).

**Quy ước post-commit, ÁP DỤNG NHẤT QUÁN:** mọi lời gọi audit đi qua MỘT hàm riêng `emitAudit()` —
bọc try/catch, log lỗi ở mức `error`, KHÔNG BAO GIỜ ném ra ngoài. Cùng đúng khuôn
`ModerationService.emitPostCommit`/`ReviewsService` đã dùng từ trước: một lỗi ghi audit KHÔNG được
phép biến một đăng nhập/đăng ký HỢP LỆ thành lỗi, và KHÔNG được phép biến một 401 THẬT thành 500.
Với nhánh THẤT BẠI (login/refresh), audit được ghi TRƯỚC khi exception GỐC được `throw` LẠI NGUYÊN
VẸN — chưa từng có logic nào thay thế/bọc lại lỗi gốc. Kiểm chứng CẢ hai chiều bằng cách spy trực
tiếp trên `AuditService.record()` (mock reject) — ở cả tầng unit LẪN một e2e SỐNG (spy trên chính
instance `AuditService` thật của app, ép một lần ghi audit thất bại THẬT giữa một request HTTP
thật) — response cho cả đăng nhập thành công lẫn thất bại đều KHÔNG đổi.

**Privacy trên thất bại đăng nhập (rule 2).** "Email không tồn tại" và "sai mật khẩu" tiếp tục trả
về ĐÚNG cùng response bên ngoài (đã đúng từ trước milestone này — cùng `UnauthorizedException` +
cùng message cho cả hai nhánh, KHÔNG đổi). Ở TẦNG AUDIT (chỉ đọc được qua `System.Audit.View`,
KHÔNG phải bề mặt tấn công), `context` ghi `email` đã CHUẨN HOÁ (trim + lowercase — KHÔNG hash, vì
`AuditService` hiện không có biến đổi "privacy-safe identifier" nào khác) và `reason` phân biệt
`user_not_found`/`invalid_password`/`account_inactive`, để điều tra viên phân biệt được các trường
hợp mà response công khai cố tình không phân biệt. `entityId` gắn vào user THẬT khi email khớp một
tài khoản (kể cả sai mật khẩu) — `null` khi email không khớp tài khoản nào; `actorId` LUÔN `null`
cho thất bại đăng nhập (chưa có danh tính nào được xác nhận).

**Refresh: lỗi mang theo ngữ cảnh audit mà KHÔNG đổi mã HTTP.** `TokenService` thêm
`RefreshTokenError` — VẪN LÀ `UnauthorizedException` (subclass, 401 không đổi, `AllExceptionsFilter`
xử lý xuyên suốt không cần biết tới lớp con này) nhưng mang `reason`
(`invalid_token`/`revoked`/`user_inactive`) và `userId` (CHỈ gán ở nhánh đã XÁC THỰC chữ ký JWT
thành công — KHÔNG BAO GIỜ tin một payload chưa verify, và KHÔNG BAO GIỜ dùng cho quyết định phân
quyền nào, chỉ để audit). `IssuedTokens` (đã có từ H-1) thêm trường `userId` thuần bổ sung, để
`AuthService.refresh()` — vốn chỉ cầm một chuỗi refresh token cơ hội, không có object `User` nào —
ghi được `entityId`/`actorId` đúng cho `auth.refresh.success`.

**Logout: `userId` giờ THỰC SỰ được dùng.** `AuthController.logout()` trước đây nhận
`@CurrentUser()` nhưng bỏ qua (route đã xác thực từ trước, giá trị chỉ chưa có người tiêu thụ) — nay
truyền `user.sub` xuống `AuthService.logout()` làm actorId cho audit `auth.logout`, ĐỘC LẬP với
`refresh_token` gửi trong body (có thể hỏng/không khớp — `TokenService.revoke()` vẫn idempotent-
thành-công như trước, và audit vẫn ghi vì HÀNH ĐỘNG logout của principal đã thật sự xảy ra).
`auth.logout_all` (H-1) CHỈ ghi audit SAU KHI cả hai bước thu hồi (refresh + mốc access) thành công
— nếu một bước lỗi, hàm ném lỗi VÀ KHÔNG ghi audit "thành công" nào (sẽ nói dối).

**Rule 1 — không rò rỉ.** KHÔNG context nào trong cả 7 sự kiện chứa password/access token/refresh
token/JWT contents/Redis key nào — kiểm chứng bằng quét chuỗi TOÀN BỘ payload audit (before/after/
context) ở cả unit lẫn e2e, tìm sự HIỆN DIỆN của giá trị mật khẩu/token thật dùng trong chính test
đó (không chỉ dựa vào `AuditService.redact()` sẵn có — chứng minh KHÔNG có gì để redact ngay từ
đầu, vì các trường đó chưa từng được đưa vào `AuditEvent`).

**Kiểm chứng:** BE unit 129 suite/1547 test (+20 test); e2e MỚI `auth-audit.e2e-spec.ts` 11/11 trên
Postgres THẬT qua HTTP thật (register/login/refresh/logout/logout-all + hai test spy audit-thất-bại
SỐNG). `auth.e2e-spec.ts`/`auth-token-revocation.e2e-spec.ts` (H-1) chạy lại KHÔNG hồi quy — chữ ký
`AuthService.logout()` đổi nhưng hành vi bên ngoài giữ nguyên. Chi tiết đầy đủ:
[H-3-AUTHENTICATION-AUDIT-EVENTS-2026-08-07.md](../delivery/reports/H-3-AUTHENTICATION-AUDIT-EVENTS-2026-08-07.md).

**Vẫn còn mở sau milestone này (có chủ đích, KHÔNG bỏ sót):** H-4 (`POST /auth/refresh` chưa có
auth-throttle riêng), H-5 (chưa có phát hiện tái dùng refresh token/thu hồi theo family), endpoint
`User.Ban`/đổi-đặt-lại-mật-khẩu vẫn chưa tồn tại (nên `auth.login.failure` với `reason=account_
inactive` chỉ đạt được qua SQL ngoài luồng, cùng giới hạn đã ghi ở mục H-1 phía trên), và
`ip`/`user_agent` của `AuditEvent` VẪN chưa được điền ở BẤT KỲ service nào trong repo (không riêng
Auth) — giữ nguyên trạng thái pre-existing, không phải phạm vi milestone này.
