# PhuQuocHub — Phân quyền theo vai trò (RBAC)

> **Mục đích:** thiết kế hệ thống kiểm soát truy cập theo vai trò (RBAC) đủ **chặt**, **linh hoạt** và **mở rộng được trong 10 năm** (Jobs, Real Estate, Marketplace, AI, Mobile App). Tài liệu **chỉ thiết kế** — không code, không SQL. Cơ chế thực thi kỹ thuật đặt ở [architecture/security.md](../architecture/security.md).

## 1. Mô hình khái niệm

Năm khối, tách bạch rõ ràng:

| Khối | Ý nghĩa |
|---|---|
| **User (Principal)** | Chủ thể: người dùng hoặc **AI Agent** (service principal). |
| **Role** | Gói (bundle) các Permission, có thể **kế thừa** role khác. |
| **Permission** | Một khả năng nguyên tử dạng `Module.Action[.Scope]` (vd `Place.Edit.Any`). |
| **Scope** | Ngữ cảnh áp dụng của permission: `Own` (của mình), `Managed` (cơ sở được giao), `Any` (toàn hệ thống). |
| **Policy (PDP)** | Bộ đánh giá: *"principal này, với permission X, trên tài nguyên Y, trong scope Z → cho phép?"* |

Nguyên tắc nền tảng: **code chỉ kiểm tra Permission, không bao giờ kiểm tra tên Role**. Role chỉ là cách *gom* permission cho con người quản lý.

## 2. Nguyên tắc phân quyền

1. **Không hardcode.** Không `if (role === 'admin')`. Mọi ánh xạ Role→Permission và Role→Role (kế thừa) là **dữ liệu/cấu hình**, sửa được không cần deploy.
2. **RBAC + Permission (kiểm tra ở mức permission).** Guard/endpoint yêu cầu một *permission cụ thể*; ai có permission đó (qua bất kỳ role nào) thì được.
3. **Deny by default.** Không có permission phù hợp → từ chối. Không có "mặc định cho phép".
4. **Least privilege.** Mỗi role chỉ nhận tối thiểu quyền cần thiết; quyền cao (Admin, Super Admin, AI) càng hẹp càng tốt.
5. **Scope-aware (ABAC-lite).** Ngoài "có permission", còn kiểm tra **điều kiện ngữ cảnh**: quyền sở hữu (owner), thành viên cơ sở (business), trạng thái tài nguyên.
6. **Kế thừa (hierarchy).** Role cấp cao kế thừa quyền role cấp thấp → không lặp lại khai báo.
7. **Tách AuthN khỏi AuthZ.** Xác thực *"anh là ai"* ở [auth.md](./auth.md); phân quyền *"anh được làm gì"* ở tài liệu này.
8. **Mở rộng bằng khai báo.** Thêm module mới = đăng ký namespace + action + gán vào role, **không sửa lõi**.
9. **Kiểm toán (audit).** Mọi hành động đặc quyền được ghi vết (ai, làm gì, khi nào, trên tài nguyên nào).
10. **Con người kiểm soát AI.** AI Agent không có quyền quyết định cuối; đầu ra luôn chờ duyệt.

## 3. Mô hình Permission theo module

### 3.1 Quy ước đặt tên

```
<Module>.<Action>[.<Scope>]

Module : danh từ vùng nghiệp vụ  (Place, Review, Business, User, AI, Job, Marketplace…)
Action : động từ chuẩn hóa       (View, Create, Edit, Delete, Approve, Verify…)
Scope  : Own | Managed | Any     (bỏ trống = mức tài nguyên chung)
```

- **Wildcard theo module:** `Place.*` = mọi quyền trong module Place.
- **Wildcard toàn cục:** `*` = mọi quyền (chỉ Super Administrator).
- Ví dụ: `Place.Edit.Own`, `Review.Delete.Any`, `Business.Verify`, `AI.GenerateSummary`, `User.Ban`.

### 3.2 Tập Action chuẩn (dùng lại cho mọi module)

`View, Create, Edit, Delete, Restore, Approve, Reject, Publish, Archive, Verify, Claim, Reply, Vote, Merge, Assign, Ban, Warn, Configure, Export, Generate, Moderate, Manage`.

