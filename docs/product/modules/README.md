# PhuQuocHub — Product Spec: Đặc tả 10 Module sản phẩm

> **Mục đích:** đặc tả **sản phẩm** (product specification) cho 10 module cốt lõi của PhuQuocHub. Đây là lớp **thiết kế sản phẩm** — *không phải* thiết kế giao diện (wireframe ở [../discovery.md](../discovery.md), [../engagement.md](../engagement.md), [../admin.md](../admin.md)) và *không phải* thiết kế dữ liệu/API (ở [../../data/](../../data/), [../../api/api.md](../../api/api.md)). Tài liệu **chỉ thiết kế**, tiếng Việt, không code.

## 1. Khuôn đặc tả — mỗi module gồm 9 mục

| # | Mục | Ý nghĩa |
|---|---|---|
| 1 | **Mục tiêu** | Vai trò của module trong sản phẩm & giá trị mang lại |
| 2 | **Người sử dụng** | Các persona/vai trò tương tác (theo [rbac.md](../../security/rbac.md)) |
| 3 | **Tính năng chính** | Danh mục năng lực module cung cấp |
| 4 | **Use case** | Các tình huống sử dụng cụ thể (UC) |
| 5 | **Luồng người dùng** | Trình tự thao tác chính (happy path + rẽ nhánh) |
| 6 | **Điều kiện nghiệp vụ** | Business rules — ràng buộc phải luôn đúng |
| 7 | **Quy tắc dữ liệu** | Data rules — tính hợp lệ, provenance, vòng đời dữ liệu |
| 8 | **Quan hệ module khác** | Phụ thuộc & liên kết chéo |
| 9 | **KPI** | Chỉ số đo lường thành công của module |

## 2. Danh mục 10 module

| # | Module | Tài liệu | Trụ cột chính | Vai trò |
|---|---|---|---|---|
| 1 | **Place** | [place.md](place.md) | Wikipedia + Map | Thực thể lõi — trang tri thức địa điểm có phiên bản & xác minh |
| 2 | **Hotel** | [hotel.md](hotel.md) | Wikipedia + Map | Place chuyên biệt lưu trú (hạng sao, tiện ích, phòng) |
| 3 | **Restaurant** | [restaurant.md](restaurant.md) | Wikipedia + Map | Place chuyên biệt ẩm thực (menu, đặc sản, giờ mở) |
| 4 | **Tour** | [tour.md](tour.md) | Wikipedia + Map | Place chuyên biệt trải nghiệm (lộ trình, lịch, nhà tổ chức) |
| 5 | **Event** | [event.md](event.md) | Wikipedia + Map | Thực thể theo thời gian (sự kiện, lễ hội) |
| 6 | **Community** | [community.md](community.md) | Reddit | Thảo luận, hỏi đáp, vote, uy tín |
| 7 | **Business** | [business.md](business.md) | (nền tảng tin cậy) | Claim & quản lý cơ sở, dashboard chủ cơ sở |
| 8 | **Review** | [review.md](review.md) | Reddit | Đánh giá sao + nội dung + ảnh, chống review giả |
| 9 | **Search** | [search.md](search.md) | Map + Knowledge | Tìm kiếm liên hợp + bản đồ + gợi ý |
| 10 | **AI Assistant** | [ai-assistant.md](ai-assistant.md) | (xuyên suốt) | Sinh nội dung nháp, kiểm duyệt hỗ trợ, gợi ý (human-in-the-loop) |

## 3. Bản đồ phụ thuộc giữa các module

```
                         ┌──────────────┐
                         │   Search     │  (đọc mọi thực thể có thể index)
                         └──────┬───────┘
                                │ index/truy vấn
        ┌──────────┬────────────┼────────────┬───────────┐
        ▼          ▼            ▼             ▼           ▼
     Place ◄──── Hotel      Restaurant      Tour       Event
       ▲  \       (kế thừa Place — category chuyên biệt)   │
       │   \                                                │
       │    └───── Review ──► gắn vào Place/Hotel/...  ◄────┘
       │                                     ▲
       │            Business ── claim/quản lý─┘ (scope Managed)
       │
   Community ──── gắn place_id (thảo luận theo địa điểm)
       ▲
       │
   AI Assistant ── sinh summary/FAQ/dịch/kiểm spam cho Place & Community & Review (đầu ra pending)
```

- **Place là trung tâm:** Hotel/Restaurant/Tour là Place chuyên biệt theo `category`; Event, Review, Community, Business đều **tham chiếu** Place.
- **Search** đứng ngoài, đọc và đánh chỉ mục mọi thực thể công khai.
- **AI Assistant** là service phụ trợ xuyên suốt, chỉ sinh **bản nháp** cho các module khác.

## 4. Quy ước dùng chung trong nhóm

- **Trạng thái nội dung cộng đồng:** `draft → pending → published → archived` (máy trạng thái — [WF-14](../../workflow/workflow.md)).
- **Phân tầng tin cậy:** `community` (đóng góp, kiểm duyệt) vs `official/verified` (chủ sở hữu/moderator xác nhận) — [vision.md §6](../../overview/vision.md).
- **Provenance:** mọi thay đổi dữ liệu gắn `source` ([source.md](../../data/modules/source.md)); mọi nội dung có phiên bản (`wiki_revisions`).
- **Human-in-the-loop:** đầu ra AI luôn `pending` cho tới khi người duyệt.
- **Permission-first:** mọi hành động ghi kiểm tra Permission (deny by default) — [rbac.md](../../security/rbac.md).

## 5. Cách đọc

1. Đọc [place.md](place.md) trước — module lõi định nghĩa mô hình chung.
2. Đọc Hotel/Restaurant/Tour/Event — phần mở rộng của Place.
3. Đọc Review, Community, Business — lớp tương tác & sở hữu.
4. Đọc Search, AI Assistant — lớp nền tảng xuyên suốt.

---

*Tài liệu liên quan: [vision.md](../../overview/vision.md), [rbac.md](../../security/rbac.md), [workflow.md](../../workflow/workflow.md), [api.md](../../api/api.md), [database.md](../../data/database.md), [discovery.md](../discovery.md), [engagement.md](../engagement.md)*
