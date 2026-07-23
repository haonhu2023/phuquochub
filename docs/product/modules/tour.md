# Module 4 — Tour (Trải nghiệm)

> **Product Spec** — Tour là **Place chuyên biệt** (`category=tour`) mở rộng cho dịch vụ trải nghiệm: lộ trình trên bản đồ, lịch khởi hành, giá, uy tín nhà tổ chức. Kế thừa mô hình [Place](place.md). *Giai đoạn đầu không đặt tour/thanh toán — chỉ thông tin & khám phá.*

---

## 1. Mục tiêu

- Giúp du khách **khám phá & lên kế hoạch** cho các trải nghiệm ở Phú Quốc: lặn biển, câu cá, tham quan đảo (island hopping), trekking, cáp treo, chợ đêm…
- Trực quan hóa **lộ trình trên bản đồ** (điểm dừng có tọa độ) — điểm khác biệt so với danh sách tour thông thường.
- Cho **nhà tổ chức tour** hiện diện có xác minh, cập nhật lịch/giá, thu thập đánh giá thật.
- Tạo niềm tin qua **badge xác minh nhà tổ chức** + review, chống tour "ma"/lừa đảo.

## 2. Người sử dụng

| Vai trò | Cách dùng |
|---|---|
| **Guest / Du khách** | Tìm tour theo loại/thời lượng/giá, xem lộ trình, lịch, đánh giá, nhà tổ chức. |
| **Member** | Lưu tour, review sau khi trải nghiệm, đặt câu hỏi (community). |
| **Tour Operator (Partner/Business)** | Tạo & quản lý tour, lộ trình, lịch khởi hành, giá (Partner API `tours:write` hoặc scope Managed). |
| **Local Guide** | Đóng góp mẹo, cảnh báo mùa vụ/thời tiết (marine) cho tour biển. |
| **Moderator** | Duyệt tour, xác minh nhà tổ chức, kiểm duyệt nội dung. |

## 3. Tính năng chính

1. **Hồ sơ tour** — kế thừa Place + loại tour (`type`: diving/fishing/trekking/island…), **thời lượng**, mức giá.
2. **Lộ trình trực quan (itinerary)** — danh sách điểm dừng có tọa độ → vẽ polyline + pin trên bản đồ.
3. **Lịch khởi hành (schedule)** — ngày, số chỗ tham khảo, giá theo ngày/mùa.
4. **Nhà tổ chức** — hồ sơ operator + **badge xác minh**, liên hệ.
5. **Bộ lọc chuyên biệt** — `type`, `duration`, `price_max`, khu vực khởi hành.
6. **Tích hợp thời tiết biển** — cảnh báo sóng/gió (marine) cho tour biển (module Weather).
7. **Đánh giá** — review từ khách đã trải nghiệm.

## 4. Use case

| UC | Tên | Actor | Mô tả |
|---|---|---|---|
| UC-T1 | Tìm tour theo tiêu chí | Guest | Lọc loại/thời lượng/giá → danh sách tour. |
| UC-T2 | Xem lộ trình trên bản đồ | Guest | Mở tour → xem điểm dừng + polyline + danh sách text. |
| UC-T3 | Xem lịch & giá | Guest | Xem ngày khởi hành, giá theo mùa. |
| UC-T4 | Nhà tổ chức tạo/sửa tour | Operator | Tạo tour, thêm điểm dừng (tọa độ), lịch, giá. |
| UC-T5 | Partner đồng bộ lịch tour | Partner | `GET/PATCH /tours/:id/schedule` (`tours:write`). |
| UC-T6 | Xác minh nhà tổ chức | Operator → Moderator | Claim/verify để hiển thị badge. |
| UC-T7 | Review sau trải nghiệm | Member | Đánh giá + ảnh; cảnh báo an toàn nếu có. |

## 5. Luồng người dùng

**Khám phá tour (happy path):**
```
Search "lặn biển" hoặc Trang chủ → lọc type=diving + duration + price
   → mở Tour → xem lộ trình (bản đồ điểm dừng + danh sách text) + thời lượng
   → xem lịch khởi hành + giá + nhà tổ chức (verified) + đánh giá
   → Lưu / Liên hệ / (giai đoạn sau: đặt tour)
```

