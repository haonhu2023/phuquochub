# Module 3 — Restaurant (Ẩm thực)

> **Product Spec** — Restaurant là **Place chuyên biệt** (`category=restaurant`) mở rộng cho cơ sở ẩm thực: thực đơn, đặc sản, giờ mở cửa, khoảng giá, ảnh món. Kế thừa toàn bộ mô hình [Place](place.md).

---

## 1. Mục tiêu

- Giúp du khách & người dân **tìm chỗ ăn** phù hợp: theo món/ẩm thực, khoảng giá, đang mở cửa, vị trí.
- Tôn vinh **đặc sản Phú Quốc** (gỏi cá trích, nhum biển, còi biên mai, tiêu, nước mắm…) — bản đồ ẩm thực bản địa.
- Cho chủ quán **cập nhật menu/giờ/giá chính thức** và thu hút khách qua review thật + ảnh món.
- Cung cấp chỉ báo **"đang mở cửa"** chính xác theo thời gian thực (suy từ `opening_hours`).

## 2. Người sử dụng

| Vai trò | Cách dùng |
|---|---|
| **Guest / Du khách** | Tìm "ăn gì gần đây", xem menu/giá/giờ mở, ảnh món, đánh giá. |
| **Member** | Review + ảnh món, đề xuất sửa menu/giờ, đánh dấu món ngon. |
| **Business Owner (nhà hàng)** | Claim trang, cập nhật menu, giờ mở, khoảng giá, ảnh; phản hồi review. |
| **Business Manager** | Vận hành menu/ảnh/giờ (scope Managed). |
| **Local Guide** | Đóng góp đặc sản, mẹo ăn uống bản địa (đóng góp tin cậy nhanh). |
| **Moderator** | Duyệt đóng góp, kiểm duyệt ảnh món, xác minh cơ sở. |

## 3. Tính năng chính

1. **Hồ sơ ẩm thực** — kế thừa Place + loại ẩm thực (`cuisine`), khoảng giá (`price_range`), chỉ báo **đang mở**.
2. **Thực đơn (menu)** — theo mục (khai vị/chính/đồ uống…), mỗi món có tên, giá, tag (cay/chay/đặc sản).
3. **Đặc sản Phú Quốc** — gắn cờ/nhóm món đặc sản bản địa để nổi bật & tìm kiếm chuyên đề.
4. **Ảnh món** — gallery ảnh theo món/quán, kiểm duyệt.
5. **Bộ lọc chuyên biệt** — `cuisine`, `open_now`, `price_range`, `dietary` (chay/không gluten…).
6. **Giờ mở cửa & đang mở** — suy realtime từ `opening_hours` + timezone; hiển thị "đang mở/đóng cửa/sắp đóng".
7. **Đánh giá** — review có ảnh; điểm trung bình.

## 4. Use case

| UC | Tên | Actor | Mô tả |
|---|---|---|---|
| UC-R1 | Tìm chỗ ăn gần đây đang mở | Guest | Lọc `open_now` + vị trí → danh sách + bản đồ. |
| UC-R2 | Xem menu & giá | Guest | Mở nhà hàng → xem menu theo mục, ảnh món, khoảng giá. |
| UC-R3 | Tìm đặc sản Phú Quốc | Guest | Chuyên đề "đặc sản" → quán phục vụ món đó. |
| UC-R4 | Chủ cập nhật menu | Biz Owner/Manager | Sửa `sections/items` menu, giá, giờ (scope Managed). |
| UC-R5 | Review + ảnh món | Member | Đánh giá + upload ảnh món (kiểm duyệt). |
| UC-R6 | Lọc theo chế độ ăn | Guest | `dietary=chay` → quán/món phù hợp. |

## 5. Luồng người dùng

**Tìm chỗ ăn (happy path):**
```
"Ăn gì gần đây" → Search lọc cuisine + open_now + price → danh sách + bản đồ
   → mở Restaurant → xem menu (accordion theo mục) + ảnh món + giờ (đang mở?) 
   → Chỉ đường / Lưu / đọc review → (viết review + ảnh món)
```