Dùng chung một bộ động từ giúp module mới (Jobs, Marketplace…) **kế thừa ngay ngữ nghĩa** mà không phát minh lại.

### 3.3 Danh mục module hiện tại

**Nhóm Địa điểm & Nội dung**
| Permission | Ý nghĩa |
|---|---|
| `Place.View` | Xem địa điểm công khai |
| `Place.Create` | Tạo địa điểm (thường tạo revision chờ duyệt) |
| `Place.Edit.Own` / `.Managed` / `.Any` | Sửa địa điểm mình tạo / cơ sở được giao / bất kỳ |
| `Place.Approve` / `Place.Publish` / `Place.Archive` | Duyệt / công khai / lưu trữ |
| `Place.Merge` | Gộp địa điểm trùng |
| `Category.View` / `Category.Manage` | Xem / quản trị danh mục |
| `Contact.Edit.Managed` / `.Any` | Sửa thông tin liên hệ |
| `Price.Edit.Managed` / `.Any` | Sửa giá / bảng giá |
| `Media.Upload.Own` / `.Managed` | Tải ảnh/video |
| `Media.Delete.Own` / `.Any` · `Media.Moderate` | Xóa / kiểm duyệt media |
| `FAQ.Create` / `FAQ.Approve` | Tạo / duyệt FAQ |
| `Event.View` | Xem sự kiện (peer entity — ADR-002) |
| `Event.Create` | Tạo sự kiện (đề xuất, chờ duyệt) |
| `Event.Edit.Own` / `.Any` | Sửa sự kiện mình tạo / bất kỳ |
| `Event.Approve` / `Event.Archive` | Duyệt-công khai / lưu trữ sự kiện |

**Nhóm Nguồn & Phiên bản (Trust)**
| Permission | Ý nghĩa |
|---|---|
| `Source.View` / `Source.Attach` / `Source.Edit` | Xem / gắn / sửa nguồn |
| `Verification.Vote` | Bỏ phiếu xác minh cộng đồng |
| `Verification.Verify` / `Verification.Reject` | Đặt trạng thái verified/official / bác |
| `Revision.Create` / `Revision.Approve` / `Revision.Revert` | Tạo / duyệt / khôi phục phiên bản (WikiRevision) |

**Nhóm Cộng đồng**
| Permission | Ý nghĩa |
|---|---|
| `Review.Create` · `Review.Edit.Own` · `Review.Delete.Own` | Review của mình |
| `Review.Delete.Any` · `Review.Hide` | Kiểm duyệt review |
| `Review.Reply.Managed` | Chủ cơ sở phản hồi review |
| `Comment.Create` · `Comment.Delete.Own` / `.Any` | Bình luận |
| `Post.Create` · `Post.Edit.Own` · `Post.Publish` | Bài viết cộng đồng |
| `Vote.Cast` | Upvote/downvote |
| `Report.Create` · `Report.Resolve` | Báo cáo / xử lý báo cáo |

**Nhóm Doanh nghiệp**
| Permission | Ý nghĩa |
|---|---|
| `Business.Claim` | Yêu cầu nhận quyền quản lý cơ sở |
| `Business.Verify` | Xác minh claim (moderator) |
| `Business.Edit.Managed` | Sửa hồ sơ cơ sở được giao |
| `Business.Manager.Assign` / `.Revoke` | Thêm/bớt Business Manager |
| `Business.Transfer` | Chuyển nhượng quyền sở hữu |

**Nhóm Quản trị & Người dùng**
| Permission | Ý nghĩa |
|---|---|
| `User.View` · `User.Edit.Own` | Hồ sơ |
| `User.Warn` · `User.Mute` · `User.Ban` | Chế tài |
| `User.Impersonate` | Đăng nhập thay (audited) |
| `Role.Assign` | Gán role có sẵn cho user |
| `Role.Create` · `Role.Edit` · `Role.Delete` | Định nghĩa role (custom role) |
| `Permission.Manage` | Định nghĩa/điều chỉnh permission schema |
| `System.Settings.Edit` · `System.FeatureFlag.Manage` · `System.Audit.View` | Cấu hình hệ thống |
| `Analytics.View.Managed` / `.Any` · `Analytics.Export` | Số liệu |
| `Notification.Send` · `Notification.Broadcast` | Thông báo |
| `Developer.ApiKey.Manage` · `Developer.App.Manage` | Public API cho bên thứ ba |

