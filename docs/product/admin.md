# PhuQuocHub — Wireframe: Quản trị (Admin)

> Wireframe low-fidelity (không code). Gồm: **Admin (console kiểm duyệt), Dashboard (bảng điều khiển vận hành).** Quy ước chung ở [wireframes.md](./wireframes.md).

---

## P11 — Trang Admin (Quản trị & Kiểm duyệt)

```
┌ Sidebar (hiển thị theo quyền RBAC) ┐ ┌──────── Nội dung ────────────────────┐
│ • Hàng chờ kiểm duyệt (12)         │ │  HÀNG CHỜ KIỂM DUYỆT                 │
│ • Báo cáo (5)                      │ │  ┌────────────────────────────────┐  │
│ • Nội dung AI chờ duyệt (3)        │ │  │ [Đề xuất] Sửa "Bãi Sao"        │  │
│ • Xác minh (Verification)          │ │  │  diff: giờ mở cửa 8→7h         │  │
│ • Người dùng & Vai trò             │ │  │  [ Duyệt ] [ Từ chối ] [ Sửa ] │  │
│ • Gộp địa điểm                     │ │  └────────────────────────────────┘  │
│ • Số liệu (Analytics)              │ │  … (danh sách, ưu tiên theo báo cáo) │
│ • Cấu hình / Feature flag (Admin+) │ │                                      │
│ • Nhật ký kiểm toán (Audit)        │ │  [ Bộ lọc trạng thái · Bulk action ] │
└────────────────────────────────────┘ └──────────────────────────────────────┘
```
- **Mục tiêu:** trung tâm vận hành — kiểm duyệt đóng góp/ảnh/nội dung AI, xử lý báo cáo, quản lý người dùng/vai trò, xác minh, gộp địa điểm, xem số liệu, cấu hình hệ thống — theo **quyền RBAC**.
- **Người dùng:** **Moderator** (kiểm duyệt), **Administrator** (người dùng/cấu hình), **Super Administrator** (RBAC/hệ thống). Mỗi mục **ẩn/hiện theo permission** — [rbac.md](../security/rbac.md), [security.md](../architecture/security.md).
- **Thành phần giao diện:**
  - **Hàng chờ kiểm duyệt**: item + **diff thay đổi** + Duyệt/Từ chối/Sửa ([WF-07](../workflow/moderation.md)).
  - **Báo cáo**: xử lý review/nội dung ([WF-13](../workflow/moderation.md)).
  - **Nội dung AI chờ duyệt**: xem/sửa/duyệt ([WF-09](../workflow/moderation.md)) — nhãn AI rõ.
  - **Verification**: đặt trạng thái verified/official ([verification.md](../data/modules/verification.md)).
  - **Người dùng & Vai trò**: gán role, cảnh cáo/mute/ban (theo cấp).
  - **Gộp địa điểm**, **Analytics dashboards**, **Feature flag**, **Audit log viewer**.
- **Thứ tự hiển thị:** sidebar theo RBAC (trái) → tiêu đề mục đang chọn → danh sách hàng chờ **ưu tiên theo báo cáo/độ nhạy** → item + diff thay đổi + nút quyết định → thanh bộ lọc trạng thái + bulk action (dưới/trên danh sách). (Mobile: sidebar → drawer, chỉ thao tác nhanh.)
- **Luồng thao tác:** chọn item hàng chờ → xem diff/ngữ cảnh → quyết định → **ghi audit** tự động; hành động phá hủy có xác nhận (và 4-eyes cho tối nhạy).
- **CTA:** *Chính* — "Duyệt", "Từ chối", "Sửa" (trên từng item). *Phụ* — "Bulk action", "Lọc trạng thái", "Xem nhật ký kiểm toán", "Gộp địa điểm", "Đặt xác minh".
- **Responsive:** **desktop-first** (mật độ dữ liệu cao, thao tác nhanh bằng bàn phím); mobile chỉ đọc/duyệt nhanh hạn chế.
- **SEO:** hoàn toàn `noindex`, sau đăng nhập, không public.
- **Accessibility:** **bàn phím-first** cho power user (phím tắt duyệt/từ chối); bảng có header + sắp xếp; `aria-live` cho cập nhật hàng chờ; xác nhận rõ ràng cho hành động không hoàn tác; quản lý focus khi mở/đóng panel.

### Ghi chú phân quyền hiển thị
Sidebar & hành động render theo **effective permissions** (không hardcode vai trò): Moderator thấy kiểm duyệt/báo cáo/xác minh; Administrator thêm người dùng/cấu hình; Super Administrator thêm RBAC/định nghĩa quyền. Xem cơ chế PEP→PDP ở [security.md](../architecture/security.md).

