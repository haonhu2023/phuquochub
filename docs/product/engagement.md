# PhuQuocHub — Wireframe: Nhóm Tương tác (Engagement)

> Wireframe low-fidelity (không code). Gồm: **Business, Community, Profile.** Quy ước chung ở [wireframes.md](./wireframes.md).

---

## P8 — Trang Business (Bảng điều khiển chủ cơ sở)

```
[ Sidebar: Tổng quan · Trang của tôi · Đánh giá · Ảnh · Giá/Menu/Phòng · Quản lý viên · Số liệu ]
┌─────────────────────────────────────────────────────────┐
│ Trạng thái claim: ✅ Đã xác minh (Official)             │
│ [ Cơ sở: "Nhà hàng ABC" ]  [ Chỉnh sửa thông tin ]      │
├─────────────────────────────────────────────────────────┤
│ 📊 Lượt xem (30 ngày) ▁▂▃▅  · Khách duy nhất · ⭐ TB     │
│ 💬 Đánh giá mới cần phản hồi (3)  [ Trả lời ]           │
│ 🖼 Ảnh chờ duyệt (2)                                     │
└─────────────────────────────────────────────────────────┘
```
- **Mục tiêu:** cho chủ cơ sở quản lý trang đã claim: cập nhật thông tin chính thức, phản hồi đánh giá, xem số liệu cơ bản.
- **Người dùng:** **Business Owner**, **Business Manager** (scope *Managed*) — [rbac.md](../security/rbac.md).
- **Thành phần giao diện:** trạng thái claim/xác minh, danh sách cơ sở quản lý, form sửa thông tin (giá/menu/phòng tùy loại), khối phản hồi đánh giá, quản lý ảnh, **dashboard số liệu** (view/unique/rating từ [analytics.md](../data/modules/analytics.md) — đã rollup), quản lý *Business Manager* (chỉ Owner).
- **Thứ tự hiển thị:** sidebar (Tổng quan · Trang của tôi · Đánh giá · Ảnh · Giá/Menu/Phòng · Quản lý viên · Số liệu) → trạng thái claim/xác minh → cơ sở + nút chỉnh sửa → khối số liệu (view/unique/⭐) → đánh giá mới cần phản hồi → ảnh chờ duyệt. (Mobile: sidebar → menu thu gọn; bảng số liệu → thẻ.)
- **Luồng thao tác:** Claim ([WF-05](../workflow/contribution.md)) → xác minh → cập nhật thông tin → **Trả lời đánh giá** → xem số liệu; Owner thêm/bớt Manager.
- **CTA:** *Chính* — "Chỉnh sửa thông tin", "Trả lời đánh giá". *Phụ* — "Duyệt ảnh", "Thêm quản lý viên" (chỉ Owner), "Xem số liệu chi tiết", "Chuyển nhượng cơ sở" (Owner).
- **Responsive:** sidebar → menu thu gọn; bảng số liệu → thẻ trên mobile.
- **SEO:** khu vực **riêng tư**, yêu cầu đăng nhập, `noindex`.
- **Accessibility:** form có nhãn + lỗi rõ; biểu đồ có bảng số liệu thay thế; hành động nhạy cảm (gỡ Manager) có xác nhận.

---

## P9 — Trang Community (Thảo luận kiểu Reddit)

