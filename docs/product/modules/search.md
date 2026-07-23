# Module 9 — Search (Tìm kiếm & Bản đồ)

> **Product Spec** — Search là lớp **tìm kiếm liên hợp** (place/hotel/restaurant/tour/event/community) kết hợp **bản đồ** và **gợi ý**. Ánh xạ trụ cột *Google Maps* (tìm theo vị trí) + *Wikipedia* (tìm tri thức). Là cửa ngõ khám phá chính của nền tảng.

---

## 1. Mục tiêu

- Cho phép tìm **mọi loại thực thể** ở Phú Quốc từ một ô tìm kiếm, kết hợp lọc & bản đồ.
- Hỗ trợ **tiếng Việt không dấu** (unaccent) và **tìm theo vị trí** (gần tôi, bán kính, khu vực/bbox).
- Đưa kết quả đúng & nhanh; **đồng bộ danh sách ↔ bản đồ**.
- Biến **truy vấn 0 kết quả** thành tín hiệu để **bồi đắp nội dung** (gợi ý tạo Place/bài viết, đầu vào cho AI & biên tập).

## 2. Người sử dụng

| Vai trò | Cách dùng |
|---|---|
| **Guest / Mọi người dùng** | Tìm & lọc, xem trên bản đồ, mở chi tiết. |
| **Member** | Như Guest + lưu, đóng góp khi 0 kết quả. |
| **Contributor / Biên tập** | Dùng thống kê 0-kết-quả & trending để biết "lỗ hổng nội dung". |
| **Administrator** | `Search.Reindex` (dựng lại chỉ mục), cấu hình. |
| **Bên thứ ba (Public API)** | Truy vấn tìm kiếm chỉ đọc (quota theo key). |
| **AI Agent** | Đọc tín hiệu 0-kết-quả/trending để gợi ý tạo Place ([WF-19](../../workflow/contribution.md)). |

## 3. Tính năng chính

1. **Tìm kiếm liên hợp** — kết quả trộn nhiều `type` với điểm liên quan; nhãn loại rõ ràng.
2. **Autocomplete / gợi ý** — `search/suggest` prefix, cache mạnh.
3. **Bộ lọc** — theo loại, giá, đánh giá, khu vực/phường, đang mở, tiện ích (theo module).
4. **Tìm theo vị trí (geo)** — gần tôi, bán kính, bbox (bản đồ), gom cụm.
5. **Đồng bộ bản đồ ↔ danh sách** — hover/nhấp card ↔ pin.
6. **Sắp xếp** — liên quan, khoảng cách, đánh giá, mới.
7. **Không dấu (unaccent) & chuẩn hóa** — "bai sao" = "Bãi Sao".
8. **Trạng thái 0 kết quả** — CTA đóng góp + ghi nhận tín hiệu (SearchAnalytics).
9. **Đánh chỉ mục (indexing)** — cập nhật khi nội dung duyệt/sửa; reindex thủ công.

## 4. Use case

| UC | Tên | Actor | Mô tả |
|---|---|---|---|
| UC-S1 | Tìm theo từ khóa | Guest | Nhập truy vấn → kết quả liên hợp + bản đồ. |
| UC-S2 | Gợi ý khi gõ | Guest | Autocomplete prefix. |
| UC-S3 | Lọc & sắp xếp | Guest | Lọc loại/giá/rating/khu vực/đang mở; sắp xếp. |
| UC-S4 | Tìm gần tôi | Member | Cấp định vị → kết quả bán kính trên bản đồ. |
| UC-S5 | Duyệt trên bản đồ (bbox) | Guest | Kéo/zoom bản đồ → kết quả trong khung nhìn (clustered). |
| UC-S6 | 0 kết quả → đóng góp | Member | CTA "Đóng góp địa điểm này?" ([WF-06/19](../../workflow/contribution.md)). |
| UC-S7 | Dựng lại chỉ mục | Admin | `Search.Reindex` sau thay đổi lớn. |
| UC-S8 | Đọc tín hiệu lỗ hổng | Biên tập/AI | Xem trending + zero-result để tạo nội dung. |

## 5. Luồng người dùng

**Tìm & khám phá (happy path):**
```
Gõ truy vấn (không dấu OK) → suggest → chọn/Enter → Search
   → kết quả liên hợp (card) + bản đồ đồng bộ + bộ lọc
   → lọc loại/giá/rating/khu vực/đang mở → sắp xếp
   → hover card ↔ pin sáng → mở chi tiết (Place/Hotel/...)
```

**Tìm gần tôi (UC-S4):**
```
"Gần tôi" → xin quyền định vị → geo nearby(lat,lng,radius,category)
   → danh sách theo khoảng cách + pin + distance_m → mở chi tiết/chỉ đường
```

**0 kết quả (UC-S6):**
```
Truy vấn → 0 kết quả → ghi SearchAnalytics.zero_result_count++
   → hiển thị CTA đóng góp → (Member) tạo Place/bài viết
   → tín hiệu vào TrendingKeyword.zero_result_rate → gợi ý biên tập/AI
```

