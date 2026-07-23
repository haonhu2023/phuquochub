# PhuQuocHub — Thiết kế nhóm `Analytics` (Số liệu & Thống kê)

> Tài liệu này chỉ **thiết kế** (không code). Thiết kế nhóm phân tích: `PageView`, `PlaceView`, `SearchAnalytics`, `PopularPlace`, `TrendingKeyword`. Mục tiêu: **không lưu log chi tiết**, **tổng hợp sẵn** để dashboard đọc nhanh.

## 1. Nguyên tắc thiết kế — "aggregate-first"

Analytics **không phải** bảng nghiệp vụ. Nếu lưu mỗi lượt xem/tìm kiếm thành một dòng, bảng phình hàng chục triệu dòng/tháng, dashboard join chậm, và ta ôm rủi ro riêng tư khi giữ log hành vi từng người.

Bốn nguyên tắc:

1. **Không giữ log thô lâu dài.** Sự kiện chi tiết chỉ tồn tại trong **buffer đếm tạm** (Redis), TTL ngắn; sau khi gộp thì bỏ. Bảng bền chỉ chứa **số đã cộng dồn theo mốc thời gian**.
2. **Tổng hợp theo tầng thời gian (rollup).** `giờ → ngày → tháng`: mốc mịn giữ ngắn hạn, mốc thô giữ lâu → dữ liệu tăng **tuyến tính chậm**, không theo lưu lượng.
3. **Dashboard chỉ đọc bảng đã tính sẵn.** Xếp hạng (`PopularPlace`, `TrendingKeyword`) là **bảng materialized** do job dựng định kỳ — trang chủ/dashboard chỉ `SELECT ... ORDER BY rank LIMIT n`.
4. **Riêng tư mặc định.** Không lưu IP/user-id theo từng sự kiện. Số **khách duy nhất** ước lượng bằng **HyperLogLog** (sketch nhỏ, không truy ngược cá nhân) — phù hợp mục Privacy của nền tảng.

## 2. Kiến trúc luồng dữ liệu

```
   Client (beacon sự kiện: view / search)
        │  gửi phi chặn (sendBeacon)
        ▼
   ┌──────────────────────────────────────────────┐
   │  BUFFER TẠM — Redis (TTL ngắn, KHÔNG bền)     │
   │  · INCR  đếm lượt theo khóa (ngày|place|page) │
   │  · PFADD HyperLogLog cho khách duy nhất       │
   │  · ZINCRBY sorted-set top-N tức thời          │
   └───────────────────────┬──────────────────────┘
        job flush (5–60')   │  gộp & xoá khỏi buffer
                            ▼
   ┌──────────────────────────────────────────────┐
   │  BẢNG TỔNG HỢP (bền, partition theo tháng)    │
   │  page_views_agg · place_views_agg · search_queries_agg
   │  rollup: hour → day → month, prune mốc mịn cũ │
   └───────────────────────┬──────────────────────┘
        job ranking (15'–1h)│
                            ▼
   ┌──────────────────────────────────────────────┐
   │  BẢNG XẾP HẠNG (materialized, nhỏ)            │
   │  popular_places · trending_keywords           │
   └───────────────────────┬──────────────────────┘
                            ▼
                     DASHBOARD / Trang chủ  (đọc bảng nhỏ, đã sắp xếp)
```

**Phân vai 5 thực thể:**

| Thực thể | Tầng | Vai trò |
|---|---|---|
| `PageView` | Tổng hợp | Lưu lượng **theo loại trang / đường dẫn** (sức khỏe site) |
| `PlaceView` | Tổng hợp | Lượt xem **theo từng địa điểm** theo thời gian (dashboard chủ cơ sở + đầu vào xếp hạng) |
| `SearchAnalytics` | Tổng hợp | Từ khóa tìm kiếm đã chuẩn hóa + tỉ lệ 0 kết quả |
| `PopularPlace` | Xếp hạng (dẫn xuất) | Bảng "địa điểm nổi bật" tính sẵn từ `PlaceView` |
| `TrendingKeyword` | Xếp hạng (dẫn xuất) | Bảng "từ khóa đang lên" tính sẵn từ `SearchAnalytics` |

## 3. Bảng tổng hợp

Điểm chung: cột `granularity` (`hour, day, month`) + `bucket_start` (mốc đầu khoảng) + `UNIQUE(chiều, granularity, bucket_start)`. Job flush dùng **UPSERT** cộng dồn. Bảng **partition theo `bucket_start`** (tháng) để xóa mốc cũ bằng `DROP PARTITION` (rẻ).

