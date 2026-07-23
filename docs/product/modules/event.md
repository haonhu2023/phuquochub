# Module 5 — Event (Sự kiện)

> **Product Spec** — Event là thực thể **theo thời gian + vị trí**: lễ hội, sự kiện văn hóa, âm nhạc, ẩm thực, khai trương, hoạt động mùa vụ. Gắn với một địa điểm ([Place](place.md)) và có **trạng thái theo thời gian** (sắp/đang/đã diễn ra).

---

## 1. Mục tiêu

- Tập hợp **những gì đang & sắp diễn ra** ở Phú Quốc vào một nơi — theo thời gian và vị trí.
- Giúp du khách **lên lịch trải nghiệm** (thêm vào lịch, chỉ đường) và không bỏ lỡ sự kiện đáng chú ý.
- Cho nhà tổ chức/địa điểm **công bố sự kiện** và thu hút người tham dự.
- Kết nối sự kiện với **địa điểm, nhà tổ chức, cộng đồng** (thảo luận trước/sau sự kiện).

## 2. Người sử dụng

| Vai trò | Cách dùng |
|---|---|
| **Guest / Du khách** | Xem lịch sự kiện, chi tiết, thêm vào lịch, chỉ đường. |
| **Member** | Lưu/quan tâm sự kiện, thảo luận, nhận nhắc lịch (thông báo). |
| **Nhà tổ chức / Business** | Đăng & cập nhật sự kiện gắn cơ sở của mình. |
| **Local Guide** | Đóng góp sự kiện bản địa (lễ hội làng, mùa vụ). |
| **Moderator** | Duyệt sự kiện, chống tin sai/quá hạn, kiểm duyệt. |
| **Partner** | Đăng sự kiện qua Partner API (nếu áp dụng). |

## 3. Tính năng chính

1. **Chi tiết sự kiện** — tên, mô tả, cover, thời gian bắt đầu/kết thúc, địa điểm, nhà tổ chức.
2. **Trạng thái theo thời gian** — `upcoming / ongoing / ended` suy từ thời gian hiện tại; đếm ngược.
3. **Lịch sự kiện (calendar)** — xem theo ngày/tháng, gom nhóm; lọc theo loại/khu vực/thời gian.
4. **Thêm vào lịch** — xuất iCal/Google Calendar; nhắc lịch qua thông báo.
5. **Bản đồ & chỉ đường** — vị trí sự kiện, gắn Place.
6. **Liên kết** — địa điểm tổ chức, nhà tổ chức, sự kiện liên quan, thảo luận cộng đồng.
7. **Sự kiện định kỳ (recurring)** — mô tả lặp lại (hàng tuần/năm) cho lễ hội, chợ đêm.

## 4. Use case

| UC | Tên | Actor | Mô tả |
|---|---|---|---|
| UC-E1 | Xem lịch sự kiện | Guest | Mở calendar, lọc theo thời gian/khu vực/loại. |
| UC-E2 | Xem chi tiết sự kiện | Guest | Thời gian, đếm ngược, địa điểm, mô tả. |
| UC-E3 | Thêm vào lịch cá nhân | Member | Xuất iCal / nhận nhắc trước X giờ. |
| UC-E4 | Nhà tổ chức đăng sự kiện | Business | Tạo event gắn `place_id`, thời gian, mô tả. |
| UC-E5 | Cập nhật/hủy sự kiện | Business/Moderator | Sửa thời gian; đánh dấu hủy/hoãn. |
| UC-E6 | Thảo luận sự kiện | Member | Bình luận/hỏi đáp trước-sau sự kiện. |
| UC-E7 | Tự chuyển trạng thái | Hệ thống | `upcoming→ongoing→ended` theo thời gian. |

## 5. Luồng người dùng

**Khám phá & lên lịch (happy path):**
```
Trang chủ/Search → mục "Sự kiện" hoặc calendar → lọc thời gian/khu vực
   → mở Event → xem thời gian + đếm ngược + địa điểm (bản đồ)
   → [Thêm vào lịch] [Chỉ đường] [Chia sẻ] → (nhận nhắc trước sự kiện)
```

**Nhà tổ chức đăng sự kiện (UC-E4):**
```
Business (đã claim cơ sở) → "Tạo sự kiện" → nhập {tên, start_at, end_at, mô tả, place_id}
   → validation start_at < end_at, timezone Asia/Ho_Chi_Minh
   → lưu (pending nếu đóng góp cộng đồng; hoặc official nếu chủ cơ sở verified) 
   → duyệt/công khai → thông báo người quan tâm khu vực (WF-20)
```