```
[ Tabs: 🔥 Hot · 🆕 Mới · ⭐ Top ]   [ + Tạo bài ]
┌── Bộ lọc: Chủ đề · Khu vực · Gắn địa điểm ──┐
│ ▲ 128  "Kinh nghiệm lặn biển Hòn Thơm"      │
│ ▼      bởi @localguide · 24 bình luận · tag │
│ ─────────────────────────────────────────── │
│ ▲ 56   "Ăn gì tối ở Dương Đông?"  📍Place   │
└──────────────────────────────────────────────┘
  (chi tiết bài) → nội dung · vote · bình luận lồng nhau · [Báo cáo]
```
- **Mục tiêu:** thảo luận, hỏi đáp, chia sẻ trải nghiệm; bình chọn nội dung hữu ích; gắn theo chủ đề/địa điểm.
- **Người dùng:** Member, Local Guide (uy tín cao), Guest (đọc).
- **Thành phần giao diện:** feed bài viết + **sắp xếp Hot/Mới/Top**, nút tạo bài, bộ lọc (tag/khu vực/địa điểm), **vote control** (▲/▼), chi tiết bài + **bình luận lồng nhau** (`parent_id`), hiển thị **karma/uy tín** tác giả + badge Local Guide, nút **Báo cáo**.
- **Thứ tự hiển thị:** tabs Hot/Mới/Top + nút "Tạo bài" → bộ lọc (chủ đề/khu vực/địa điểm) → feed bài (vote control + tiêu đề + meta tác giả/karma) → *(chi tiết bài)* nội dung → vote → bình luận lồng nhau → báo cáo. (Mobile: 1 cột, vote control gọn đầu card.)
- **Luồng thao tác:** duyệt → mở bài → vote/bình luận (đăng nhập) → tạo bài ([WF-11 tương tự](../workflow/moderation.md)); báo cáo → [WF-12/13](../workflow/moderation.md).
- **CTA:** *Chính* — "+ Tạo bài", "▲/▼ Vote", "Bình luận". *Phụ* — "Báo cáo", "Lọc theo địa điểm/khu vực", "Chia sẻ bài".
- **Responsive:** 1 cột mobile; vote control gọn ở đầu card.
- **SEO:** bài viết công khai SSR & indexable; JSON-LD `DiscussionForumPosting`/`QAPage`; canonical theo `slug`.
- **Accessibility:** nút vote có nhãn trạng thái (đã vote chưa); bình luận lồng dạng danh sách phân cấp; bàn phím đầy đủ.

---

## P10 — Trang Profile (Hồ sơ người dùng)

```
[ Avatar · Tên · badge vai trò (Local Guide) · Karma 1,240 ]
[ Tabs: Đóng góp · Đánh giá · Bài viết · Đã lưu · (Cài đặt) ]
┌─────────────────────────────────────────────┐
│ Dòng thời gian hoạt động / danh sách theo tab│
│ [▢] Sửa "Bãi Sao" — đã duyệt ✅              │
│ [▢] Đánh giá "Nhà hàng ABC" ⭐5              │
└─────────────────────────────────────────────┘
(self) [ Chỉnh sửa hồ sơ ] [ Cài đặt thông báo ]
```
- **Mục tiêu:** thể hiện danh tính & uy tín người đóng góp; quản lý đóng góp/đánh giá/địa điểm đã lưu; cài đặt cá nhân.
- **Người dùng:** chủ hồ sơ (sửa) + khách xem công khai.
- **Thành phần giao diện:** avatar/tên/**badge vai trò**, **điểm karma**, tabs (đóng góp, đánh giá, bài viết, đã lưu), dòng thời gian hoạt động; (self) chỉnh sửa hồ sơ + **cài đặt thông báo** ([WF-20](../workflow/workflow.md)).
- **Thứ tự hiển thị:** header hồ sơ (avatar · tên · badge vai trò · karma) → tabs (Đóng góp · Đánh giá · Bài viết · Đã lưu · [Cài đặt]) → dòng thời gian/nội dung theo tab → (self) khối chỉnh sửa hồ sơ + cài đặt thông báo. (Mobile: tabs → dropdown; lưới "đã lưu" 1 cột.)
- **Luồng thao tác:** xem hồ sơ → (self) sửa → quản lý đã lưu → mở cài đặt thông báo/kênh.
- **CTA:** *(self)* *Chính* — "Chỉnh sửa hồ sơ", "Cài đặt thông báo". *(khách)* *Phụ* — xem đóng góp/đánh giá công khai; không lộ email/PII.
- **Responsive:** tabs → dropdown trên mobile; lưới "đã lưu" 1 cột.
- **SEO:** hồ sơ công khai indexable tối giản (`ProfilePage`, **không lộ email/PII**); trang cài đặt `noindex`.
- **Accessibility:** tabs theo ARIA tab pattern; avatar có `alt`; badge có text.

---

*Tài liệu liên quan: [wireframes.md](./wireframes.md), [discovery.md](./discovery.md), [admin.md](./admin.md), [rbac.md](../security/rbac.md), [analytics.md](../data/modules/analytics.md), [workflow.md](../workflow/workflow.md)*