### 3.1 `page_views_agg` — PageView

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID (PK) | |
| `granularity` | ENUM | `hour, day, month` |
| `bucket_start` | TIMESTAMPTZ | Mốc đầu khoảng (vd `2026-07-11T09:00`) |
| `page_type` | ENUM | `home, place, category, search, community, topic, other` |
| `entity_id` | UUID | Id đối tượng nếu có (place/category…), null với trang chung |
| `path_hash` | CHAR(16) | Băm đường dẫn (nhóm URL mà không lưu URL thô đầy đủ) |
| `views` | BIGINT | Tổng lượt xem trong khoảng |
| `unique_visitors` | INT | Khách duy nhất (từ HLL) |
| `uniques_hll` | BYTEA | Sketch HLL để **gộp** khi rollup lên mốc thô (không cộng thô 2 lần) |
| `created_at / updated_at` | TIMESTAMPTZ | |

`UNIQUE(granularity, bucket_start, page_type, entity_id)`; index `(page_type, bucket_start)`.

### 3.2 `place_views_agg` — PlaceView

Chuỗi thời gian **theo từng địa điểm** — tách khỏi `PageView` vì query khác hẳn (dashboard 1 địa điểm, và là đầu vào xếp hạng phổ biến).

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID (PK) | |
| `granularity` | ENUM | `hour, day, month` |
| `bucket_start` | TIMESTAMPTZ | |
| `place_id` | UUID (FK → places) | |
| `views` | BIGINT | Lượt xem |
| `unique_visitors` | INT | Khách duy nhất (HLL) |
| `uniques_hll` | BYTEA | Sketch để gộp |
| `source` | ENUM | Nguồn truy cập: `map, search, direct, community, external` (tùy chọn, để phân tích kênh) |
| `created_at / updated_at` | TIMESTAMPTZ | |

`UNIQUE(granularity, bucket_start, place_id, source)`; index `(place_id, bucket_start)`, `(bucket_start)`.

### 3.3 `search_queries_agg` — SearchAnalytics

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID (PK) | |
| `granularity` | ENUM | `hour, day, month` |
| `bucket_start` | TIMESTAMPTZ | |
| `query_normalized` | VARCHAR(120) | Từ khóa **chuẩn hóa**: lowercase + `unaccent` + trim + gộp khoảng trắng |
| `search_count` | BIGINT | Số lượt tìm |
| `zero_result_count` | BIGINT | Số lượt **0 kết quả** (lỗ hổng nội dung → gợi ý tạo địa điểm/bài viết) |
| `click_count` | BIGINT | Số lượt tìm dẫn tới một click kết quả |
| `result_count_avg` | NUMERIC(8,1) | Trung bình số kết quả trả về |
| `created_at / updated_at` | TIMESTAMPTZ | |

`UNIQUE(granularity, bucket_start, query_normalized)`; index `(bucket_start, search_count DESC)`.

> Chuẩn hóa từ khóa là mấu chốt: "Bãi Sao", "bai sao", "BÃI  SAO" phải gộp về **một** dòng, nếu không thống kê vô nghĩa và bảng phình.

## 4. Bảng xếp hạng (materialized)

Do job dựng lại định kỳ, **ghi đè** theo `period`. Nhỏ (vài trăm dòng), có index theo `rank` → dashboard đọc tức thời.

### 4.1 `popular_places` — PopularPlace

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID (PK) | |
| `period` | ENUM | `24h, 7d, 30d, all` — cửa sổ tính |
| `place_id` | UUID (FK → places) | |
| `rank` | INT | Hạng trong `period` |
| `score` | NUMERIC(12,4) | Điểm phổ biến (§6) |
| `views` | BIGINT | Lượt xem trong cửa sổ |
| `unique_visitors` | INT | Khách duy nhất trong cửa sổ |
| `delta_rank` | INT | Thay đổi hạng so lần tính trước (↑/↓ trên UI) |
| `computed_at` | TIMESTAMPTZ | |

`UNIQUE(period, place_id)`; index `(period, rank)`.

### 4.2 `trending_keywords` — TrendingKeyword

"Trending" = **tốc độ tăng**, không phải tổng lượt (nếu chỉ theo tổng thì mãi là các từ phổ biến cũ).

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID (PK) | |
| `period` | ENUM | `24h, 7d` — cửa sổ hiện tại |
| `keyword` | VARCHAR(120) | Từ khóa đã chuẩn hóa |
| `rank` | INT | Hạng |
| `current_count` | BIGINT | Lượt tìm cửa sổ hiện tại |
| `previous_count` | BIGINT | Lượt tìm cửa sổ liền trước (so sánh) |
| `growth_score` | NUMERIC(10,4) | Điểm xu hướng (§6) |
| `zero_result_rate` | NUMERIC(4,3) | Tỉ lệ 0 kết quả — từ "đang lên" mà thiếu nội dung = **cơ hội biên tập** |
| `computed_at` | TIMESTAMPTZ | |

