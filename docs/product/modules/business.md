# Module 7 — Business (Doanh nghiệp)

> **Product Spec** — Business là lớp cho phép **chủ cơ sở nhận quyền quản lý (claim)** một địa điểm, xác minh, và **quản lý trang chính thức**: cập nhật thông tin, phản hồi đánh giá, xem số liệu, ủy quyền nhân sự. Là cơ chế biến một [Place](place.md) cộng đồng thành **cơ sở được xác minh (Official)**.

---

## 1. Mục tiêu

- Cho doanh nghiệp/hộ kinh doanh Phú Quốc **hiện diện minh bạch, được xác minh** mà không phụ thuộc quảng cáo trả phí ([vision.md §4.3](../../overview/vision.md)).
- Trao **quyền quản lý có kiểm soát** (scope `Managed`) để chủ cơ sở tự cập nhật thông tin chính thức (giờ, giá, menu, phòng, ảnh).
- Cung cấp **kênh phản hồi đánh giá** và **số liệu cơ bản** (view/unique/rating) để chủ cơ sở hiểu khách.
- Bảo vệ tính công bằng & tin cậy: chống mạo danh, chống chủ cơ sở tự thao túng đánh giá.

## 2. Người sử dụng

| Vai trò | Cách dùng |
|---|---|
| **Business Owner** | Claim cơ sở, quản lý toàn quyền trong scope Managed, gán/bớt Manager, chuyển nhượng, xem analytics. |
| **Business Manager** | Nhân sự được ủy quyền vận hành trang (không phải chủ) — sửa thông tin/ảnh/giá, trả lời review; **không** quản lý manager/claim/transfer. |
| **Moderator** | Xác minh claim (`Business.Verify`), xử lý tranh chấp. |
| **Administrator** | Quản trị cấp cao, xử lý tranh chấp phức tạp, chuyển nhượng đặc biệt. |
| **Member (chủ tiềm năng)** | Gửi yêu cầu claim kèm bằng chứng. |

## 3. Tính năng chính

1. **Claim (nhận quyền quản lý)** — gửi yêu cầu + bằng chứng sở hữu → xác minh → gán quyền Managed.
2. **Xác minh (verification)** — Moderator duyệt claim; đặt cơ sở thành `Official`.
3. **Dashboard chủ cơ sở** — tổng quan số liệu (view/unique/rating), review cần phản hồi, ảnh chờ duyệt.
4. **Quản lý thông tin cơ sở** — sửa giờ/liên hệ/giá/menu/phòng (theo loại) trong scope Managed.
5. **Phản hồi đánh giá** — trả lời review công khai (`Review.Reply.Managed`); không xóa review.
6. **Quản lý nhân sự (Manager)** — Owner thêm/thu hồi Business Manager.
7. **Chuyển nhượng (transfer)** — chuyển quyền sở hữu cơ sở sang chủ mới.
8. **Số liệu (analytics scope Managed)** — biểu đồ lượt xem, khách duy nhất, điểm đánh giá theo thời gian.

## 4. Use case

| UC | Tên | Actor | Mô tả |
|---|---|---|---|
| UC-B1 | Gửi yêu cầu claim | Member/Owner | Chọn Place → gửi bằng chứng sở hữu ([WF-05](../../workflow/contribution.md)). |
| UC-B2 | Xác minh claim | Moderator | Duyệt/từ chối; đặt `Official` + gán quyền Managed. |
| UC-B3 | Cập nhật thông tin cơ sở | Owner/Manager | Sửa giờ/giá/menu/phòng/ảnh (scope Managed). |
| UC-B4 | Phản hồi đánh giá | Owner/Manager | Trả lời review khách. |
| UC-B5 | Xem số liệu | Owner/Manager | Dashboard view/unique/rating (đã rollup). |
| UC-B6 | Gán/thu hồi Manager | Owner | Thêm/bớt nhân sự vận hành. |
| UC-B7 | Chuyển nhượng cơ sở | Owner → Owner mới | `Business.Transfer` (audited). |
| UC-B8 | Xử lý tranh chấp claim | Moderator/Admin | Nhiều người claim cùng cơ sở → phân xử. |

## 5. Luồng người dùng

**Claim & quản lý (happy path):**
```
Member mở trang Place của cơ sở mình → "Claim nếu là chủ"
   → gửi bằng chứng {giấy phép/hóa đơn/ảnh mặt tiền/xác minh SĐT}
   → hàng chờ Moderator → Business.Verify: duyệt
   → user được gán Business Owner + quyền Managed trên cơ sở; Place → Official
   → mở Dashboard → cập nhật thông tin, phản hồi review, xem số liệu
```

**Ủy quyền nhân sự (UC-B6):**
```
Owner → Dashboard → "Quản lý viên" → thêm Manager {user_id, role}
   → Manager nhận quyền scope Managed (tập con) → có thể sửa/vận hành
   → Owner thu hồi bất kỳ lúc nào (Business.Manager.Revoke) → audit
```

**Tranh chấp (UC-B8):** hai yêu cầu claim cùng cơ sở → Moderator so bằng chứng → chấp nhận một, từ chối/khiếu nại cái còn lại; trường hợp phức tạp → Administrator.