**Nhóm AI**
| Permission | Ý nghĩa |
|---|---|
| `AI.GenerateSummary` · `AI.GenerateFAQ` · `AI.Translate` | Sinh nội dung nháp |
| `AI.SuggestCategory` · `AI.DetectSpam` · `AI.Assist` | Hỗ trợ phân loại/kiểm duyệt |
| `AI.Model.Configure` · `AI.Agent.Manage` | Cấu hình model / quản lý AI principal |

**Nhóm Tìm kiếm & Bản đồ**
`Search.Query`, `Search.Reindex`, `Map.View`.

### 3.4 Namespace **dự trữ** cho 10 năm tới

Thiết kế sẵn để mở module mới chỉ bằng khai báo, không đụng lõi:

| Lĩnh vực tương lai | Namespace mẫu |
|---|---|
| **Jobs** | `Job.Post.Create/Edit/Publish/Approve`, `Job.Application.Create/View/Manage` |
| **Real Estate** | `RealEstate.Listing.Create/Edit/Publish/Verify`, `RealEstate.Inquiry.*` |
| **Marketplace** | `Marketplace.Product.*`, `Marketplace.Order.Create/Manage/Refund`, `Marketplace.Shipment.*` |
| **Payments** (xuyên suốt) | `Payment.View/Process/Refund/Payout` |
| **AI mở rộng** | `AI.Recommend`, `AI.Chat`, `AI.Moderate.Auto` |
| **Mobile App** | `Mobile.Device.Register`, `Mobile.Push.Send`, `Mobile.PushCampaign.Manage`, `Mobile.Feature.*` |
| **Booking** (ngoài phạm vi hiện tại) | `Booking.Reserve/Cancel/Manage` |

Vì đã có **quy ước tên + action chuẩn + scope + wildcard**, mọi module trên chỉ là *dữ liệu mới*, gán vào role phù hợp — không thay đổi cơ chế.

## 4. Các vai trò mặc định

> Mỗi vai trò mô tả theo 5 mục: **Mục đích · Quyền · Giới hạn · Dữ liệu được sửa · Dữ liệu chờ duyệt.**

### 4.1 Guest
- **Mục đích:** khách chưa đăng nhập, tiêu thụ nội dung công khai.
- **Quyền:** `Place.View`, `Review.View` (đọc), `Post` (đọc), `Search.Query`, `Map.View`.
- **Giới hạn:** không tạo/sửa/xóa; không thấy nội dung `pending`; bị rate-limit chặt.
- **Dữ liệu được sửa:** không.
- **Dữ liệu chờ duyệt:** không áp dụng (không đóng góp).

### 4.2 Member
- **Mục đích:** người dùng đã đăng ký, tham gia cơ bản.
- **Quyền:** kế thừa Guest + `Review.Create`, `Review.Edit.Own`, `Review.Delete.Own`, `Comment.Create`, `Post.Create`, `Media.Upload.Own`, `Vote.Cast`, `Report.Create`, `Place.Create` (đề xuất), `Business.Claim`, `User.Edit.Own`.
- **Giới hạn:** chỉ tác động nội dung của chính mình; đề xuất địa điểm phải qua kiểm duyệt; không xác minh, không kiểm duyệt người khác.
- **Dữ liệu được sửa:** review/comment/bài viết/hồ sơ **của mình**.
- **Dữ liệu chờ duyệt:** đề xuất tạo/sửa Place (Contribution), media đính kèm, đôi khi review đầu tiên (anti-spam).

### 4.3 Local Guide
- **Mục đích:** thành viên bản địa uy tín (karma cao); trọng tâm là **độ tin cậy cộng đồng**.
- **Quyền:** kế thừa Member + `Verification.Vote` (trọng số cao), review/đóng góp **không phải chờ duyệt** cơ bản, `Media.Upload.Own` auto-publish, `Source.Attach` (nguồn cộng đồng).
- **Giới hạn:** không duyệt đóng góp của người khác; không quyền kiểm duyệt/hành chính; thay đổi nhạy cảm vẫn tạo revision chờ.
- **Dữ liệu được sửa:** nội dung của mình + đóng góp được tin cậy nhanh hơn.
- **Dữ liệu chờ duyệt:** thay đổi nhạy cảm (tên, tọa độ, gộp) vẫn cần Moderator.