## 6. Điều kiện nghiệp vụ

- **BR-E1 — Thời gian hợp lệ:** `start_at < end_at`; timezone chuẩn `Asia/Ho_Chi_Minh`.
- **BR-E2 — Trạng thái suy diễn:** `upcoming/ongoing/ended` **tính từ thời gian hiện tại**, không nhập tay (trừ `cancelled/postponed` do người đặt).
- **BR-E3 — Gắn địa điểm:** sự kiện nên có `place_id` hoặc tọa độ để lên bản đồ & chỉ đường; nếu không có địa điểm cố định, đánh dấu "online/không cố định".
- **BR-E4 — Kiểm duyệt & chống tin sai:** sự kiện đóng góp cộng đồng vào hàng chờ; sự kiện quá hạn tự chuyển `ended`, không hiển thị như "sắp diễn ra".
- **BR-E5 — Sự kiện định kỳ:** mô tả lặp bằng quy tắc (RRULE-like); mỗi lần hiển thị là một "occurrence" tính từ quy tắc.
- **BR-E6 — Hủy/hoãn minh bạch:** khi hủy/hoãn phải giữ bản ghi + hiển thị rõ trạng thái, thông báo người đã thêm vào lịch.
- **BR-E7 — Không nhân bản:** sự kiện trùng (cùng tên/thời gian/địa điểm) → gộp/liên kết thay vì tạo nhiều.

## 7. Quy tắc dữ liệu

- **Thực thể `events`:** `id`, `title`, `slug`, `description`, `cover_media_id`, `start_at`, `end_at`, `timezone`, `place_id` (FK Place, nullable), `organizer_id`, `category`, `status_override` (`cancelled/postponed`, nullable), `recurrence_rule` (nullable), `created_by`, trạng thái nội dung `draft/pending/published/archived`.
- **Trạng thái thời gian:** không lưu cột — hàm suy diễn từ `start_at/end_at/now()`; cache cửa sổ ngắn.
- **Calendar query:** index theo `(start_at, end_at)`; lọc cửa sổ thời gian; sự kiện đã kết thúc cache dài.
- **Provenance & versioning:** như Place — gắn source, có revision cho nội dung.
- **Thêm vào lịch:** xuất iCal sinh từ `start_at/end_at/location`; không lưu lịch cá nhân của người dùng ngoài "quan tâm".
- **SEO:** JSON-LD `Event` (`startDate/endDate/location/eventStatus`) — quan trọng cho rich result.

## 8. Quan hệ với module khác

| Module | Quan hệ |
|---|---|
| **Place** | `events.place_id` — địa điểm/nhà tổ chức; kế thừa provenance/versioning. |
| **Business** | Nhà tổ chức là cơ sở được claim; đăng sự kiện chính thức. |
| **Community** | Thảo luận trước/sau sự kiện; gắn liên kết. |
| **Search** | Index sự kiện; lọc theo thời gian/khu vực/trạng thái. |
| **Notification** | Nhắc lịch trước sự kiện; thông báo hủy/hoãn ([WF-20](../../workflow/workflow.md)). |
| **Review** | (tùy chọn) đánh giá/hồi ức sau sự kiện. |
| **Weather** | Sự kiện ngoài trời → hiển thị dự báo thời tiết ngày diễn ra. |

## 9. KPI của module

| Nhóm | KPI | Định nghĩa / Mục tiêu |
|---|---|---|
| Độ phủ | Số sự kiện `upcoming` tại mọi thời điểm | Lịch luôn "sống", không rỗng. |
| Chất lượng | % sự kiện có địa điểm (place_id/tọa độ) | Lên bản đồ được — mục tiêu ≥ 85%. |
| Tương tác | Số "quan tâm"/"thêm vào lịch" per sự kiện | Mức hấp dẫn. |
| Chính xác | Tỷ lệ sự kiện có thời gian chính xác (không quá hạn còn "upcoming") | Độ tin cậy lịch. |
| Vận hành | Thời gian duyệt sự kiện trung vị | Mục tiêu < 12h (sự kiện nhạy thời gian). |
| Minh bạch | Tỷ lệ hủy/hoãn được thông báo kịp cho người quan tâm | Trải nghiệm tin cậy. |
| Khám phá | Tỷ lệ mở chi tiết từ calendar | Hiệu quả lịch sự kiện. |

---

*Tài liệu liên quan: [place.md](place.md), [community.md](community.md), [business.md](business.md), [search.md](search.md), [api.md](../../api/api.md) §15 & §23 (Notification), [workflow.md](../../workflow/workflow.md) (WF-20), [discovery.md](../discovery.md) (P6).*