## 6. Điều kiện nghiệp vụ

- **BR-B1 — Claim cần bằng chứng & xác minh:** không tự động cấp; Moderator xác minh trước khi trao quyền.
- **BR-B2 — Một chủ hiệu lực/cơ sở:** một cơ sở chỉ có một Business Owner hiệu lực tại một thời điểm; claim mới khi đã có chủ → luồng tranh chấp.
- **BR-B3 — Scope Managed:** Owner/Manager chỉ tác động cơ sở được giao; không đụng cơ sở khác.
- **BR-B4 — Không tự đặt Official:** chủ cơ sở **không** tự phong `Official`/`verified`; chỉ Moderator (`Business.Verify`/`Verification.Verify`).
- **BR-B5 — Không xóa/không tự review:** Owner **chỉ phản hồi** review (không xóa/ẩn); **không** được tự đánh giá cơ sở của mình ([Review](review.md) BR).
- **BR-B6 — Manager là tập con quyền Owner:** Manager không có `Claim/Transfer/Manager.Assign/Delete cơ sở`.
- **BR-B7 — Thay đổi nhạy cảm vẫn qua kiểm duyệt:** đổi tên/tọa độ/gộp của cơ sở đã claim vẫn theo BR-P3 (Place).
- **BR-B8 — Transfer & thu hồi audited:** chuyển nhượng, gán/thu hồi manager, ban là hành động đặc quyền → ghi audit đầy đủ.
- **BR-B9 — Provenance business:** dữ liệu do chủ sửa gắn `source=business_owner` để phân biệt với cộng đồng.

## 7. Quy tắc dữ liệu

- **Thực thể:** `business_claims` (place_id, requester_id, evidence[], status, reviewer_id, decision_note, timestamps) + quan hệ **ownership/membership** `business_members` (place_id, user_id, role ∈ {owner, manager}, granted_by, granted_at, revoked_at).
- **Trạng thái claim:** `pending → approved / rejected` (có thể `disputed`); state machine + audit.
- **Ownership hiệu lực:** truy vấn owner = `business_members` role=owner, `revoked_at IS NULL`.
- **Verification liên kết:** khi claim approved → cập nhật trạng thái xác minh Place (`Official`) — dùng entity Verification ([verification.md](../../data/modules/verification.md)).
- **Bằng chứng (evidence):** lưu tham chiếu media/tài liệu (không lộ công khai); chỉ Moderator xem.
- **Analytics scope:** dashboard đọc `place_views_agg` + `rating_avg/count` — **chỉ tổng hợp** (không lộ dữ liệu cá nhân khách) ([analytics.md](../../data/modules/analytics.md)).
- **Riêng tư:** khu vực Dashboard `private, no-store`, `noindex`.

## 8. Quan hệ với module khác

| Module | Quan hệ |
|---|---|
| **Place (+ Hotel/Restaurant/Tour)** | Đối tượng được claim; quyền Managed cho phép sửa nội dung. |
| **Verification** | Claim approved → đặt trạng thái `Official`/verified. |
| **Review** | Owner phản hồi review; không xóa; không tự review. |
| **Analytics** | Nguồn số liệu dashboard (view/unique/rating, đã rollup). |
| **RBAC** | Vai trò Business Owner/Manager + scope Managed; quan hệ ủy quyền. |
| **Notification** | Thông báo claim approved/rejected, review mới cần phản hồi, ảnh chờ duyệt. |
| **Event** | Cơ sở đăng sự kiện chính thức. |
| **Partner API** | Đối tác ghi dữ liệu cơ sở của mình (OAuth2 scope). |

## 9. KPI của module

| Nhóm | KPI | Định nghĩa / Mục tiêu |
|---|---|---|
| Tham gia | Số cơ sở đã claim & verified | Mức doanh nghiệp lên nền tảng. |
| Chuyển đổi | Tỷ lệ claim được duyệt & thời gian xác minh trung vị | Hiệu quả onboarding — mục tiêu < 48h. |
| Hoạt động | % cơ sở verified cập nhật thông tin trong 90 ngày | Chủ cơ sở "sống". |
| Phản hồi | Tỷ lệ review được chủ phản hồi & thời gian phản hồi | Mức chăm sóc khách. |
| Giá trị | Lượt xem/lưu tăng thêm sau khi claim (before/after) | Giá trị mang lại cho chủ. |
| Tin cậy | Số vụ tranh chấp claim & tỷ lệ giải quyết | Sức khỏe cơ chế sở hữu. |
| An toàn | Số vụ mạo danh bị phát hiện/ngăn | Chống lạm dụng quyền quản lý. |

---

*Tài liệu liên quan: [place.md](place.md), [verification.md](../../data/modules/verification.md), [review.md](review.md), [analytics.md](../../data/modules/analytics.md), [rbac.md](../../security/rbac.md) (Business Owner/Manager), [contribution.md](../../workflow/contribution.md) (WF-05), [api.md](../../api/api.md) §18, [engagement.md](../engagement.md) (P8 Business).*