### 4.4 Contributor
- **Mục đích:** biên tập viên dữ liệu địa điểm — trọng tâm là **độ rộng chỉnh sửa**.
- **Quyền:** kế thừa Member + `Place.Edit.Any` (qua revision), `Revision.Create`, `FAQ.Create`, `Source.Attach`, `Media.Upload` auto-publish, `Category.View`.
- **Giới hạn:** không tự duyệt revision cho thay đổi nhạy cảm; không `Approve`/`Verify`; không quản trị người dùng.
- **Dữ liệu được sửa:** phần lớn trường nội dung Place (mô tả, giờ, liên hệ, ảnh, FAQ) **thông qua WikiRevision**.
- **Dữ liệu chờ duyệt:** đổi tên/tọa độ/danh mục, gộp/xóa, và các thay đổi vượt ngưỡng tin cậy.

### 4.5 Business Owner
- **Mục đích:** chủ sở hữu hợp pháp của cơ sở, quản lý trang đã **claim & verified**.
- **Quyền:** kế thừa Member + trong **scope Managed**: `Business.Edit.Managed`, `Place.Edit.Managed`, `Contact.Edit.Managed`, `Price.Edit.Managed`, `Media.Upload.Managed`, `Review.Reply.Managed`, `Business.Manager.Assign/Revoke`, `Analytics.View.Managed`, `Business.Transfer`.
- **Giới hạn:** chỉ trong cơ sở đã claim; **không** tự đặt trạng thái `Official` (cần Verification/Moderator); **không** xóa review (chỉ reply/report); không tác động cơ sở khác.
- **Dữ liệu được sửa:** toàn bộ thông tin cơ sở của mình (gắn nguồn `business_owner`).
- **Dữ liệu chờ duyệt:** claim ban đầu (xác minh); trường nhạy cảm & xác minh `Official`; ảnh có thể qua kiểm duyệt nhẹ.

### 4.6 Business Manager
- **Mục đích:** nhân sự được Business Owner **ủy quyền** vận hành trang (không phải chủ sở hữu).
- **Quyền:** tập con của Owner trong scope Managed: `Place.Edit.Managed`, `Contact.Edit.Managed`, `Price.Edit.Managed`, `Media.Upload.Managed`, `Review.Reply.Managed`, `Analytics.View.Managed`.
- **Giới hạn:** **không** `Business.Claim/Transfer`, **không** thêm/bớt manager, **không** xóa cơ sở; do Owner cấp & thu hồi bất kỳ lúc nào.
- **Dữ liệu được sửa:** nội dung vận hành của cơ sở được giao.
- **Dữ liệu chờ duyệt:** như Business Owner cho trường nhạy cảm; không có quyền `Official`.

### 4.7 Moderator
- **Mục đích:** bảo vệ chất lượng & an toàn nội dung cộng đồng.
- **Quyền:** kế thừa Contributor + Local Guide + `Place.Approve/Publish/Archive/Merge`, `Revision.Approve/Revert`, `Contribution` duyệt/từ chối, `Review.Delete.Any/Hide`, `Comment.Delete.Any`, `Media.Moderate`, `Verification.Verify/Reject`, `Business.Verify`, `Report.Resolve`, `User.Warn/Mute`.
- **Giới hạn:** không `User.Ban` vĩnh viễn cấp cao, không quản trị Role/Permission, không cấu hình hệ thống/hạ tầng; mọi hành động bị audit.
- **Dữ liệu được sửa:** mọi nội dung địa điểm/cộng đồng ở vai trò kiểm duyệt; trạng thái xác minh/phiên bản.
- **Dữ liệu chờ duyệt:** không (là người duyệt); hành động vượt quyền → cần Administrator.