## 6. Điều kiện nghiệp vụ

- **BR-S1 — Chỉ trả nội dung công khai:** chỉ index/hiển thị thực thể `published` (không lộ `pending/draft/archived` cho người thường).
- **BR-S2 — Không dấu & chuẩn hóa:** truy vấn & chỉ mục qua unaccent + lowercase + trim + gộp khoảng trắng (khớp chuẩn hóa của SearchAnalytics).
- **BR-S3 — Quyền theo kênh:** Public API chỉ đọc, quota theo key, không PII; `Search.Reindex` chỉ Admin.
- **BR-S4 — Ghi nhận 0 kết quả:** mọi truy vấn 0 kết quả được đếm (aggregate) làm tín hiệu nội dung — **không lưu truy vấn kèm danh tính** (riêng tư).
- **BR-S5 — Đồng bộ chỉ mục:** khi nội dung duyệt/sửa/gộp/archive → cập nhật chỉ mục (near-real-time); dữ liệu bị archive rời chỉ mục.
- **BR-S6 — Bảo vệ hiệu năng:** `q` tối thiểu 1–2 ký tự, sanitize, giới hạn độ dài; suggest cao nhưng nhẹ; search có rate limit.
- **BR-S7 — Geo hợp lệ:** tọa độ/bbox trong phạm vi hợp lý; bbox key theo geohash+zoom để cache.
- **BR-S8 — Không thao túng thứ hạng:** không cho trả phí đẩy thứ hạng (giá trị "công bằng" — [vision.md §5](../../overview/vision.md)); xếp hạng theo liên quan/khoảng cách/chất lượng.

## 7. Quy tắc dữ liệu

- **Nguồn chỉ mục:** Place (+ chuyên biệt), Event, Community — trường tìm được: tên, mô tả, tag, danh mục, khu vực, tọa độ.
- **Công nghệ:** Postgres FTS (GIN, unaccent, cấu hình tiếng Việt) giai đoạn đầu → **Meilisearch/engine chuyên dụng** khi quy mô lớn ([api.md §22](../../api/api.md)).
- **Geo:** truy vấn PostGIS (`nearby`, `bbox`) trả `distance_m` & **clustered points** theo zoom.
- **Chuẩn hóa từ khóa:** đồng nhất với `search_queries_agg.query_normalized` để thống kê gộp đúng ([analytics.md §3.3](../../data/modules/analytics.md)).
- **Tín hiệu:** ghi `search_count`, `zero_result_count`, `click_count`, `result_count_avg` (aggregate, không log thô cá nhân).
- **Caching:** suggest cache prefix TTL ngắn; search cache theo `(q, filters)`; bbox theo geohash+zoom TTL ngắn.
- **Ranking factors:** liên quan văn bản + khoảng cách (nếu có vị trí) + chất lượng (rating/verified) + độ tươi.

## 8. Quan hệ với module khác

| Module | Quan hệ |
|---|---|
| **Place / Hotel / Restaurant / Tour / Event / Community** | Nguồn dữ liệu được đánh chỉ mục & lọc. |
| **Analytics (SearchAnalytics / TrendingKeyword)** | Search phát tín hiệu; Analytics tổng hợp & xếp hạng trending. |
| **AI Assistant** | Dùng zero-result/trending để gợi ý tạo Place ([WF-19](../../workflow/contribution.md)); (tương lai) tìm kiếm ngữ nghĩa/hội thoại. |
| **Map/Geo** | Truy vấn không gian (nearby/bbox), đồng bộ bản đồ. |
| **Trang chủ / Discovery** | Ô tìm kiếm, chips danh mục, TrendingKeyword ([discovery.md P1/P7](../discovery.md)). |

## 9. KPI của module

| Nhóm | KPI | Định nghĩa / Mục tiêu |
|---|---|---|
| Hiệu quả | Tỷ lệ tìm kiếm có click (CTR) | Kết quả đúng nhu cầu — mục tiêu cao. |
| Chất lượng | **Tỷ lệ 0 kết quả** (zero-result rate) | Lỗ hổng nội dung — mục tiêu **giảm** theo thời gian. |
| Hiệu năng | Độ trễ tìm kiếm p95 | Trải nghiệm nhanh — mục tiêu < 300ms (cache). |
| Khám phá | Tỷ lệ mở chi tiết từ kết quả/bản đồ | Search dẫn tới khám phá thực. |
| Khám phá | Tỷ lệ dùng "gần tôi"/bbox (geo) | Mức dùng bản đồ. |
| Bồi đắp | Số Place/bài viết tạo từ tín hiệu 0-kết-quả | Search nuôi nội dung. |
| Hệ sinh thái | Lượt truy vấn qua Public API | Giá trị API bên thứ ba. |

---

*Tài liệu liên quan: [analytics.md](../../data/modules/analytics.md) (SearchAnalytics/TrendingKeyword), [place.md](place.md), [ai-assistant.md](ai-assistant.md), [api.md](../../api/api.md) §22, [contribution.md](../../workflow/contribution.md) (WF-19), [discovery.md](../discovery.md) (P1, P7).*
