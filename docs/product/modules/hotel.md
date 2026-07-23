# Module 2 — Hotel (Lưu trú)

> **Product Spec** — Hotel là **Place chuyên biệt** (`category=hotel`) mở rộng cho cơ sở lưu trú: hạng sao, tiện ích, loại phòng, giá tham khảo. Kế thừa toàn bộ mô hình [Place](place.md). *Giai đoạn đầu: KHÔNG đặt phòng/thanh toán — chỉ thông tin & khám phá* ([vision.md §4.4](../../overview/vision.md)).

---

## 1. Mục tiêu

- Giới thiệu **cơ sở lưu trú** ở Phú Quốc (resort, khách sạn, homestay, villa) một cách minh bạch, có bản đồ, ảnh, đánh giá thật.
- Giúp du khách **so sánh & chọn chỗ ở** theo hạng sao, tiện ích, khoảng giá, vị trí (gần biển/khu vực).
- Cho chủ lưu trú **hiện diện được xác minh** mà không phụ thuộc quảng cáo trả phí, và cập nhật thông tin phòng/tiện ích.
- Đặt nền cho **đặt phòng ở giai đoạn sau** (ngoài phạm vi hiện tại) mà không phải đổi mô hình dữ liệu.

## 2. Người sử dụng

| Vai trò | Cách dùng |
|---|---|
| **Guest / Du khách** | Tìm & so sánh chỗ ở, xem phòng/tiện ích/giá tham khảo, vị trí, đánh giá. |
| **Member** | Lưu khách sạn, viết review, upload ảnh, đề xuất sửa thông tin. |
| **Business Owner (khách sạn)** | Claim trang, cập nhật hạng sao, tiện ích, loại phòng, giá tham khảo, ảnh; phản hồi review. |
| **Business Manager** | Vận hành trang được ủy quyền (scope Managed) — sửa phòng/giá/ảnh, không quản lý manager. |
| **Partner (OTA/chuỗi)** | Ghi dữ liệu phòng qua Partner API (`hotels:write`) trong phạm vi của mình. |
| **Moderator** | Duyệt đóng góp, xác minh cơ sở, kiểm duyệt ảnh. |

## 3. Tính năng chính

1. **Hồ sơ lưu trú** — kế thừa Place + **hạng sao** (`star_rating`), loại hình (resort/hotel/homestay/villa).
2. **Tiện ích (amenities)** — lưới tiện ích chuẩn hóa (hồ bơi, ăn sáng, đỗ xe, wifi, bãi biển riêng, spa…).
3. **Loại phòng (room types)** — tên, sức chứa, tiện ích phòng, **giá tham khảo** (không phải giá bán realtime).
4. **Vị trí & khu vực** — bản đồ, khoảng cách tới biển/trung tâm, tìm "lưu trú gần [địa điểm]".
5. **Bộ lọc chuyên biệt** — `stars`, `amenities`, `price_min/max`, khu vực.
6. **Đánh giá & ảnh** — review có ảnh, điểm trung bình, ảnh cơ sở/phòng.
7. **Nhãn phạm vi** — hiển thị rõ "chỉ thông tin, chưa đặt phòng" để đặt kỳ vọng đúng.

## 4. Use case

| UC | Tên | Actor | Mô tả |
|---|---|---|---|
| UC-H1 | Tìm chỗ ở theo tiêu chí | Guest | Lọc theo sao/tiện ích/giá/khu vực → danh sách + bản đồ. |
| UC-H2 | Xem chi tiết khách sạn | Guest | Xem hạng sao, tiện ích, loại phòng, vị trí, đánh giá. |
| UC-H3 | Tìm lưu trú gần một địa điểm | Guest | "Khách sạn gần Bãi Sao" → geo query bán kính. |
| UC-H4 | Chủ cập nhật phòng & tiện ích | Biz Owner/Manager | Sửa `room_types`, amenities, giá tham khảo (scope Managed). |
| UC-H5 | Partner đồng bộ phòng | Partner | Ghi loại phòng qua `PATCH /hotels/:id/rooms` (`hotels:write`). |
| UC-H6 | Claim & xác minh khách sạn | Biz Owner → Moderator | [WF-05](../../workflow/contribution.md) → `Business.Verify`. |
| UC-H7 | Đánh giá & đăng ảnh phòng | Member | Review + media (kiểm duyệt). |

## 5. Luồng người dùng

**Tìm & chọn (happy path):**
```
Search/Trang chủ → lọc "Lưu trú" + sao + tiện ích + giá → danh sách card + bản đồ đồng bộ
   → mở Hotel → xem tiện ích + bảng loại phòng + vị trí + đánh giá
   → Lưu / Chỉ đường / (đọc review) → (giai đoạn sau: đặt phòng)
```