`UNIQUE(period, keyword)`; index `(period, rank)`.

## 5. Khách duy nhất không cần log — HyperLogLog

Để đếm **khách duy nhất** mà không lưu ai đã xem:
- Trong buffer: `PFADD hll:place:{id}:{day} {visitor_key}` (visitor_key = hash phiên, không phải danh tính).
- Khi flush: đọc `PFCOUNT` → `unique_visitors`, và lưu **sketch nhị phân** vào `uniques_hll`.
- Khi rollup `day → month` hoặc tính cửa sổ 7/30 ngày: **gộp sketch** (`PFMERGE` / `hll_union`) rồi đếm → uniques chính xác ~±2% **mà không cộng trùng**, không giữ dòng cá nhân nào.

→ Vừa đạt "không lưu log chi tiết", vừa cho số khách duy nhất theo mọi cửa sổ. (Postgres: extension `hll`; hoặc chỉ dùng Redis rồi lưu số đã đếm nếu không cần gộp lại.)

## 6. Công thức xếp hạng (job tính)

**PopularPlace — phổ biến có suy giảm theo thời gian** (ưu tiên nóng gần đây, không để địa điểm cũ đứng mãi):
```
score = Σ_ngày ( views_d · e^(−λ · tuổi_ngày) )         (λ ≈ 0.1)
      + w_u · unique_visitors_window
      + w_e · rating_avg · ln(1 + rating_count)          (gắn chất lượng)
```

**TrendingKeyword — vận tốc chuẩn hóa** (chặn nhiễu do số nhỏ):
```
growth_score = (current_count − previous_count) / sqrt(previous_count + k)     (k ≈ 5)
```
`k` làm mượt: từ khóa nhảy 1→3 lượt không thể vượt từ 400→650 lượt. Lọc `current_count ≥ ngưỡng tối thiểu` trước khi xếp hạng.

## 7. Lưu giữ & dọn dữ liệu (retention)

| Tầng | Giữ | Sau đó |
|---|---|---|
| Buffer Redis (sự kiện thô) | Vài giờ | Flush xong → **xóa** |
| `*_agg` granularity=`hour` | ~14–30 ngày | Rollup lên `day`, `DROP` partition cũ |
| `*_agg` granularity=`day` | ~13–25 tháng | Rollup lên `month` |
| `*_agg` granularity=`month` | Dài hạn | Nhỏ, giữ để xem xu hướng năm |
| `popular_places` / `trending_keywords` | Chỉ ảnh chụp hiện tại | Ghi đè mỗi lần chạy (muốn lịch sử → giữ thêm theo `computed_at`) |

→ Dung lượng tăng theo **số địa điểm × số mốc**, **không** theo lưu lượng truy cập.

## 8. Truy vấn mẫu

```sql
-- Trang chủ: 10 địa điểm nổi bật 7 ngày (đọc bảng đã tính sẵn)
SELECT place_id, rank, delta_rank
FROM popular_places WHERE period = '7d' ORDER BY rank LIMIT 10;

-- Từ khóa đang lên trong 24h
SELECT keyword, current_count, growth_score, zero_result_rate
FROM trending_keywords WHERE period = '24h' ORDER BY rank LIMIT 10;

-- Dashboard 1 địa điểm: lượt xem 30 ngày (đường biểu đồ)
SELECT bucket_start::date AS day, SUM(views) AS views
FROM place_views_agg
WHERE place_id = :id AND granularity = 'day'
  AND bucket_start >= now() - interval '30 days'
GROUP BY 1 ORDER BY 1;
```

Không truy vấn nào quét log thô — đều đọc bảng tổng hợp/xếp hạng nhỏ.

## 9. Quyết định cần chốt

1. **Nơi đặt buffer:** Redis (khuyến nghị — có sẵn `INCR/PF*`) hay bảng `raw_events` giữ ngắn ngày rồi drop (dễ tái xử lý, tốn hơn)?
2. **HLL trong Postgres** (extension `hll`, gộp cửa sổ chính xác) hay chỉ lưu số đếm từ Redis (đơn giản, không gộp lại được)?
3. **Nhịp job:** flush buffer mỗi bao lâu (real-time 1' vs 15'), và ranking mỗi 15'/1h — đánh đổi độ tươi vs tải?
4. **Cửa sổ chuẩn** cho `period` (24h/7d/30d) và các trọng số `λ, w_u, w_e, k` — chốt giá trị khởi tạo và cho phép tinh chỉnh sau.

---

*Tài liệu liên quan: [database.md](../database.md), [architecture.md](../../architecture/architecture.md), [module-places-db.md](./places.md), [vision.md](../../overview/vision.md)*