**Chủ cập nhật menu (UC-R4):**
```
Business Owner → Dashboard cơ sở → "Menu" 
   → thêm mục → thêm món {tên, giá, tag} → sắp xếp
   → lưu (scope Managed) → source=business_owner → JSON-LD Restaurant cập nhật
```

## 6. Điều kiện nghiệp vụ

- **BR-R1 — Kế thừa Place:** áp dụng mọi business rule của [Place](place.md).
- **BR-R2 — "Đang mở" suy diễn:** trạng thái mở/đóng **tính từ `opening_hours` + timezone**, không lưu cứng; tôn trọng `exceptions` (lễ/Tết).
- **BR-R3 — Giá món hợp lệ:** giá ≥ 0, có tiền tệ; `price_range` tóm tắt để lọc nhanh.
- **BR-R4 — Đặc sản có kiểm chứng:** gắn cờ "đặc sản Phú Quốc" nên qua danh mục chuẩn/duyệt, tránh lạm dụng nhãn.
- **BR-R5 — Scope Managed:** chỉ chủ/manager sửa menu cơ sở của mình; thay đổi nhạy cảm (tên/tọa độ) theo BR-P3.
- **BR-R6 — Ảnh món kiểm duyệt:** ảnh mới `pending` cho tới khi qua kiểm duyệt/AI ([WF-17/18](../../workflow/moderation.md)).

## 7. Quy tắc dữ liệu

- **Menu:** cấu trúc `{sections:[{name, items:[{name, price, currency, tags[]}]}]}` — lưu dạng JSONB hoặc bảng `restaurant_menu_sections`/`restaurant_menu_items` (đã chốt: bảng `restaurant_menu_sections`/`_items`). **Schema đầy đủ ở [places.md §13.2](../../data/modules/places.md)** ([ADR-002](../../99-decisions/ADR-002-place-extension.md) **Accepted**).
- **Cuisine & dietary:** từ điển chuẩn hóa (code + label vi/en) để lọc nhất quán.
- **Đặc sản:** tag/`is_local_specialty` hoặc liên kết tới thực thể "đặc sản" chuyên đề.
- **Open now:** không phải cột — là **hàm suy diễn** từ `opening_hours`; cache TTL ngắn.
- **Ảnh món:** dùng `media` (`place_id`, type=image) + `caption`/`alt_text`; có thể gắn `dish_ref`.

## 8. Quan hệ với module khác

| Module | Quan hệ |
|---|---|
| **Place** | Cha — Restaurant là Place `category=restaurant`. |
| **Review** | Đánh giá món/quán → `rating_avg`. |
| **Business** | Claim/quản lý nhà hàng; dashboard số liệu. |
| **Search** | Lọc `cuisine/open_now/price/dietary`; chuyên đề đặc sản. |
| **Community** | Thảo luận "ăn gì tối ở Dương Đông?" gắn `place_id`. |
| **AI Assistant** | Tóm tắt món nổi bật, FAQ (pending); dịch menu. |
| **Analytics** | View theo cơ sở; trending "ăn gì". |

## 9. KPI của module

| Nhóm | KPI | Định nghĩa / Mục tiêu |
|---|---|---|
| Độ phủ | Số nhà hàng/quán `published` | Độ phủ ẩm thực. |
| Độ đầy đủ | % quán có menu + giờ mở + ≥3 ảnh món | Chất lượng hồ sơ — mục tiêu ≥ 65%. |
| Đặc sản | Số món đặc sản Phú Quốc được gắn & số quán phục vụ | Độ phủ bản đồ đặc sản. |
| Chính xác | % quán có `opening_hours` đầy đủ (để "đang mở" chạy đúng) | Mục tiêu ≥ 80%. |
| Tương tác | Số review + ảnh món / quán | Mức tương tác ẩm thực. |
| Khám phá | Tỷ lệ tìm "ăn gì gần đây" dẫn tới xem chi tiết | Hiệu quả khám phá vị trí. |
| Độ tươi | % menu/giá cập nhật trong 120 ngày | Chống menu lỗi thời. |

---

*Tài liệu liên quan: [place.md](place.md), [places.md](../../data/modules/places.md), [business.md](business.md), [review.md](review.md), [search.md](search.md), [api.md](../../api/api.md) §13, [discovery.md](../discovery.md) (P4).*