**Nhà tổ chức tạo tour (UC-T4):**
```
Operator (đã verify) → tạo Tour → nhập loại, thời lượng, mô tả
   → thêm điểm dừng {tên, tọa độ, thời gian, ghi chú} theo thứ tự → hệ thống vẽ lộ trình
   → thêm lịch {ngày, chỗ, giá} → lưu (pending nếu là đóng góp mới) → duyệt → published
```

## 6. Điều kiện nghiệp vụ

- **BR-T1 — Kế thừa Place:** áp dụng mọi business rule của [Place](place.md).
- **BR-T2 — Điểm dừng phải có tọa độ hợp lệ:** mỗi stop cần `location` để vẽ lộ trình; tọa độ trong/quanh Phú Quốc.
- **BR-T3 — Thứ tự lộ trình:** stops có `sort_order`; lộ trình hiển thị theo thứ tự.
- **BR-T4 — Lịch & giá hợp lệ:** ngày khởi hành ≥ hôm nay (cho lịch mới); giá ≥ 0; giá mùa có `valid_from/to`.
- **BR-T5 — Uy tín nhà tổ chức:** tour hiển thị badge **verified** chỉ khi operator đã claim & được `Business.Verify`.
- **BR-T6 — Không giao dịch giai đoạn đầu:** không giữ chỗ/thanh toán; "số chỗ" là tham khảo.
- **BR-T7 — Partner scope:** Partner chỉ sửa tour thuộc mình (`tours:write` + scope).
- **BR-T8 — An toàn:** tour biển nên hiển thị cảnh báo marine khi điều kiện xấu (không chặn, chỉ khuyến cáo).

## 7. Quy tắc dữ liệu

- **Mở rộng Place:** `place_tour_details` (`tour_type`, `duration_minutes`, `difficulty`, `organizer_id`) + `tour_stops` (place_id, name, location, sort_order, time, note) + `tour_schedules` (date, capacity, price, currency, valid_from/to) — **schema đầy đủ ở [places.md §13.3](../../data/modules/places.md)** ([ADR-002](../../99-decisions/ADR-002-place-extension.md) **Accepted**).
- **Itinerary:** danh sách `tour_stops` có tọa độ → trả về để FE vẽ polyline; **luôn kèm danh sách text** (accessibility).
- **Organizer:** liên kết tới cơ sở/nhà tổ chức (Business) đã xác minh.
- **Marine weather:** không lưu trong Tour — gọi module Weather theo tọa độ điểm khởi hành, cache TTL 10–30′.
- **Giá:** `tour_schedules.price` + tóm tắt `price_range`.

## 8. Quan hệ với module khác

| Module | Quan hệ |
|---|---|
| **Place** | Cha — Tour là Place `category=tour`. |
| **Business** | Nhà tổ chức = cơ sở được claim/verify; quản lý tour scope Managed. |
| **Review** | Đánh giá tour → uy tín & `rating_avg`. |
| **Search** | Lọc `type/duration/price/departure_area`. |
| **Weather** | Cảnh báo marine (sóng/gió) cho tour biển. |
| **Community** | Hỏi đáp kinh nghiệm ("kinh nghiệm lặn biển Hòn Thơm"). |
| **Partner API** | Kênh ghi tour/lịch cho đối tác (`tours:write`, webhook). |
| **Analytics** | View & lưu theo tour → tour nổi bật. |

## 9. KPI của module

| Nhóm | KPI | Định nghĩa / Mục tiêu |
|---|---|---|
| Độ phủ | Số tour `published` theo loại | Đa dạng trải nghiệm. |
| Chất lượng lộ trình | % tour có ≥2 điểm dừng có tọa độ | Để lộ trình trực quan có ý nghĩa — mục tiêu ≥ 80%. |
| Tin cậy | % tour có nhà tổ chức verified | Chống tour "ma". |
| Độ tươi | % tour có lịch khởi hành còn hiệu lực | Lịch không lỗi thời. |
| Tương tác | Lượt xem lộ trình & lưu / tour | Sức hút. |
| Chất lượng | Điểm đánh giá TB & số review/tour | Uy tín trải nghiệm. |
| An toàn | Tỷ lệ tour biển hiển thị cảnh báo marine khi cần | Trách nhiệm an toàn. |

---

*Tài liệu liên quan: [place.md](place.md), [places.md](../../data/modules/places.md), [business.md](business.md), [review.md](review.md), [search.md](search.md), [api.md](../../api/api.md) §14 & §20 (Weather), [discovery.md](../discovery.md) (P5).*