### 4.8 Administrator
- **Mục đích:** quản trị vận hành nền tảng.
- **Quyền:** kế thừa Moderator + `User.Ban/Manage`, `Role.Assign`, `Category.Manage`, `Notification.Broadcast`, `Analytics.View.Any/Export`, `Developer.ApiKey/App.Manage`, `AI.Model.Configure`, `System.Settings.Edit`, `System.FeatureFlag.Manage`, `System.Audit.View`.
- **Giới hạn:** **không** sửa vai trò Super Administrator; **không** `Role.Create/Permission.Manage` (đổi lược đồ RBAC); không truy cập secret hạ tầng cấp cao; thao tác tối nhạy cần Super Admin (4-eyes).
- **Dữ liệu được sửa:** người dùng, gán role, danh mục, cấu hình ứng dụng, cờ tính năng.
- **Dữ liệu chờ duyệt:** đổi cấu trúc RBAC, xóa dữ liệu hàng loạt → Super Administrator.

### 4.9 Super Administrator
- **Mục đích:** quyền tối cao, quản trị chính **hệ thống RBAC** và cấu hình cốt lõi.
- **Quyền:** `*` (toàn bộ) + `Role.Create/Edit/Delete`, `Permission.Manage`, `AI.Agent.Manage`, `User.Impersonate`, định nghĩa module mới.
- **Giới hạn:** số lượng tối thiểu; **không dùng cho tác vụ hằng ngày**; mọi hành động audit; khuyến nghị co-approval (4-eyes) cho thao tác phá hủy.
- **Dữ liệu được sửa:** tất cả.
- **Dữ liệu chờ duyệt:** không — nhưng chịu audit và quy trình phê duyệt nội bộ.

### 4.10 AI Agent
- **Mục đích:** **service principal (phi con người)** thực hiện tác vụ tự động: sinh tóm tắt, FAQ, dịch, gợi ý phân loại, phát hiện spam.
- **Quyền:** hẹp theo tác vụ — `AI.GenerateSummary`, `AI.GenerateFAQ`, `AI.Translate`, `AI.SuggestCategory`, `AI.DetectSpam`, `Source.Attach` (as `ai`), `Revision.Create` (origin=`ai_generation`, status=`pending`), quyền **đọc** dữ liệu cần thiết.
- **Giới hạn:** **KHÔNG BAO GIỜ** `Publish/Approve/Verify/Delete`; không quản trị người dùng; không ghi trực tiếp lên trường `Official`; token có phạm vi hẹp, rate-limited, audited; **không kế thừa** vai trò con người.
- **Dữ liệu được sửa:** chỉ **bản nháp/đề xuất** (AI summary, FAQ đề xuất, revision `pending`, nguồn `ai`).
- **Dữ liệu chờ duyệt:** **toàn bộ** đầu ra AI đều chờ người duyệt trước khi công khai (human-in-the-loop).

## 5. Phân cấp vai trò (Role Hierarchy)

Kế thừa dạng **DAG** (một role có thể kế thừa nhiều role); AI Agent nằm **ngoài** nhánh con người.

```
Guest
 └─ Member
     ├─ Local Guide ─────────────┐
     ├─ Contributor ─────────────┤
     │                            ▼
     │                         Moderator ─ Administrator ─ Super Administrator
     └─ Business Manager
          └─ Business Owner

AI Agent  (nhánh Service riêng — KHÔNG kế thừa vai trò người dùng)
```

| Vai trò | Kế thừa từ | Bổ sung chính |
|---|---|---|
| Guest | — | đọc công khai |
| Member | Guest | tạo review/bài/media của mình, claim |
| Local Guide | Member | vote xác minh, đóng góp tin cậy nhanh |
| Contributor | Member | biên tập Place qua revision |
| Business Manager | Member | vận hành cơ sở được giao (scope Managed) |
| Business Owner | Business Manager | claim/transfer, gán manager, analytics cơ sở |
| Moderator | Contributor **+** Local Guide | duyệt, xác minh, kiểm duyệt |
| Administrator | Moderator | quản trị user/role-assign/hệ thống |
| Super Administrator | Administrator | quản trị RBAC schema, module mới (`*`) |
| AI Agent | *(Service base)* | chỉ các quyền `AI.*` + tạo nháp `pending` |