**Chủ cập nhật phòng (UC-H4):**
```
Business Owner (đã claim & verified) → Dashboard cơ sở → mục "Phòng/Tiện ích"
   → thêm/sửa room_type {tên, sức chứa, tiện ích, giá tham khảo}
   → tiện ích chọn từ từ điển chuẩn (không nhập tự do)
   → lưu (scope Managed) → gắn source=business_owner → cập nhật hiển thị
```

## 6. Điều kiện nghiệp vụ

- **BR-H1 — Kế thừa Place:** mọi business rule của [Place](place.md) áp dụng (trạng thái, provenance, xác minh, chống trùng).
- **BR-H2 — Không đặt phòng giai đoạn đầu:** không có luồng thanh toán/giữ chỗ; giá là **tham khảo**, có thể kèm mùa vụ (`valid_from/to`).
- **BR-H3 — Hạng sao hợp lệ:** `star_rating ∈ {1..5}` hoặc null (chưa xếp hạng); không tự phong sao "official" nếu chưa xác minh.
- **BR-H4 — Tiện ích từ từ điển chuẩn:** amenity phải thuộc danh mục chuẩn hóa (để lọc & i18n nhất quán), không nhập tự do.
- **BR-H5 — Scope Managed:** chỉ Owner/Manager/Partner sửa phòng/giá của cơ sở của mình; thay đổi nhạy cảm (tên/tọa độ) vẫn theo BR-P3.
- **BR-H6 — Giá không âm:** `price ≥ 0`, có `currency` (mặc định VND), có đơn vị (/đêm).

## 7. Quy tắc dữ liệu

- **Mở rộng Place:** dùng bảng/nhóm trường mở rộng cho hotel (`place_hotel_details`: `star_rating`, `hotel_type`, `check_in/out`, `amenities[]`) + `hotel_room_types` (tên, sức chứa, tiện ích phòng, giá tham khảo) — **schema đầy đủ ở [places.md §13.1](../../data/modules/places.md)** ([ADR-002](../../99-decisions/ADR-002-place-extension.md) **Accepted**).
- **Amenities:** tham chiếu bảng từ điển `amenities` (code, label vi/en, icon, nhóm); quan hệ N-N với hotel.
- **Room types:** giá tham khảo `NUMERIC(12,2)`, `currency`, `capacity`, `valid_from/to` cho giá mùa vụ.
- **Filter hỗ trợ:** `stars`, `amenities` (giao tập), `price_min/max` map tới giá tham khảo min của phòng.
- **Kế thừa:** `opening_hours` ít dùng (lưu trú thường 24h reception) — có thể để `is_24h` hoặc trống.

## 8. Quan hệ với module khác

| Module | Quan hệ |
|---|---|
| **Place** | Cha — Hotel là Place `category=hotel`, kế thừa toàn bộ. |
| **Review** | Đánh giá lưu trú → `rating_avg` hiển thị trên card/bản đồ. |
| **Business** | Claim/quản lý cơ sở lưu trú; dashboard số liệu (view/review). |
| **Search** | Bộ lọc chuyên biệt (sao/tiện ích/giá); "lưu trú gần [địa điểm]". |
| **Tour / Restaurant** | Cùng khu vực → gợi ý chéo (gần khách sạn có gì ăn/chơi). |
| **Analytics** | View theo cơ sở → dashboard chủ + xếp hạng lưu trú nổi bật. |
| **Partner API** | Kênh ghi dữ liệu phòng cho đối tác (`hotels:write`). |

## 9. KPI của module

| Nhóm | KPI | Định nghĩa / Mục tiêu |
|---|---|---|
| Độ phủ | Số khách sạn/homestay `published` | Độ phủ lưu trú toàn đảo. |
| Độ đầy đủ | % hồ sơ có ≥3 ảnh + ≥1 loại phòng + tiện ích | Chất lượng hồ sơ lưu trú — mục tiêu ≥ 70%. |
| Chất lượng | % cơ sở đã claim & verified | Mức độ chủ cơ sở tham gia. |
| Tương tác | Lượt xem & lượt lưu / cơ sở | Sức hút của trang lưu trú. |
| Tương tác | Tỷ lệ tìm "lưu trú gần [địa điểm]" dẫn tới xem chi tiết | Hiệu quả khám phá theo vị trí. |
| Chất lượng | Điểm đánh giá trung bình & số review/cơ sở | Uy tín & mức tương tác đánh giá. |
| Độ tươi | % giá tham khảo cập nhật trong 180 ngày | Chống giá lỗi thời. |

---

*Tài liệu liên quan: [place.md](place.md), [places.md](../../data/modules/places.md), [business.md](business.md), [review.md](review.md), [search.md](search.md), [api.md](../../api/api.md) §12, [discovery.md](../discovery.md) (P3).*
