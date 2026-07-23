# PhuQuocHub — Quy trình nghiệp vụ (Workflows)

> **Mục đích:** đặc tả toàn bộ luồng nghiệp vụ của nền tảng. File này chứa **index tổng** + nhóm **Tài khoản & Hệ thống**. Hai nhóm còn lại tách sang [contribution.md](./contribution.md) (đóng góp dữ liệu) và [moderation.md](./moderation.md) (kiểm duyệt & an toàn). Tài liệu **chỉ thiết kế** — không code.

## 1. Khuôn đặc tả (mỗi workflow gồm 9 mục)

| Mục | Ý nghĩa |
|---|---|
| **Trigger** | Điều gì khởi động luồng |
| **Input** | Dữ liệu đầu vào |
| **Validation** | Ràng buộc kiểm tra trước khi xử lý |
| **Permission** | Quyền yêu cầu (theo [rbac.md](../security/rbac.md)) |
| **Business Rule** | Quy tắc nghiệp vụ cốt lõi |
| **Database Update** | Thực thể/bảng bị thay đổi |
| **Notification** | Thông báo phát ra |
| **Audit Log** | Sự kiện ghi vết |
| **Rollback** | Cách hoàn tác / xử lý thất bại |

## 2. Index tổng — 20 workflow

| # | Workflow | Nhóm | Tài liệu |
|---|---|---|---|
| WF-01 | Đăng ký | Tài khoản | workflow.md |
| WF-02 | Đăng nhập | Tài khoản | workflow.md |
| WF-03 | Xác minh Email | Tài khoản | workflow.md |
| WF-04 | Quên mật khẩu | Tài khoản | workflow.md |
| WF-05 | Chủ DN nhận quyền quản lý địa điểm (Claim) | Đóng góp | [contribution.md](./contribution.md) |
| WF-06 | Đề xuất sửa thông tin Place | Đóng góp | [contribution.md](./contribution.md) |
| WF-07 | Moderator kiểm duyệt | Kiểm duyệt | [moderation.md](./moderation.md) |
| WF-08 | AI tạo nội dung | Đóng góp | [contribution.md](./contribution.md) |
| WF-09 | AI chờ Moderator duyệt | Kiểm duyệt | [moderation.md](./moderation.md) |
| WF-10 | Báo sai thông tin | Đóng góp | [contribution.md](./contribution.md) |
| WF-11 | Tạo Review | Kiểm duyệt | [moderation.md](./moderation.md) |
| WF-12 | Review bị Report | Kiểm duyệt | [moderation.md](./moderation.md) |
| WF-13 | Moderator xử lý Report | Kiểm duyệt | [moderation.md](./moderation.md) |
| WF-14 | Place chuyển trạng thái | Hệ thống | workflow.md |
| WF-15 | Địa điểm đóng cửa | Đóng góp | [contribution.md](./contribution.md) |
| WF-16 | Giá thay đổi | Đóng góp | [contribution.md](./contribution.md) |
| WF-17 | Upload ảnh | Đóng góp | [contribution.md](./contribution.md) |
| WF-18 | AI kiểm tra ảnh | Kiểm duyệt | [moderation.md](./moderation.md) |
| WF-19 | AI gợi ý Place | Đóng góp | [contribution.md](./contribution.md) |
| WF-20 | Thông báo tới người dùng | Hệ thống | workflow.md |

## 3. Nguyên tắc chung cho mọi workflow

- **Deny by default + kiểm tra permission** ở đầu mỗi luồng ghi dữ liệu ([security.md](../architecture/security.md)).
- **Ghi vết (audit)** mọi hành động đặc quyền/đổi trạng thái.
- **Provenance:** mọi thay đổi dữ liệu Place gắn `source` ([source.md](../data/modules/source.md)).
- **Idempotent** cho các job nền (AI, resize, notification) để chống chạy trùng.
- **Human-in-the-loop:** đầu ra AI luôn `pending` tới khi người duyệt.

---

## WF-01 — Đăng ký (Register)

- **Trigger:** khách gửi form đăng ký (email/mật khẩu) hoặc chọn đăng nhập Google (OAuth).
- **Input:** email, mật khẩu (local) hoặc hồ sơ OAuth; `display_name`; đồng ý điều khoản.
- **Validation:** email đúng định dạng & **chưa tồn tại**; mật khẩu đủ mạnh; chống bot (rate limit/captcha); provider hợp lệ.
- **Permission:** public (Guest).
- **Business Rule:** tạo user role mặc định **Member**; `is_active=false` cho tới khi xác minh email (local); OAuth coi email đã xác minh.
- **Database Update:** insert `users` (provider, `password_hash` null nếu OAuth, `is_active=false`); gán vai trò mặc định qua `user_roles` (role `member` — [RBAC](../security/rbac.md)); tạo token xác minh email (local).
- **Notification:** gửi email xác minh (→ WF-03); email chào mừng sau khi kích hoạt.
- **Audit Log:** `user.registered` (provider, ip, thời điểm).
- **Rollback:** giao dịch lỗi/gửi mail lỗi → rollback insert; tài khoản chưa xác minh bị dọn sau X ngày (job).

## WF-02 — Đăng nhập (Login)

