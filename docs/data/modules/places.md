# PhuQuocHub — Thiết kế Database Module Địa điểm (Places)

> Tài liệu này chỉ **thiết kế** (không code). Nó chi tiết hóa phần `places` đã nêu trong [database.md](../database.md).

## 1. Nguyên tắc thiết kế

1. **Chuẩn hóa hợp lý:** dữ liệu 1–1 nằm trong bảng `places`; dữ liệu 1–N (ảnh, video, FAQ, vé) tách bảng riêng.
2. **Dữ liệu địa lý hạng nhất:** GPS lưu kiểu PostGIS `GEOGRAPHY(Point, 4326)`, có index GIST.
3. **Dữ liệu bán cấu trúc:** giờ mở cửa dùng `JSONB` (linh hoạt, ít bảng phụ).
4. **Phân biệt nguồn nội dung:** dữ liệu do người dùng nhập vs dữ liệu do **AI sinh** (có provenance riêng) — provenance đầy đủ theo trường/phiên bản thiết kế trong [module-source.md](./source.md).
5. **Sẵn sàng SEO & phiên bản:** SEO tách nhóm rõ ràng; hỗ trợ versioning cho nội dung (theo vision Wikipedia).
6. **Đặt tên:** `snake_case`, bảng số nhiều, mọi bảng có `id (UUID)`, `created_at`, `updated_at`, `deleted_at` (soft delete).

## 2. Sơ đồ quan hệ (ERD)

```
categories ──1:N── places ──1:N── media              (ảnh/video, exclusive arc)
                     │      ├─1:N── contacts          (liên hệ, polymorphic owner=place)
                     │      ├─1:N── place_faqs
                     │      ├─1:N── price_history     (giá, polymorphic entity=place)
                     │      ├─1:1── place_seo
                     │      ├─1:1── place_ai_summary
                     │      └─1:N── wiki_revisions    (lịch sử phiên bản, polymorphic entity=place)
users ──────────────┘ (created_by / updated_by)
```

## 3. Bảng chính: `places`

