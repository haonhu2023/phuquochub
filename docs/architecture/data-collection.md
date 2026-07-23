# PhuQuocHub — Kiến trúc Thu thập Dữ liệu (Data Collection Architecture)

> **Trạng thái: OUTLINE (khung).** Đây là **tài liệu kiến trúc dữ liệu** — *không* phải tài liệu kỹ thuật: **không** code, **không** SQL, **không** thiết kế API, **không** schema DB. Tài liệu này định hình *chiến lược & luồng* thu thập dữ liệu; chi tiết từng phần bổ sung sau. Liên quan: [database.md](../data/database.md), [source.md](../data/modules/source.md), [verification.md](../data/modules/verification.md), [moderation.md](../workflow/moderation.md), [search.md](./search.md), [ai-architecture.md](../ai/ai-architecture.md).

---

## 1. Mục tiêu

- **Vì sao cần Data Collection Architecture:** *(khung)*
  - Thông tin Phú Quốc phân mảnh, thiếu tin cậy → cần một quy trình **thu thập có kiểm soát, có nguồn, có xác minh**.
  - Bảo đảm dữ liệu **chính xác · đầy đủ · cập nhật · không trùng** ở quy mô lớn.
  - Kết hợp nhiều nguồn (mở, chính thức, cộng đồng, AI) mà vẫn giữ **provenance** & **trust**.
- **Mục tiêu dài hạn của PhuQuocHub:** *(khung)*
  - Trở thành **nguồn tri thức mở, đáng tin** cho Phú Quốc (Wikipedia + Reddit + Google Maps).
  - Dữ liệu **có phiên bản, truy vết nguồn, cộng đồng cùng làm giàu**, sẵn sàng mở API/dữ liệu mở.

## 2. Kiến trúc tổng thể

**Luồng dữ liệu (pipeline):**
```
        Data Source
            ↓
       Data Collection
            ↓
       Data Validation
            ↓
     Duplicate Detection
            ↓
          Merge
            ↓
       AI Analysis
            ↓
     Moderator Review
            ↓
         Publish
            ↓
     Community Update
            ↓
        Versioning
            ↓
        Audit Log
```

**Vai trò từng chặng (một dòng — khung):**
| Chặng | Vai trò |
|---|---|
| Data Source | Nơi dữ liệu đến (mục 3) |
| Data Collection | Tiếp nhận/ingest theo từng loại nguồn |
| Data Validation | Kiểm tra tính hợp lệ & chuẩn hóa (mục 4) |
| Duplicate Detection | Phát hiện trùng (mục 5) |
| Merge | Hợp nhất bản ghi trùng theo chiến lược |
| AI Analysis | Phân tích/làm giàu (tóm tắt, phân loại, trích xuất) — đầu ra `pending` |
| Moderator Review | Người duyệt (human-in-the-loop) |
| Publish | Công khai nội dung đã duyệt |
| Community Update | Cộng đồng tiếp tục đóng góp/sửa |
| Versioning | Lưu phiên bản mỗi thay đổi |
| Audit Log | Ghi vết mọi hành động đặc quyền/đổi trạng thái |

## 3. Nguồn dữ liệu

> Mỗi nguồn mô tả theo: **Ưu điểm · Hạn chế · Độ tin cậy · Chu kỳ cập nhật** *(khung — điền chi tiết sau)*.

- **OpenStreetMap (OSM)** — Ưu điểm: … · Hạn chế: … · Độ tin cậy: … · Chu kỳ: …
- **Website chính thức** — …
- **Doanh nghiệp tự khai báo** — …
- **Người dùng đóng góp** — …
- **Facebook** — …
- **Google Business Profile** — *chỉ tham chiếu công khai, **không sao chép dữ liệu có bản quyền*** — …
- **Đối tác (Partner)** — …
- **CSV Import** — …
- **API** — …
- **AI Extraction** — …

*(Ghi chú khung: bảng so sánh 4 tiêu chí + chính sách bản quyền/attribution (OSM ODbL) sẽ bổ sung.)*

## 4. Chuẩn hóa dữ liệu

*(khung — nguyên tắc chuẩn hóa cho từng trường)*
- **Tên** — …
- **Địa chỉ** — …
- **GPS** — …
- **Danh mục** — …
- **Liên hệ** — …
- **Giờ mở cửa** — …
- **Giá** — …
- **Media** — …

## 5. Chống dữ liệu trùng

*(khung)*
- **Duplicate Detection** — …
- **Place Matching** — …
- **Geocoding** — …
- **Reverse Geocoding** — …
- **Similarity Score** — …
- **Merge Strategy** — …

## 6. Data Quality

*(khung — hệ điểm chất lượng & tin cậy)*
- **Quality Score** — …
- **Freshness Score** — …
- **Trust Score** — …
- **Verification Level** — …

## 7. Community Contribution

*(khung — vòng đóng góp cộng đồng)*
```
Người dùng đóng góp → AI kiểm tra → Moderator duyệt → Lưu Version
```
- Người dùng đóng góp dữ liệu — …
- AI kiểm tra (đề xuất, `pending`) — …
- Moderator duyệt (human-in-the-loop) — …
- Lưu Version (phiên bản + provenance) — …

## 8. Data Lifecycle

*(khung — vòng đời dữ liệu)*
- Các trạng thái & chuyển tiếp (thu thập → chuẩn hóa → duyệt → công khai → cập nhật → lưu trữ) — …
- Chính sách độ tươi/làm mới, đánh dấu lỗi thời, thu hồi/archive — …

## 9. KPI

*(khung — ví dụ chỉ số)*
- Cột mốc độ phủ: **1.000 Place → 10.000 Place** — …
- **Tỷ lệ trùng** (duplicate rate) — …
- **Tỷ lệ xác minh** (verified rate) — …
- **Thời gian cập nhật** (freshness / thời gian duyệt) — …

## 10. Roadmap

*(khung)*
- **Giai đoạn MVP** — …
- **Giai đoạn Scale** — …

---

## Điểm cần quyết định sau (open questions)

*(khung — chốt khi đi vào chi tiết)*
- Nguồn nào bật ở MVP vs Scale; chính sách bản quyền/attribution mỗi nguồn.
- Thuật toán/ngưỡng cho Similarity Score & Merge Strategy.
- Công thức Quality/Freshness/Trust Score và ánh xạ Verification Level.
- Provider geocoding/reverse-geocoding.
- Nhịp cập nhật & cơ chế phát hiện dữ liệu lỗi thời.

---

*Tài liệu liên quan: [architecture.md](./architecture.md), [database.md](../data/database.md), [source.md](../data/modules/source.md), [verification.md](../data/modules/verification.md), [moderation.md](../workflow/moderation.md), [contribution.md](../workflow/contribution.md), [search.md](./search.md), [ai-architecture.md](../ai/ai-architecture.md), [vision.md](../overview/vision.md).*