**Lưu ý scope trong kế thừa:** Business Owner kế thừa Business Manager nhưng quyền chỉ hiệu lực **trong cơ sở mình sở hữu** (scope `Managed` gắn theo quan hệ, không phải toàn hệ thống).

## 5.1 Ánh xạ sang mô hình dữ liệu (bảng RBAC)

Toàn bộ mô hình khái niệm ở trên được **hiện thực bằng dữ liệu** (không ENUM, không hardcode) qua các bảng ([database.md §3.9–3.13](../data/database.md)):

| Khái niệm (tài liệu này) | Bảng dữ liệu |
|---|---|
| Role | `roles` (`code` = `guest, member, local_guide, …, ai_agent`) |
| Permission (`Module.Action[.Scope]`) | `permissions` |
| Role → Permission (N–N, + explicit deny) | `role_permissions` (`effect = allow/deny`) |
| Kế thừa Role → Role (DAG — §5) | `role_parents` |
| Principal → Role (kèm scope Own/Managed/Any) | `user_roles` (`scope_type`, `business_id` **→ places**) |
| Principal | `users` (người) · `users.is_service_account=true` (AI Agent) |

- **`users.role` ENUM cũ đã bị loại bỏ** ([database.md §3.1](../data/database.md)) — vai trò gán qua `user_roles`; một principal giữ **nhiều** vai trò.
- **Business Owner/Manager (scope Managed):** `user_roles.business_id → places` (Place đã claim). **Sổ sở hữu nghiệp vụ** ở `business_members` (owner/manager) — đồng bộ khi cấp/thu hồi; mô hình Place-centric [ADR-015](../99-decisions/ADR-015-business-ownership-model.md). `Business.Manager.Assign/Revoke`, `Business.Transfer` là hành động Owner (audited).
- Cưỡng chế & suy ra quyền hiệu lực: [security.md §3–§6](../architecture/security.md). Quyết định kiến trúc: [ADR-007](../99-decisions/ADR-007-rbac-model.md) (**Accepted**).

## 6. Ma trận năng lực (tóm tắt)

| Hành động tiêu biểu | Guest | Member | Local Guide | Contributor | Biz Mgr | Biz Owner | Mod | Admin | Super | AI |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `Place.View` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `Review.Create` | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| `Place.Edit` | ✗ | Own | +tin cậy | Any* | Managed | Managed | Any | Any | ✓ | draft |
| `Place.Approve` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ |
| `Verification.Verify` | ✗ | ✗ | vote | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ |
| `Business.Verify` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ |
| `User.Ban` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ |
| `Role.Assign` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ |
| `Permission.Manage` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| `AI.GenerateSummary` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |

*`Any*` = có quyền nhưng thay đổi đi qua WikiRevision, thay đổi nhạy cảm vẫn chờ duyệt.

## 7. Custom roles & ủy quyền (mở rộng)

- **Role tùy biến:** Super Admin (qua `Role.Create`) tạo role mới bằng cách **ghép permission** — không cần code. Ví dụ tương lai: `JobRecruiter` = `Job.Post.*` + `Job.Application.View`.
- **Ủy quyền theo scope:** quan hệ Owner→Manager là mẫu ủy quyền *scoped*; tái dùng cho Marketplace (Shop Owner→Staff), Real Estate (Agency→Agent).
- **Feature flag theo module:** bật/tắt cả nhóm permission khi ra mắt module mới (Jobs, Marketplace…) mà không đụng role hiện có.

## 8. Ghi chú — nội dung bổ sung sau

- [ ] Ma trận Role×Permission đầy đủ (mọi permission, không chỉ tiêu biểu).
- [ ] Chính sách ngưỡng karma để tự động nâng Member → Local Guide/Contributor.
- [ ] Quy tắc scope chi tiết cho từng module tương lai (Marketplace, Real Estate).
- [ ] Chính sách 4-eyes cho hành động phá hủy của Admin/Super Admin.
- [ ] Vòng đời & thu hồi token AI Agent.

---

*Tài liệu liên quan: [architecture/security.md](../architecture/security.md), [auth.md](./auth.md), [workflow.md](../workflow/workflow.md), [api.md](../api/api.md), [vision.md](../overview/vision.md)*