---

## P13 — Trang Dashboard (Bảng điều khiển vận hành — Admin/Moderator)

```
[ Header · vai trò: Moderator ]
[ Bảng điều khiển vận hành · khoảng thời gian ▾ ]
┌ Thẻ KPI ───────────────────────────────────────────────────┐
│ Hàng chờ: 12 │ Báo cáo mở: 5 │ AI chờ duyệt: 3 │ SLA duyệt: 18h │
└─────────────────────────────────────────────────────────────┘
┌ Sức khỏe nội dung ──────────┐ ┌ Hoạt động gần đây ───────────┐
│ ▁▂▃▅ đóng góp/ngày          │ │ • @user sửa "Bãi Sao"        │
│ % verified · % có nguồn      │ │ • report review #123         │
│ zero-result rate ↓           │ │ • AI summary "Chợ đêm" ✓     │
└──────────────────────────────┘ └──────────────────────────────┘
[ Lối tắt: → Hàng chờ · → Báo cáo · → Nội dung AI · → Xác minh · → Audit ]
```
- **Mục tiêu:** cho Moderator/Admin **cái nhìn tổng quan tức thời** về sức khỏe vận hành & nội dung để **ưu tiên việc**, và là **điểm vào nhanh** tới các hàng chờ tác nghiệp (P11 Admin). Phân biệt rõ: **P13 = điều phối/theo dõi**, **P11 = nơi thao tác**.
- **Đối tượng sử dụng:** **Moderator, Administrator, Super Administrator** — thẻ/biểu đồ/lối tắt **hiển thị theo effective permission** (Analytics.View, Report.Resolve…), [rbac.md](../security/rbac.md), [security.md](../architecture/security.md).
- **Thành phần giao diện:** hàng **thẻ KPI** (hàng chờ, báo cáo mở, AI chờ duyệt, SLA duyệt trung vị), **biểu đồ sức khỏe nội dung** (đóng góp/ngày, % verified, % có nguồn, zero-result rate — nguồn [analytics.md](../data/modules/analytics.md), đã rollup), **dòng hoạt động gần đây** (audit rút gọn), **lối tắt** tới các mục Admin, bộ chọn khoảng thời gian.
- **Thứ tự hiển thị:** tiêu đề + chọn thời gian → hàng thẻ KPI → (2 cột) biểu đồ sức khỏe · hoạt động gần đây → lối tắt tác nghiệp. (Mobile: xếp dọc; thẻ KPI cuộn ngang; biểu đồ rút gọn.)
- **Luồng thao tác:** mở Dashboard → đọc KPI/biểu đồ → phát hiện điểm nóng (hàng chờ tăng, SLA vượt, zero-result cao) → bấm lối tắt/thẻ → sang P11 xử lý; đổi khoảng thời gian để xem xu hướng.
- **CTA:** *Chính* — mở "Hàng chờ kiểm duyệt", "Báo cáo", "Nội dung AI chờ duyệt". *Phụ* — "Xem Analytics chi tiết", "Xuất báo cáo" (Admin), "Nhật ký kiểm toán".
- **Responsive:** **desktop-first** (mật độ thẻ/biểu đồ cao); mobile chỉ đọc — KPI cuộn ngang, biểu đồ rút gọn, lối tắt dạng danh sách.
- **SEO:** hoàn toàn `noindex`, sau đăng nhập, không public.
- **Accessibility:** mỗi biểu đồ có **bảng số liệu thay thế**; thẻ KPI có nhãn text + xu hướng **không chỉ bằng màu** (kèm ↑/↓ và số); `aria-live` cho cập nhật hàng chờ; điều hướng bàn phím tới thẻ/lối tắt; tương phản ≥ 4.5:1.

### Ghi chú phân biệt Dashboard vs Business
P13 là dashboard **vận hành nội bộ** (Mod/Admin, toàn hệ thống). Dashboard **chủ cơ sở** (view/rating theo cơ sở, scope Managed) nằm ở **P8 Business** — hai trang khác đối tượng & phạm vi quyền.

---

*Tài liệu liên quan: [wireframes.md](./wireframes.md), [discovery.md](./discovery.md), [engagement.md](./engagement.md), [rbac.md](../security/rbac.md), [security.md](../architecture/security.md), [moderation.md](../workflow/moderation.md), [analytics.md](../data/modules/analytics.md)*