- **Trigger:** gửi thông tin đăng nhập hoặc quay lại từ OAuth.
- **Input:** email + mật khẩu, hoặc mã OAuth.
- **Validation:** user tồn tại & `is_active`; mật khẩu khớp hash; email đã xác minh; **chưa bị ban**; rate limit số lần sai.
- **Permission:** public.
- **Business Rule:** cấp **access JWT ngắn hạn** + **refresh token** (Redis); khóa tạm sau N lần sai; principal + role tối thiểu trong token (xem [auth.md](../security/auth.md)).
- **Database Update:** ghi `last_login_at`; lưu refresh/session ở Redis (không đổi dữ liệu lõi).
- **Notification:** (tùy chọn) cảnh báo đăng nhập từ thiết bị lạ.
- **Audit Log:** `auth.login.success` / `auth.login.failed` (ip, device).
- **Rollback:** thất bại → không tạo session; lỗi cấp refresh → thu hồi ngay.

## WF-03 — Xác minh Email

- **Trigger:** người dùng bấm link xác minh trong email (hoặc yêu cầu gửi lại).
- **Input:** token xác minh (từ link).
- **Validation:** token tồn tại, đúng user, **chưa dùng**, **chưa hết hạn**.
- **Permission:** public (token là bằng chứng).
- **Business Rule:** đặt `email_verified=true`, `is_active=true`; token dùng một lần; giới hạn số lần gửi lại.
- **Database Update:** `users.email_verified_at`, `is_active=true`; đánh dấu token đã dùng.
- **Notification:** email chào mừng / thông báo tài khoản đã kích hoạt.
- **Audit Log:** `user.email_verified`.
- **Rollback:** token sai/hết hạn → không đổi trạng thái; cho phát hành token mới.

## WF-04 — Quên mật khẩu (Reset Password)

- **Trigger:** người dùng yêu cầu đặt lại (nhập email) → sau đó gửi mật khẩu mới kèm token.
- **Input:** email (bước 1); reset token + mật khẩu mới (bước 2).
- **Validation:** phản hồi **mơ hồ** để không lộ email tồn tại hay không; token hợp lệ/chưa hết hạn/chưa dùng; mật khẩu mới đủ mạnh.
- **Permission:** public (self-service qua token).
- **Business Rule:** token **một lần**, hạn ngắn (vd 30′); đổi mật khẩu → **thu hồi mọi session/refresh** hiện có; rate limit yêu cầu.
- **Database Update:** cập nhật `users.password_hash`; xóa reset token; revoke session (Redis).
- **Notification:** email xác nhận đã đổi mật khẩu + cảnh báo "nếu không phải bạn".
- **Audit Log:** `user.password_reset_requested` / `...completed`.
- **Rollback:** token sai/hết hạn → giữ mật khẩu cũ; yêu cầu token mới.

## WF-14 — Place chuyển trạng thái (State Transition)

- **Trigger:** tạo/sửa (→ `pending`), moderator duyệt (→ `published`), báo đóng cửa/vi phạm (→ `archived`), hoặc khôi phục.
- **Input:** `place_id`, trạng thái đích, actor, lý do.
- **Validation:** chuyển trạng thái **hợp lệ** theo máy trạng thái (`draft → pending → published → archived`); actor đủ quyền; điều kiện công khai (vd cần ≥1 nguồn).
- **Permission:** `Place.Approve/Publish/Archive/Restore` (Moderator+); Contributor chỉ đưa về `pending`.
- **Business Rule:** mỗi lần đổi nội dung tạo một `wiki_revision` (thực thể phiên bản **duy nhất** — [WikiRevision, source.md §6](../data/modules/source.md); [ADR-014](../99-decisions/ADR-014-revision-model.md); `place_revisions` đã retire); `published` là trạng thái hiển thị công khai; `archived` giữ lịch sử nhưng ẩn khỏi tìm kiếm mặc định.
- **Database Update:** `places.status`, `updated_by`; insert `wiki_revisions` (`entity_type='place'`); làm mới cache & chỉ mục tìm kiếm.
- **Notification:** người đóng góp và chủ cơ sở (nếu đã claim) khi published/archived.
- **Audit Log:** `place.status_changed` (from→to, actor, reason).
- **Rollback:** revert về trạng thái trước qua revision; `archived` có thể `Restore` → `published`.

## WF-20 — Thông báo tới người dùng (Notification Dispatch)

- **Trigger:** sự kiện hệ thống (đóng góp được duyệt, review bị xử lý, claim approved, nội dung AI sẵn sàng, có reply…).
- **Input:** loại sự kiện, người nhận, payload/ngữ cảnh, kênh.
- **Validation:** người nhận hợp lệ & còn active; đã opt-in kênh đó; **dedupe** chống trùng/spam.
- **Permission:** hệ thống phát tự động; `Notification.Send/Broadcast` cho admin gửi thủ công.
- **Business Rule:** fan-out theo preference (in-app, email, **push mobile** khi có app); gộp batch với sự kiện tần suất cao; tôn trọng cài đặt tắt.
- **Database Update:** insert `notifications` (recipient, type, payload, `read=false`); (mobile) enqueue push.
- **Notification:** chính nó là cơ chế phát.
- **Audit Log:** `notification.sent` (type, kênh) — mức tối thiểu, tránh log dữ liệu nhạy cảm.
- **Rollback:** gửi lỗi → retry qua hàng đợi; **email đã gửi không thu hồi được** (nêu rõ); in-app có thể ẩn/xóa.

---

*Tài liệu liên quan: [contribution.md](./contribution.md), [moderation.md](./moderation.md), [rbac.md](../security/rbac.md), [auth.md](../security/auth.md), [security.md](../architecture/security.md), [source.md](../data/modules/source.md), [verification.md](../data/modules/verification.md)*