> **Nguồn sự thật duy nhất (ADR-001, B7):** bảng dưới đây là **định nghĩa authoritative duy nhất** của entity Place (field, kiểu, nullable, unique, FK, index, audit). [database.md §3.3](../database.md) chỉ giữ tổng quan + quan hệ và **trỏ về đây** — không định nghĩa lại schema.
>
> **Nguyên tắc:** Place chỉ chứa **dữ liệu ổn định** hoặc **cache đọc nhanh** (job-synced). Dữ liệu biến động nằm ở entity vệ tinh: `contacts` (ADR-005) · `price_history` (ADR-006) · `media` (ADR-009) · `wiki_revisions` (ADR-014, kiêm lịch sử trạng thái — WF-14) · `reviews` · `verifications` (ADR-008).
>
> **Quy ước chống drift (B7):** đây là bảng cột **duy nhất** của Place. **Mọi tài liệu khác** (database.md, api.md, product/*, ADR, discovery…) **PHẢI trỏ về mục này**, **không chép lại** bảng cột. Trường mở rộng theo loại (Hotel/Restaurant/Tour) đăng ký ở **§13**, không thêm cột vào `places`.

| Cột | Kiểu | Null | Mô tả |
|---|---|---|---|
| `id` | UUID (PK) | ✗ | Khóa chính |
| `name` | VARCHAR(200) | ✗ | **Tên** địa điểm |
| `slug` | VARCHAR(220) UNIQUE | ✗ | **Slug** cho URL (auto từ tên + hậu tố nếu trùng) |
| `category_id` | UUID (FK → categories) | ✗ | **Danh mục** |
| `location` | GEOGRAPHY(Point, 4326) | ✗ | **GPS** (lng, lat) |
| `address` | VARCHAR(300) | ✓ | **Địa chỉ** dạng chữ |
| `ward` | VARCHAR(120) | ✓ | Phường/xã (ngữ cảnh Phú Quốc) |
| `description` | TEXT | ✓ | **Mô tả** (Markdown/rich text) |
| `short_description` | VARCHAR(300) | ✓ | Mô tả ngắn cho card/list |
| `opening_hours` | JSONB | ✓ | **Giờ mở cửa** (xem mục 4) |
| `price_range` | ENUM | ✓ | Tóm tắt mức giá: `free, low, mid, high` |
| `cover_image_id` | UUID (FK → media) | ✓ | Ảnh đại diện |
| `rating_avg` | NUMERIC(2,1) | ✓ | Điểm trung bình — **cache job-synced** từ `reviews` (không phải nguồn gốc) |
| `rating_count` | INT default 0 | ✗ | Số lượt đánh giá — cache job-synced |
| `view_count` | BIGINT default 0 | ✗ | Lượt xem — **cache job-synced** từ [place_views_agg](./analytics.md) (cập nhật theo nhịp job, **không** tăng per-view) |
| `status` | ENUM | ✗ | `draft, pending, published, archived` |
| `verification_status` | ENUM | ✗ | Cache xác minh: `pending, verified, official, community_verified, expired, rejected` (default `pending`) — [verification.md §6](verification.md) |
| `verified_at` | TIMESTAMPTZ | ✓ | Thời điểm đạt trạng thái tin cậy gần nhất |
| `osm_id` | BIGINT | ✓ | Liên kết nguồn OpenStreetMap |
| `created_by` | UUID (FK → users) | ✓ | Người tạo |
| `updated_by` | UUID (FK → users) | ✓ | Người sửa cuối |
| `created_at` | TIMESTAMPTZ | ✗ | |
| `updated_at` | TIMESTAMPTZ | ✗ | |
| `deleted_at` | TIMESTAMPTZ | ✓ | Soft delete |

**Ghi chú trường liên hệ (ADR-005):** mọi thông tin liên hệ (`hotline/phone/website/email/facebook/zalo…`) **không** còn để inline trên `places` mà nằm ở bảng dùng chung **`contacts`** (polymorphic `owner_type='place'`, `owner_id=places.id`) — [database.md §3.14](../database.md). Hỗ trợ nhiều giá trị/kênh + xác minh từng liên hệ.

**Index:**
```
GIST  (location)                  -- truy vấn không gian
UNIQUE(slug)
BTREE (category_id, status)
BTREE (status) WHERE deleted_at IS NULL
GIN   FTS(name + description) — tìm kiếm văn bản (unaccent, tiếng Việt)
```

## 4. Giờ mở cửa — cấu trúc `opening_hours` (JSONB)

Linh hoạt cho ngày thường, cuối tuần, 24/7, đóng cửa, và ngày đặc biệt.

```jsonc
{
  "timezone": "Asia/Ho_Chi_Minh",
  "regular": {
    "mon": [{ "open": "08:00", "close": "22:00" }],
    "tue": [{ "open": "08:00", "close": "22:00" }],
    "wed": [{ "open": "08:00", "close": "22:00" }],
    "thu": [{ "open": "08:00", "close": "22:00" }],
    "fri": [{ "open": "08:00", "close": "23:00" }],
    "sat": [{ "open": "07:00", "close": "23:00" }],
    "sun": []                       // rỗng = đóng cửa
  },
  "is_24h": false,
  "exceptions": [                   // ngày đặc biệt / lễ tết
    { "date": "2026-01-01", "closed": true, "note": "Nghỉ Tết Dương lịch" },
    { "date": "2026-02-17", "hours": [{ "open": "10:00", "close": "20:00" }] }
  ],
  "note": "Bếp ngừng nhận order trước giờ đóng 30 phút"
}
```

- Nhiều khung giờ/ngày (nghỉ trưa) → mảng nhiều object `{open, close}`.
- Không truy vấn nặng theo giờ ở giai đoạn đầu → JSONB đủ; nếu cần lọc "đang mở cửa" theo thời gian thực ở quy mô lớn, cân nhắc tách bảng `place_hours`.

## 5. Giá — bảng `price_history` (dùng chung, polymorphic)

> **Cập nhật (ADR-006):** `place_tickets` đã được **thay hoàn toàn** bằng bảng chung **`price_history`** (polymorphic, append-only) — thiết kế đầy đủ (trường + index) ở [database.md §3.15](../database.md).

- Giá của một Place = các bản ghi `price_history` với `entity_type='place'`, `entity_id=places.id`; **"giá hiện hành"** = bản ghi đang trong `[valid_from, valid_to]`.
- Trường menu (`service_name`, `unit`, `is_free`, `display_order`, `description`) đã chuyển vào `price_history`; **ghi bản mới, không ghi đè** (giữ lịch sử).
- `places.price_range` (ENUM thô `free/low/mid/high`) **giữ lại** làm bộ lọc nhanh.

## 6. Ảnh & Video — bảng `media` (exclusive arc)

> **Cập nhật (ADR-009):** `place_media` đã được **retire hoàn toàn**. Ảnh/video của Place (và Review/Community/Business) dùng **một bảng chung `media`** theo **exclusive arc** — thiết kế đầy đủ (trường + `CHECK` đúng-một + index) ở [database.md §3.5](../database.md).

- Ảnh/video của một Place = bản ghi `media` có `place_id` (các FK `review_id/post_id/business_id` = NULL).
- Ảnh đại diện: `places.cover_image_id → media`.
- Trường giàu (`thumbnail_url`, `provider` `upload/youtube/vimeo`, `external_id`, `duration`, `caption`, `alt_text`, `sort_order`, `status`, `ai_moderation_score`/`ai_labels`) đã chuyển vào `media`.
- **Không** dùng `owner_type/owner_id` (không polymorphic); không lưu nhị phân trong DB — chỉ URL tới object storage (S3/MinIO).

## 7. FAQ — bảng `place_faqs`

| Cột | Kiểu | Mô tả |
|---|---|---|
| `id` | UUID (PK) | |
| `place_id` | UUID (FK → places) | |
| `question` | VARCHAR(300) | Câu hỏi |
| `answer` | TEXT | Trả lời |
| `sort_order` | INT | Thứ tự |
| `is_ai_generated` | BOOLEAN | FAQ do AI gợi ý (chờ duyệt) |
| `status` | ENUM | `pending, published, hidden` |
| `created_by` | UUID (FK → users) | |
| `created_at / updated_at` | TIMESTAMPTZ | |

- Dùng để render khối FAQ trên trang + sinh **FAQ Schema (JSON-LD)** cho SEO.

## 8. SEO — bảng `place_seo` (1–1 với places)

Tách riêng vì SEO có nhiều trường, ít khi query cùng dữ liệu chính, và có thể tự sinh.

| Cột | Kiểu | Mô tả |
|---|---|---|
| `place_id` | UUID (PK, FK → places) | 1–1 |
| `meta_title` | VARCHAR(160) | Tiêu đề SEO |
| `meta_description` | VARCHAR(320) | Mô tả SEO |
| `meta_keywords` | VARCHAR(300) | (tùy chọn) |
| `canonical_url` | VARCHAR(300) | URL chuẩn |
| `og_title` | VARCHAR(160) | Open Graph |
| `og_description` | VARCHAR(320) | Open Graph |
| `og_image_url` | VARCHAR(500) | Ảnh share mạng xã hội |
| `no_index` | BOOLEAN default false | Chặn index nếu cần |
| `structured_data` | JSONB | JSON-LD (schema.org: TouristAttraction/Restaurant…) |
| `updated_at` | TIMESTAMPTZ | |

- Nếu `place_seo` trống, hệ thống **fallback** tự sinh meta từ `name`, `short_description`, `cover_image`.

## 9. AI Summary — bảng `place_ai_summary` (1–1 với places)

Tách riêng để lưu **provenance** (nguồn gốc AI) và không trộn lẫn với nội dung do người viết.

| Cột | Kiểu | Mô tả |
|---|---|---|
| `place_id` | UUID (PK, FK → places) | 1–1 |
| `summary` | TEXT | Tóm tắt do AI sinh |
| `highlights` | JSONB | Danh sách điểm nổi bật (bullet) |
| `model` | VARCHAR(80) | Model đã dùng (vd `claude-...`) |
| `prompt_version` | VARCHAR(40) | Phiên bản prompt |
| `source_hash` | VARCHAR(64) | Hash nội dung nguồn → biết khi cần sinh lại |
| `language` | CHAR(2) | `vi`, `en` |
| `status` | ENUM | `generating, ready, stale, rejected` |
| `is_approved` | BOOLEAN | Đã được người kiểm duyệt duyệt |
| `generated_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

- `status = stale` khi nội dung gốc đổi (so `source_hash`) → job nền sinh lại.
- Cho phép **song ngữ**: nếu cần nhiều ngôn ngữ, chuyển thành 1–N với khóa `(place_id, language)`.

## 10. Lịch sử phiên bản — `wiki_revisions`

> **Chốt (ADR-014):** phiên bản/lịch sử của Place dùng thực thể chung **`wiki_revisions`** (polymorphic `entity_type/entity_id`, có trích nguồn) — thiết kế đầy đủ ở [source.md §6](./source.md). Phác thảo `place_revisions` cũ đã **retire** (legacy — không còn là entity hoạt động).

- Lịch sử của một Place = các bản ghi `wiki_revisions` với `entity_type='place'`, `entity_id=places.id`; mỗi bản ghi có `snapshot`, `change_note`, `origin`, `editor_id`, `status` + trích nguồn qua `source_attributions(entity_type='wiki_revision')`.
- Theo định hướng "Wikipedia" ([vision.md](../../overview/vision.md)): xem diff / khôi phục qua `Revision.Revert`; mở rộng cho `topic/area` sau này **không đổi schema**.

## 11. Tổng hợp trường theo yêu cầu

| Yêu cầu | Nơi lưu |
|---|---|
| Tên | `places.name` |
| Slug | `places.slug` |
| Danh mục | `places.category_id → categories` |
| GPS | `places.location` (PostGIS) |
| Địa chỉ | `places.address`, `places.ward` |
| Mô tả | `places.description`, `places.short_description` |
| Giờ mở cửa | `places.opening_hours` (JSONB) |
| Giá | `price_history` (entity=place) (+ `places.price_range` tóm tắt) |
| Liên hệ (hotline/phone/website/email/facebook/zalo…) | `contacts` (owner_type=place) |
| Ảnh | `media` (place_id, type=image) |
| Video | `media` (place_id, type=video) |
| FAQ | `place_faqs` |
| SEO | `place_seo` |
| AI Summary | `place_ai_summary` |

## 12. Quyết định cần chốt

1. **Đa ngôn ngữ:** dịch `name/description` sang tiếng Anh → cần bảng `place_translations (place_id, language, ...)` hay giữ đơn ngữ giai đoạn đầu?
2. **Contact:** ✅ **Đã chốt (ADR-005)** — dùng bảng chung `contacts` (polymorphic `owner_type/owner_id`), bỏ cột inline. Xem [database.md §3.14](../database.md).
3. **Versioning:** ✅ **Đã chốt (ADR-014)** — dùng `wiki_revisions` (chung, polymorphic); `place_revisions` đã retire. Xem [source.md §6](./source.md).

## 13. Bảng mở rộng theo loại (Place chuyên biệt — **schema thi hành**)

> **Nguồn sự thật (authoritative) cho phần mở rộng Place.** Hotel/Restaurant/Tour là **Place chuyên biệt** (`category=hotel/restaurant/tour`) — **không** thêm cột vào `places` (§3 bất biến), mà tách **bảng mở rộng** liên kết `place_id` (FK thật + `ON DELETE CASCADE`, **không** polymorphic). Mô hình **satellite** chốt ở **[ADR-002](../../99-decisions/ADR-002-place-extension.md) (Accepted 2026-07-13)** theo [ADR-003](../../99-decisions/ADR-003-no-polymorphic.md). Mọi tài liệu khác (database.md §3.24, erd.md, data-dictionary) **trỏ về mục này**.
>
> **Event KHÔNG ở đây** — Event là thực thể **peer** (Hybrid), định nghĩa tại [database.md §3.22–3.23](../database.md).

### 13.1 Hotel (`category=hotel`)

**`place_hotel_details`** — 1:1 với `places`:

| Cột | Kiểu | Null | Ghi chú |
|---|---|---|---|
| `place_id` | UUID (PK, FK → places) | ✗ | 1:1; `ON DELETE CASCADE` |
| `star_rating` | SMALLINT | ✓ | `CHECK(star_rating BETWEEN 1 AND 5)`; null = chưa xếp (BR-H3) |
| `hotel_type` | ENUM | ✗ | `resort, hotel, homestay, villa, guesthouse, apartment` |
| `check_in` | TIME | ✓ | giờ nhận phòng |
| `check_out` | TIME | ✓ | giờ trả phòng |
| `created_at / updated_at` | TIMESTAMPTZ | ✗ | |

**`hotel_room_types`** — 1:N với `places`:

| Cột | Kiểu | Null | Ghi chú |
|---|---|---|---|
| `id` | UUID (PK) | ✗ | |
| `place_id` | UUID (FK → places) | ✗ | `ON DELETE CASCADE` |
| `name` | VARCHAR(120) | ✗ | vd "Deluxe", "Bungalow" |
| `capacity` | SMALLINT | ✓ | số khách |
| `price_ref` | NUMERIC(12,2) | ✓ | **cache** giá tham khảo/đêm; giá xác minh & lịch sử ở `price_history` (BR-H2) |
| `currency` | CHAR(3) | ✗ | default `VND` |
| `valid_from / valid_to` | TIMESTAMPTZ | ✓ | giá mùa vụ |
| `description` | VARCHAR(300) | ✓ | |
| `sort_order` | INT | ✗ | default 0 |
| `created_at / updated_at` | TIMESTAMPTZ | ✗ | |

**Index:** `(place_id, sort_order)`.

**`amenities`** (từ điển dùng chung) — `id` PK, `code` VARCHAR(60) **UNIQUE**, `label_vi`/`label_en` VARCHAR(120), `icon` VARCHAR(60), `group` VARCHAR(60), timestamps.
**`place_amenities`** (N:N) — PK `(place_id, amenity_id)`, FK→places / →amenities; index `(amenity_id)`. (BR-H4: amenity từ từ điển chuẩn, không nhập tự do.)

### 13.2 Restaurant (`category=restaurant`)

**`place_restaurant_details`** — 1:1 với `places`:

| Cột | Kiểu | Null | Ghi chú |
|---|---|---|---|
| `place_id` | UUID (PK, FK → places) | ✗ | 1:1; `ON DELETE CASCADE` |
| `is_local_specialty` | BOOLEAN | ✗ | default false — có phục vụ đặc sản Phú Quốc |
| `dietary` | JSONB | ✓ | tag chuẩn hóa (`vegetarian/vegan/halal…`) |
| `created_at / updated_at` | TIMESTAMPTZ | ✗ | |

**`restaurant_menu_sections`** — 1:N places — `id` PK, `place_id` FK (`CASCADE`), `name` VARCHAR(120), `sort_order` INT, timestamps. Index `(place_id, sort_order)`.
**`restaurant_menu_items`** — 1:N section — `id` PK, `section_id` FK → `restaurant_menu_sections` (`CASCADE`), `name` VARCHAR(160), `price` NUMERIC(12,2) null, `currency` CHAR(3) default `VND`, `tags` JSONB, `description` VARCHAR(300), `sort_order` INT, timestamps. Index `(section_id, sort_order)`.
**`cuisines`** (từ điển) — `id` PK, `code` UNIQUE, `label_vi`/`label_en`.
**`place_cuisines`** (N:N) — PK `(place_id, cuisine_id)`; index `(cuisine_id)`.

> Ảnh món dùng `media` (`place_id`, `type=image`); "đang mở cửa" **suy diễn** từ `places.opening_hours` (BR-R2), không cột.

### 13.3 Tour (`category=tour`)

**`place_tour_details`** — 1:1 với `places`:

| Cột | Kiểu | Null | Ghi chú |
|---|---|---|---|
| `place_id` | UUID (PK, FK → places) | ✗ | 1:1; `ON DELETE CASCADE` |
| `tour_type` | ENUM | ✗ | `diving, fishing, trekking, sightseeing, cruise, other` |
| `duration_minutes` | INT | ✓ | thời lượng |
| `difficulty` | ENUM | ✓ | `easy, moderate, hard` |
| `organizer_id` | UUID (FK → places) | ✓ | nhà tổ chức = cơ sở đã claim (Place); BR-T5 |
| `created_at / updated_at` | TIMESTAMPTZ | ✗ | |

**`tour_stops`** — 1:N places — `id` PK, `place_id` FK (`CASCADE`), `name` VARCHAR(160), `location` GEOGRAPHY(Point,4326) (BR-T2), `sort_order` INT, `time` VARCHAR(40), `note` VARCHAR(300), timestamps. **Index:** `(place_id, sort_order)`, `GIST(location)`.
**`tour_schedules`** — 1:N places — `id` PK, `place_id` FK (`CASCADE`), `date` DATE, `capacity` INT, `price` NUMERIC(12,2), `currency` CHAR(3) default `VND`, `valid_from/valid_to` TIMESTAMPTZ, timestamps. **Index:** `(place_id, date)`.

### 13.4 Nguyên tắc chung (mọi loại)
- Base Place (§3) **không đổi** khi thêm loại; discriminator = `places.category`; **0 cột thêm vào `places`**.
- FK thật + `ON DELETE CASCADE`; **không** polymorphic (ADR-003).
- Giá **xác minh & lịch sử** dùng `price_history` (ADR-006, `entity_type` `hotel/tour`); `price_ref`/`tour_schedules.price` là **cache hiển thị nhanh** (BR-H2/BR-T6).
- Media/contacts/verifications/wiki_revisions của Hotel/Restaurant/Tour **tái dùng nguyên trạng** trên `place_id`.

---

*Tài liệu liên quan: [database.md](../database.md), [vision.md](../../overview/vision.md), [api.md](../../api/api.md), [ADR-001](../../99-decisions/ADR-001-place-is-core.md) (SSOT), [ADR-002](../../99-decisions/ADR-002-place-extension.md) (mở rộng)*
