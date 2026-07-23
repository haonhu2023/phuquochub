# PhuQuocHub — Data Dictionary (Từ điển dữ liệu)

> **Tài liệu dẫn xuất (derived), KHÔNG phải nguồn sự thật.** Tổng hợp mọi bảng **đã phê duyệt** (Accepted) từ các tài liệu authoritative; mỗi bảng trỏ về nguồn định nghĩa gốc. Khi có khác biệt, **tài liệu nguồn thắng** — cập nhật lại bảng này, không sửa nghĩa ở đây.
>
> **Phạm vi:** 47 thực thể Accepted trong [database.md §11](./database.md) (33 Wave 1 + **14 Wave 2**: 12 bảng mở rộng Place + `events`/`event_occurrences`). Các entity Wave 3–5 (reports, notifications, votes, tokens, api_keys, ai_jobs, tags…) **chưa thiết kế** → xem [Phụ lục B](#phụ-lục-b--thực-thể-chưa-thiết-kế-wave-35).
>
> **Quy ước:** Null `✗`=NOT NULL, `✓`=nullable, ô trống = tài liệu nguồn chưa nêu rõ. Mọi bảng có `id UUID (PK)`. Đặt tên `snake_case`, số nhiều (ngoại lệ satellite 1:1: `place_seo`, `place_ai_summary`). Ngày cập nhật: **2026-07-13**.
>
> ✅ **Naming discriminator — ĐÃ CHUẨN HÓA (B-3, 2026-07-13):** mọi discriminator đa hình (`owner_type`, `entity_type` trên `contacts`, `price_history`, `source_attributions`, `wiki_revisions`, `audit_logs`) dùng **`lowercase snake_case`** thống nhất (`place, business, hotel, tour, event, review, post, …`). **Không** còn UPPERCASE. *(Lưu ý: `contact_type` `HOTLINE/PHONE/…` là **value-enum**, không phải discriminator đa hình — giữ nguyên, không ảnh hưởng ORM.)*

---

## Mục lục theo domain

1. [Người dùng & RBAC](#1-người-dùng--rbac) — `users`, `roles`, `permissions`, `role_permissions`, `role_parents`, `user_roles`
2. [Địa điểm & vệ tinh](#2-địa-điểm--vệ-tinh) — `categories`, `places`, `place_faqs`, `place_seo`, `place_ai_summary`
3. [Nội dung dùng chung](#3-nội-dung-dùng-chung) — `media`, `contacts`, `price_history`
4. [Nguồn & phiên bản](#4-nguồn--phiên-bản) — `sources`, `source_attributions`, `wiki_revisions`
5. [Xác minh](#5-xác-minh) — `verifications`, `verification_events`, `verification_votes`
6. [Sở hữu cơ sở](#6-sở-hữu-cơ-sở) — `business_claims`, `business_members`
7. [Cộng đồng & đóng góp](#7-cộng-đồng--đóng-góp) — `reviews`, `contributions`, `community_posts`, `community_comments`
8. [Analytics (tổng hợp)](#8-analytics-tổng-hợp) — `page_views_agg`, `place_views_agg`, `search_queries_agg`, `popular_places`, `trending_keywords`
9. [Tìm kiếm](#9-tìm-kiếm) — `saved_searches`
10. [Kiểm toán](#10-kiểm-toán) — `audit_logs`
11. [Mở rộng Place (Wave 2)](#11-mở-rộng-place-wave-2) — `place_hotel_details`, `hotel_room_types`, `amenities`, `place_amenities`, `place_restaurant_details`, `restaurant_menu_sections`, `restaurant_menu_items`, `cuisines`, `place_cuisines`, `place_tour_details`, `tour_stops`, `tour_schedules`
12. [Sự kiện (Wave 2)](#12-sự-kiện-wave-2) — `events`, `event_occurrences`

---

## 1. Người dùng & RBAC

### `users` — Người dùng / principal
*Ý nghĩa:* tài khoản người dùng và service account (AI Agent). Nguồn: [database.md §3.1](./database.md).

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| email | VARCHAR | ✗ | | **UNIQUE** |
| password_hash | VARCHAR | ✓ | | null nếu đăng nhập OAuth |
| display_name | VARCHAR | ✗ | | tên hiển thị |
| avatar_url | VARCHAR | ✓ | | |
| provider | ENUM | ✗ | | `local, google` |
| is_active | BOOLEAN | ✗ | | tài khoản còn hoạt động |
| is_service_account | BOOLEAN | ✗ | | default `false` — AI Agent / service principal ([rbac.md §4.10](../security/rbac.md)) |
| created_at / updated_at | TIMESTAMPTZ | ✗ | | |

- **Unique:** `email`. **Index:** `email`. **Cascade:** — (soft-... không dùng; ban qua nghiệp vụ). **Ghi chú:** bỏ cột `role` ENUM cũ → vai trò qua `user_roles`.

### `roles` — Vai trò (RBAC dạng dữ liệu)
*Ý nghĩa:* danh mục vai trò. Nguồn: [database.md §3.9](./database.md), [rbac.md §4](../security/rbac.md).

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| code | VARCHAR | ✗ | | **UNIQUE** — `guest, member, local_guide, contributor, business_owner, business_manager, moderator, administrator, super_administrator, ai_agent` |
| name | VARCHAR | ✗ | | tên hiển thị |
| description | VARCHAR | ✓ | | |
| is_system | BOOLEAN | ✗ | | default `true` — vai trò lõi, không cho xóa |
| is_assignable | BOOLEAN | ✗ | | default `true` — gán trực tiếp được (`Role.Assign`) |
| created_at / updated_at | TIMESTAMPTZ | ✗ | | |

- **Unique:** `code`. **Cascade:** `is_system=true` → RESTRICT xóa.

### `permissions` — Quyền nguyên tử
*Ý nghĩa:* quyền `Module.Action[.Scope]`. Nguồn: [database.md §3.10](./database.md).

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| code | VARCHAR | ✗ | | **UNIQUE** — vd `Place.Edit.Own`; wildcard `Place.*`, `*` |
| module | VARCHAR | ✗ | | vd `Place`, `Review`, `AI` |
| action | VARCHAR | ✗ | | vd `Edit`, `Approve`, `Verify` |
| scope | VARCHAR | ✓ | | `Own, Managed, Any` hoặc null (mức chung) |
| description | VARCHAR | ✓ | | |
| created_at / updated_at | TIMESTAMPTZ | ✗ | | |

- **Unique:** `code`.

### `role_permissions` — Ánh xạ Role→Permission (N–N)
*Ý nghĩa:* gán quyền cho vai trò, có explicit deny. Nguồn: [database.md §3.11](./database.md).

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| role_id | UUID | ✗ | → roles | **PK** phần 1 |
| permission_id | UUID | ✗ | → permissions | **PK** phần 2 |
| effect | ENUM | ✗ | | `allow, deny` (default `allow`) — deny thắng ([security.md §5](../architecture/security.md)) |
| created_at | TIMESTAMPTZ | ✗ | | |

- **PK/Unique:** `(role_id, permission_id)`. **Cascade:** xóa role/permission → xóa mapping (CASCADE hợp lý).

### `role_parents` — Kế thừa vai trò (DAG)
*Ý nghĩa:* cây/đồ thị kế thừa quyền giữa vai trò. Nguồn: [database.md §3.12](./database.md).

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| role_id | UUID | ✗ | → roles | vai trò **con** — **PK** phần 1 |
| parent_role_id | UUID | ✗ | → roles | vai trò **cha** — **PK** phần 2 |
| created_at | TIMESTAMPTZ | ✗ | | |

- **PK:** `(role_id, parent_role_id)`. **Ràng buộc:** `CHECK(role_id <> parent_role_id)`; **DAG không chu trình** (cưỡng chế tầng nghiệp vụ). [rbac.md §5](../security/rbac.md).

### `user_roles` — Gán vai trò cho principal (kèm scope)
*Ý nghĩa:* principal ↔ role + phạm vi. Nguồn: [database.md §3.13](./database.md).

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| user_id | UUID | ✗ | → users | principal (người/service) |
| role_id | UUID | ✗ | → roles | |
| scope_type | ENUM | ✗ | | `global, managed, own` (default `global`) |
| business_id | UUID | ✓ | **→ places** | chỉ khi `scope_type=managed` — cơ sở (Place đã claim); sở hữu ở `business_members` (ADR-015) |
| granted_by | UUID | ✓ | → users | null nếu hệ thống/seed |
| granted_at | TIMESTAMPTZ | ✗ | | |
| revoked_at | TIMESTAMPTZ | ✓ | | null = đang hiệu lực |

- **Unique:** `(user_id, role_id, business_id) WHERE revoked_at IS NULL`. **Index:** `(user_id) WHERE revoked_at IS NULL`.

---

## 2. Địa điểm & vệ tinh

### `categories` — Phân loại địa điểm
*Ý nghĩa:* cây danh mục. Nguồn: [database.md §3.2](./database.md).

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| slug | VARCHAR | ✗ | | **UNIQUE** — vd `beach, restaurant, homestay` |
| name_vi | VARCHAR | ✗ | | tên tiếng Việt |
| name_en | VARCHAR | ✓ | | tên tiếng Anh |
| icon | VARCHAR | ✓ | | |
| parent_id | UUID | ✓ | → categories (self) | phân cấp cây |

- **Unique:** `slug`. **Cascade:** self-ref RESTRICT.

### `places` — Địa điểm (POI) — **bảng lõi / SSOT**
*Ý nghĩa:* thực thể trung tâm; chỉ dữ liệu ổn định + cache job-synced. **Nguồn authoritative duy nhất:** [places.md §3](./modules/places.md) (ADR-001, B7).

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| name | VARCHAR(200) | ✗ | | tên địa điểm |
| slug | VARCHAR(220) | ✗ | | **UNIQUE** — auto từ tên + hậu tố nếu trùng |
| category_id | UUID | ✗ | → categories | danh mục |
| location | GEOGRAPHY(Point,4326) | ✗ | | GPS (PostGIS) |
| address | VARCHAR(300) | ✓ | | địa chỉ chữ |
| ward | VARCHAR(120) | ✓ | | phường/xã |
| description | TEXT | ✓ | | mô tả (Markdown) |
| short_description | VARCHAR(300) | ✓ | | mô tả ngắn (card) |
| opening_hours | JSONB | ✓ | | giờ mở cửa (regular/exceptions/is_24h) |
| price_range | ENUM | ✓ | | `free, low, mid, high` (lọc nhanh) |
| cover_image_id | UUID | ✓ | → media | ảnh đại diện |
| rating_avg | NUMERIC(2,1) | ✓ | | **cache job-synced** từ reviews |
| rating_count | INT | ✗ | | default 0 — cache |
| view_count | BIGINT | ✗ | | default 0 — cache từ `place_views_agg` |
| status | ENUM | ✗ | | `draft, pending, published, archived` |
| verification_status | ENUM | ✗ | | cache từ verifications: `pending, verified, official, community_verified, expired, rejected` (default `pending`) |
| verified_at | TIMESTAMPTZ | ✓ | | thời điểm đạt tin cậy gần nhất |
| osm_id | BIGINT | ✓ | | liên kết OpenStreetMap |
| created_by / updated_by | UUID | ✓ | → users | audit |
| created_at / updated_at | TIMESTAMPTZ | ✗ | | |
| deleted_at | TIMESTAMPTZ | ✓ | | soft delete |

- **Unique:** `slug`. **Index:** `GIST(location)`, `UNIQUE(slug)`, `BTREE(category_id, status)`, `BTREE(status) WHERE deleted_at IS NULL`, `GIN FTS(name+description)` (unaccent). **Cascade:** soft-delete (`deleted_at`); không hard-delete.

### `place_faqs` — FAQ của địa điểm
*Ý nghĩa:* hỏi–đáp + nguồn FAQ Schema. Nguồn: [places.md §7](./modules/places.md).

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| place_id | UUID | ✗ | → places | |
| question | VARCHAR(300) | ✗ | | |
| answer | TEXT | ✗ | | |
| sort_order | INT | ✓ | | thứ tự |
| is_ai_generated | BOOLEAN | ✗ | | FAQ do AI gợi ý (chờ duyệt) |
| status | ENUM | ✗ | | `pending, published, hidden` |
| created_by | UUID | ✓ | → users | |
| created_at / updated_at | TIMESTAMPTZ | ✗ | | |

- **Cascade:** `place_id` → CASCADE (FAQ thuộc place).

### `place_seo` — SEO (1–1 với places)
*Ý nghĩa:* meta & JSON-LD. Nguồn: [places.md §8](./modules/places.md).

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| place_id | UUID (PK) | ✗ | → places | **1–1**, PK=FK |
| meta_title | VARCHAR(160) | ✓ | | |
| meta_description | VARCHAR(320) | ✓ | | |
| meta_keywords | VARCHAR(300) | ✓ | | tùy chọn |
| canonical_url | VARCHAR(300) | ✓ | | |
| og_title | VARCHAR(160) | ✓ | | Open Graph |
| og_description | VARCHAR(320) | ✓ | | |
| og_image_url | VARCHAR(500) | ✓ | | |
| no_index | BOOLEAN | ✗ | | default `false` |
| structured_data | JSONB | ✓ | | JSON-LD schema.org |
| updated_at | TIMESTAMPTZ | ✗ | | |

- **Unique:** `place_id` (PK). **Cascade:** `place_id` → CASCADE. Trống → fallback tự sinh meta.

### `place_ai_summary` — Tóm tắt AI (1–1 với places)
*Ý nghĩa:* nội dung AI có provenance, tách khỏi người viết. Nguồn: [places.md §9](./modules/places.md).

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| place_id | UUID (PK) | ✗ | → places | **1–1**, PK=FK |
| summary | TEXT | ✓ | | tóm tắt AI |
| highlights | JSONB | ✓ | | điểm nổi bật |
| model | VARCHAR(80) | ✓ | | model đã dùng |
| prompt_version | VARCHAR(40) | ✓ | | |
| source_hash | VARCHAR(64) | ✓ | | hash nguồn → biết khi cần sinh lại |
| language | CHAR(2) | ✓ | | `vi, en` |
| status | ENUM | ✗ | | `generating, ready, stale, rejected` |
| is_approved | BOOLEAN | ✗ | | đã người duyệt |
| generated_at / updated_at | TIMESTAMPTZ | | | |

- **Cascade:** `place_id` → CASCADE. `status=stale` khi `source_hash` đổi. Song ngữ → có thể chuyển 1–N khóa `(place_id, language)`.

---

## 3. Nội dung dùng chung

### `media` — Ảnh / video (exclusive arc)
*Ý nghĩa:* một bảng ảnh/video chung cho Place/Review/Post/Business. Nguồn: [database.md §3.5](./database.md), ADR-009.

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| place_id | UUID | ✓ | → places | *exclusive arc* — media cộng đồng |
| review_id | UUID | ✓ | → reviews | arc |
| post_id | UUID | ✓ | → community_posts | arc |
| business_id | UUID | ✓ | **→ places** | arc — media **chính thức** của cơ sở (ADR-015) |
| event_id | UUID | ✓ | → events | arc — gallery Sự kiện (Wave 2/ADR-002); `events.cover_media_id` chỉ hero |
| type | ENUM | ✗ | | `image, video` |
| url | VARCHAR(500) | ✗ | | link object storage |
| thumbnail_url | VARCHAR(500) | ✓ | | |
| provider | ENUM | ✗ | | `upload, youtube, vimeo` |
| external_id | VARCHAR(100) | ✓ | | id video nhúng |
| width / height | INT | ✓ | | kích thước ảnh |
| duration | INT | ✓ | | giây (video) |
| caption | VARCHAR(300) | ✓ | | |
| alt_text | VARCHAR(200) | ✓ | | SEO/accessibility |
| sort_order | INT | ✓ | | thứ tự gallery |
| status | ENUM | ✗ | | `pending, published, hidden, rejected` (WF-17/18) |
| ai_moderation_score | NUMERIC(4,3) | ✓ | | điểm AI kiểm ảnh |
| ai_labels | JSONB | ✓ | | nhãn AI |
| uploaded_by | UUID | ✓ | → users | |
| created_at / updated_at | TIMESTAMPTZ | ✗ | | |
| deleted_at | TIMESTAMPTZ | ✓ | | soft delete |

- **Ràng buộc:** `CHECK` đúng-một trong `(place_id, review_id, post_id, business_id, event_id)` — **5 nhánh** (ADR-009, +event_id Wave 2). **Index:** partial theo từng FK; `(place_id, sort_order) WHERE place_id IS NOT NULL`; `(event_id, sort_order) WHERE event_id IS NOT NULL`; `(status)`. **Cascade:** FK arc **ON DELETE CASCADE**.

### `contacts` — Liên hệ (polymorphic)
*Ý nghĩa:* kênh liên hệ dùng chung, thay cột inline. Nguồn: [database.md §3.14](./database.md), ADR-005.

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| owner_type | VARCHAR(30) | ✗ | | **lowercase (B-3):** `place, business` (mở rộng không đổi schema); `business`=chính thức |
| owner_id | UUID | ✗ | *(no FK — polymorphic)* | id chủ; với `BUSINESS`→`places.id` |
| contact_type | VARCHAR(30) | ✗ | | `HOTLINE, PHONE, EMAIL, WEBSITE, FACEBOOK, INSTAGRAM, TIKTOK, ZALO, YOUTUBE, OTHER` |
| value | VARCHAR(300) | ✗ | | số/URL/handle |
| label | VARCHAR(120) | ✓ | | nhãn tùy chọn |
| is_primary | BOOLEAN | ✗ | | default `false` |
| verification_status | ENUM | ✗ | | cache từ verifications (default `pending`) |
| verified_at | TIMESTAMPTZ | ✓ | | |
| display_order | INT | ✗ | | default 0 |
| created_at / updated_at | TIMESTAMPTZ | ✗ | | |
| deleted_at | TIMESTAMPTZ | ✓ | | soft delete |

- **Index:** `(owner_type, owner_id)`; `(owner_type, owner_id, contact_type)`; **partial UNIQUE** `(owner_type, owner_id, contact_type) WHERE is_primary AND deleted_at IS NULL`. **Cascade:** — (polymorphic, toàn vẹn tầng app); soft-delete.

### `price_history` — Lịch sử giá & bảng giá (polymorphic, append-only)
*Ý nghĩa:* mọi khoản giá của Place/Hotel/Tour/Event…; append-only. Nguồn: [database.md §3.15](./database.md), ADR-006.

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| entity_type | VARCHAR(30) | ✗ | | **lowercase (B-3):** `place, hotel, tour, event, business_service, real_estate` |
| entity_id | UUID | ✗ | *(no FK — polymorphic)* | chủ khoản giá |
| service_name | VARCHAR(120) | ✗ | | "Người lớn", "Phòng Deluxe"… |
| amount | NUMERIC(12,2) | ✗ | | giá |
| currency | CHAR(3) | ✗ | | default `VND` |
| unit | VARCHAR(40) | ✓ | | `/vé, /người, /đêm` |
| is_free | BOOLEAN | ✗ | | default `false` |
| description | VARCHAR(300) | ✓ | | điều kiện áp dụng |
| display_order | INT | ✗ | | default 0 |
| valid_from | TIMESTAMPTZ | ✓ | | |
| valid_to | TIMESTAMPTZ | ✓ | | null=không hạn → job `expired` |
| source_id | UUID | ✓ | → sources | provenance |
| verification_status | ENUM | ✗ | | cache từ verifications (default `pending`) |
| verified_at | TIMESTAMPTZ | ✓ | | |
| updated_by | UUID | ✓ | → users | |
| created_at / updated_at | TIMESTAMPTZ | ✗ | | |
| deleted_at | TIMESTAMPTZ | ✓ | | soft delete |

- **Index:** `(entity_type, entity_id)`; `(entity_type, entity_id, service_name)`; `(entity_type, entity_id, valid_to)`; `(source_id)`. **Cascade:** — (polymorphic); append-only + soft-delete.

---

## 4. Nguồn & phiên bản

### `sources` — Danh mục nguồn
*Ý nghĩa:* nguồn gốc/độ tin dữ liệu. Nguồn: [source.md §4](./modules/source.md).

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| type | ENUM | ✗ | | `official_website, business_owner, government, google_maps, openstreetmap, press, facebook, community, field_survey, moderator, ai, other` |
| kind | ENUM | ✗ | | `url, dataset, platform_user, ai_model, offline` |
| title | VARCHAR(200) | ✓ | | tên hiển thị |
| url | VARCHAR(500) | ✓ | | nếu `kind=url` |
| external_ref | VARCHAR(150) | ✓ | | OSM node / Google Place ID / FB page id |
| publisher | VARCHAR(200) | ✓ | | đơn vị phát hành |
| author_user_id | UUID | ✓ | → users | nếu nguồn là người dùng |
| license | VARCHAR(60) | ✓ | | `ODbL-1.0, CC-BY-4.0, proprietary…` |
| reliability | SMALLINT | ✗ | | bậc tin cậy 0–100 (mặc định theo `type`) |
| language | CHAR(2) | ✓ | | |
| retrieved_at | TIMESTAMPTZ | ✓ | | độ mới dữ liệu |
| metadata | JSONB | ✓ | | version model AI, HTTP status… |
| created_at / updated_at | TIMESTAMPTZ | ✗ | | |
| deleted_at | TIMESTAMPTZ | ✓ | | soft delete |

- **Index:** `UNIQUE(type, external_ref) WHERE external_ref IS NOT NULL`; `BTREE(type)`; `BTREE(author_user_id)`.

### `source_attributions` — Quy chiếu nguồn (đa hình)
*Ý nghĩa:* nối Source ↔ một mẩu dữ liệu (đến từng trường). Nguồn: [source.md §5](./modules/source.md).

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| source_id | UUID | ✗ | → sources | |
| entity_type | ENUM | ✗ | | `place, place_field, contact, media, price_history, place_faq, review, wiki_revision` |
| entity_id | UUID | ✗ | *(no FK — polymorphic)* | đối tượng quy chiếu |
| field | VARCHAR(60) | ✓ | | tên trường khi `entity_type=place_field` |
| confidence | SMALLINT | ✓ | | mức tin lần gán 0–100 |
| note | VARCHAR(300) | ✓ | | trích dẫn/ghi chú |
| is_primary | BOOLEAN | ✗ | | default `false` |
| verified_by | UUID | ✓ | → users | |
| verified_at | TIMESTAMPTZ | ✓ | | |
| created_by | UUID | ✓ | → users | null nếu hệ thống/AI |
| created_at | TIMESTAMPTZ | ✗ | | |

- **Index:** `(entity_type, entity_id)`; `(source_id)`; **UNIQUE** `(entity_type, entity_id, field, source_id)`. **Cascade:** — (polymorphic).

### `wiki_revisions` — Phiên bản & lịch sử (polymorphic, append-only)
*Ý nghĩa:* thực thể phiên bản **duy nhất** (retire `place_revisions`). Nguồn: [source.md §6](./modules/source.md), ADR-014.

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| entity_type | ENUM | ✗ | | `place` (sau: `topic, area`) |
| entity_id | UUID | ✗ | *(no FK — polymorphic)* | → `places.id` |
| revision_number | INT | ✗ | | tăng dần theo entity |
| parent_revision_id | UUID | ✓ | → wiki_revisions (self) | dựng cây/diff |
| snapshot | JSONB | ✗ | | toàn bộ nội dung tại thời điểm |
| diff | JSONB | ✓ | | trường đổi |
| origin | ENUM | ✗ | | `community_edit, owner_update, moderator_edit, osm_sync, ai_generation, import` |
| change_note | VARCHAR(300) | ✓ | | |
| editor_id | UUID | ✓ | → users | null nếu hệ thống/AI |
| status | ENUM | ✗ | | `pending, approved, rejected, reverted` |
| reviewed_by | UUID | ✓ | → users | |
| reviewed_at | TIMESTAMPTZ | ✓ | | |
| created_at | TIMESTAMPTZ | ✗ | | |

- **Index:** **UNIQUE** `(entity_type, entity_id, revision_number)`; `(entity_type, entity_id, status)`. **Cascade:** — (audit bất biến, **không cascade** — giữ lịch sử kể cả khi entity archive).

---

## 5. Xác minh

### `verifications` — Xác minh dữ liệu (exclusive arc, máy trạng thái)
*Ý nghĩa:* trạng thái tin cậy hiện hành của Place/Contact/PriceHistory. Nguồn: [verification.md §4](./modules/verification.md), [database.md §3.16](./database.md), ADR-008.

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| place_id | UUID | ✓ | → places | *exclusive arc* |
| contact_id | UUID | ✓ | → contacts | arc |
| price_history_id | UUID | ✓ | → price_history | arc |
| status | ENUM | ✗ | | `pending, verified, official, community_verified, expired, rejected` |
| method | ENUM | ✗ | | `moderator, owner_claim, source_match, community_vote, system_auto` |
| source_id | UUID | ✓ | → sources | bắt buộc khi `official` |
| confidence | SMALLINT | ✓ | | 0–100 |
| confirm_count / dispute_count | INT | ✗ | | cache dẫn xuất từ `verification_votes` |
| reason_code | ENUM | ✓ | | khi `rejected` |
| verified_by | UUID | ✓ | → users | |
| assigned_to | UUID | ✓ | → users | hàng đợi kiểm duyệt |
| assigned_at / sla_due_at | TIMESTAMPTZ | ✓ | | nhận việc / SLA |
| priority | SMALLINT | ✗ | | default 0 |
| note / rejected_reason | VARCHAR(300) | ✓ | | |
| valid_from / expires_at | TIMESTAMPTZ | ✓ | | `expires_at`→job `expired` |
| lock_version | INT | ✗ | | optimistic lock (default 0) |
| created_by | UUID | ✓ | → users | |
| created_at / updated_at | TIMESTAMPTZ | ✗ | | |

- **Ràng buộc:** `CHECK` đúng-một `(place_id, contact_id, price_history_id)`; `CHECK(status<>'official' OR source_id NOT NULL)`; `CHECK(status<>'rejected' OR reason_code NOT NULL)`; **partial UNIQUE** mỗi target. **Index:** `(status)`; `(expires_at) WHERE status IN(...)`; `(assigned_to, sla_due_at) WHERE status='pending'`; `(source_id)`.

### `verification_events` — Lịch sử chuyển trạng thái (append-only)
*Ý nghĩa:* audit trail bất biến. Nguồn: [database.md §3.17](./database.md), verification.md §5.

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| verification_id | UUID | ✗ | → verifications | **ON DELETE CASCADE** |
| from_status | ENUM | ✓ | | null nếu khởi tạo |
| to_status | ENUM | ✗ | | |
| method | ENUM | ✗ | | |
| source_id | UUID | ✓ | → sources | |
| actor_id | UUID | ✓ | → users | null=system |
| note | VARCHAR(300) | ✓ | | |
| created_at | TIMESTAMPTZ | ✗ | | |

- **Index:** `(verification_id, created_at)`. **Cascade:** `verification_id` **CASCADE**.

### `verification_votes` — Sổ phiếu cộng đồng
*Ý nghĩa:* nguồn sự thật cho `community_verified` (1 người 1 phiếu). Nguồn: [database.md §3.18](./database.md), verification.md §5B.

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| verification_id | UUID | ✗ | → verifications | **ON DELETE CASCADE** |
| user_id | UUID | ✗ | → users | |
| vote | ENUM | ✗ | | `confirm, dispute` |
| weight | SMALLINT | ✗ | | default 1 (theo uy tín) |
| note | VARCHAR(300) | ✓ | | |
| created_at | TIMESTAMPTZ | ✗ | | |

- **Unique:** `(verification_id, user_id)` — idempotent. **Index:** `(verification_id)`. **Cascade:** `verification_id` **CASCADE**.

---

## 6. Sở hữu cơ sở

### `business_claims` — Yêu cầu nhận quyền cơ sở
*Ý nghĩa:* claim Place (state machine + audit). Nguồn: [database.md §3.19](./database.md), [business.md §2](./modules/business.md), ADR-015.

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| place_id | UUID | ✗ | → places | cơ sở được claim |
| requester_id | UUID | ✗ | → users | người gửi |
| evidence | JSONB | ✗ | | bằng chứng (riêng tư) |
| status | ENUM | ✗ | | `pending, approved, rejected, disputed, withdrawn` |
| reviewer_id | UUID | ✓ | → users | Moderator |
| reason_code | ENUM | ✓ | | khi `rejected` |
| decision_note | VARCHAR(300) | ✓ | | |
| decided_at | TIMESTAMPTZ | ✓ | | |
| created_at / updated_at | TIMESTAMPTZ | ✗ | | |

- **Ràng buộc:** `CHECK(status<>'rejected' OR reason_code NOT NULL)`; **partial UNIQUE** `(place_id, requester_id) WHERE status='pending'`. **Index:** `(place_id, status)`.

### `business_members` — Sở hữu & ủy quyền hiệu lực
*Ý nghĩa:* owner/manager của cơ sở. Nguồn: [database.md §3.20](./database.md), [business.md §3](./modules/business.md), ADR-015.

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| place_id | UUID | ✗ | → places | cơ sở |
| user_id | UUID | ✗ | → users | thành viên |
| role | ENUM | ✗ | | `owner, manager` |
| claim_id | UUID | ✓ | → business_claims | nguồn gốc (owner) |
| granted_by | UUID | ✓ | → users | |
| granted_at | TIMESTAMPTZ | ✗ | | |
| revoked_at | TIMESTAMPTZ | ✓ | | null=còn hiệu lực |

- **Unique:** **partial** `(place_id) WHERE role='owner' AND revoked_at IS NULL` (một owner/cơ sở); **partial** `(place_id, user_id) WHERE revoked_at IS NULL`. **Index:** `(user_id) WHERE revoked_at IS NULL`.

---

## 7. Cộng đồng & đóng góp

### `reviews` — Đánh giá
*Ý nghĩa:* review + rating của Place. Nguồn: [database.md §3.4](./database.md).

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| place_id | UUID | ✗ | → places | |
| user_id | UUID | ✗ | → users | |
| rating | SMALLINT | ✗ | | 1–5 |
| content | TEXT | ✓ | | |
| status | ENUM | ✗ | | `pending, published, hidden` |
| created_at | TIMESTAMPTZ | ✗ | | |

- **Unique:** `(place_id, user_id)` — mỗi người 1 review/địa điểm. **Ghi chú:** tài liệu nguồn chưa nêu `updated_at`/`deleted_at` dù API có edit/delete → cần bổ sung khi hoàn thiện Review.

### `contributions` — Đóng góp & kiểm duyệt
*Ý nghĩa:* đề xuất tạo/sửa/báo cáo vào hàng chờ. Nguồn: [database.md §3.6](./database.md).

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| user_id | UUID | ✗ | → users | người đóng góp |
| place_id | UUID | ✓ | → places | null nếu tạo mới |
| type | ENUM | ✗ | | `create, update, report` |
| payload | JSONB | ✗ | | dữ liệu đề xuất |
| status | ENUM | ✗ | | `pending, approved, rejected` |
| reviewed_by | UUID | ✓ | → users | moderator |
| review_note | TEXT | ✓ | | |
| created_at / reviewed_at | TIMESTAMPTZ | | | |

### `community_posts` — Bài viết cộng đồng
*Ý nghĩa:* thảo luận, có thể gắn Place. Nguồn: [database.md §3.7](./database.md).

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| author_id | UUID | ✗ | → users | |
| title | VARCHAR | ✗ | | |
| slug | VARCHAR | ✗ | | **UNIQUE** |
| content | TEXT | ✗ | | Markdown |
| place_id | UUID | ✓ | → places | null nếu không gắn |
| status | ENUM | ✗ | | `draft, published, hidden` |
| created_at / updated_at | TIMESTAMPTZ | ✗ | | |

- **Unique:** `slug`.

### `community_comments` — Bình luận
*Ý nghĩa:* bình luận lồng nhau. Nguồn: [database.md §3.8](./database.md).

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| post_id | UUID | ✗ | → community_posts | |
| author_id | UUID | ✗ | → users | |
| parent_id | UUID | ✓ | → community_comments (self) | trả lời lồng nhau |
| content | TEXT | ✗ | | |
| created_at | TIMESTAMPTZ | ✗ | | |

- **Cascade:** `post_id` → CASCADE; `parent_id` self.

---

## 8. Analytics (tổng hợp)

> **Nguyên tắc aggregate-first:** không lưu log thô; cột chung `granularity` + `bucket_start`; partition theo tháng; unique dùng cho UPSERT cộng dồn. Nguồn: [analytics.md](./modules/analytics.md).

### `page_views_agg` — PageView (§3.1)
| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| granularity | ENUM | ✗ | | `hour, day, month` |
| bucket_start | TIMESTAMPTZ | ✗ | | mốc đầu khoảng |
| page_type | ENUM | ✗ | | `home, place, category, search, community, topic, other` |
| entity_id | UUID | ✓ | | id đối tượng (nếu có) |
| path_hash | CHAR(16) | ✓ | | băm đường dẫn |
| views | BIGINT | ✗ | | |
| unique_visitors | INT | ✓ | | từ HLL |
| uniques_hll | BYTEA | ✓ | | sketch HLL để gộp rollup |
| created_at / updated_at | TIMESTAMPTZ | | | |

- **Unique:** `(granularity, bucket_start, page_type, entity_id)`. **Index:** `(page_type, bucket_start)`.

### `place_views_agg` — PlaceView (§3.2)
| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| granularity | ENUM | ✗ | | `hour, day, month` |
| bucket_start | TIMESTAMPTZ | ✗ | | |
| place_id | UUID | ✗ | → places | |
| views | BIGINT | ✗ | | |
| unique_visitors | INT | ✓ | | HLL |
| uniques_hll | BYTEA | ✓ | | sketch |
| source | ENUM | ✓ | | `map, search, direct, community, external` |
| created_at / updated_at | TIMESTAMPTZ | | | |

- **Unique:** `(granularity, bucket_start, place_id, source)`. **Index:** `(place_id, bucket_start)`, `(bucket_start)`.

### `search_queries_agg` — SearchAnalytics (§3.3)
| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| granularity | ENUM | ✗ | | `hour, day, month` |
| bucket_start | TIMESTAMPTZ | ✗ | | |
| query_normalized | VARCHAR(120) | ✗ | | lowercase+unaccent+trim |
| search_count | BIGINT | ✗ | | |
| zero_result_count | BIGINT | ✗ | | lỗ hổng nội dung |
| click_count | BIGINT | ✗ | | |
| result_count_avg | NUMERIC(8,1) | ✓ | | |
| created_at / updated_at | TIMESTAMPTZ | | | |

- **Unique:** `(granularity, bucket_start, query_normalized)`. **Index:** `(bucket_start, search_count DESC)`.

### `popular_places` — PopularPlace (§4.1, materialized)
| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| period | ENUM | ✗ | | `24h, 7d, 30d, all` |
| place_id | UUID | ✗ | → places | |
| rank | INT | ✗ | | |
| score | NUMERIC(12,4) | ✗ | | điểm phổ biến |
| views | BIGINT | ✗ | | trong cửa sổ |
| unique_visitors | INT | ✓ | | |
| delta_rank | INT | ✓ | | thay đổi hạng |
| computed_at | TIMESTAMPTZ | ✗ | | |

- **Unique:** `(period, place_id)`. **Index:** `(period, rank)`. Job ghi đè định kỳ.

### `trending_keywords` — TrendingKeyword (§4.2, materialized)
| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| period | ENUM | ✗ | | `24h, 7d` |
| keyword | VARCHAR(120) | ✗ | | chuẩn hóa |
| rank | INT | ✗ | | |
| current_count | BIGINT | ✗ | | cửa sổ hiện tại |
| previous_count | BIGINT | ✗ | | cửa sổ trước |
| growth_score | NUMERIC(10,4) | ✗ | | điểm xu hướng |
| zero_result_rate | NUMERIC(4,3) | ✓ | | cơ hội biên tập |
| computed_at | TIMESTAMPTZ | ✗ | | |

- **Unique:** `(period, keyword)`. **Index:** `(period, rank)`.

---

## 9. Tìm kiếm

### `saved_searches` — Tìm kiếm đã lưu (planned)
*Ý nghĩa:* truy vấn đã lưu của người dùng + alert. Nguồn: [database.md §12](./database.md).

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| user_id | UUID | ✗ | → users | chủ sở hữu |
| name | VARCHAR(120) | ✓ | | tên tùy chọn |
| query_raw | VARCHAR(200) | ✓ | | truy vấn gốc |
| query_normalized | VARCHAR(200) | ✓ | | chuẩn hóa (đồng nhất Search) |
| filters | JSONB | ✓ | | bộ lọc đã lưu |
| sort | VARCHAR(40) | ✓ | | tiêu chí sắp xếp |
| alert_enabled | BOOLEAN | ✗ | | default `false` |
| alert_channel | ENUM | ✓ | | `in_app, email, push` |
| last_run_at | TIMESTAMPTZ | ✓ | | mốc tính delta alert |
| created_at / updated_at | TIMESTAMPTZ | ✗ | | |
| deleted_at | TIMESTAMPTZ | ✓ | | soft delete |

- **Quan hệ:** `users 1:N saved_searches`; **không** FK tới nội dung (chỉ lưu tham số). **Cascade:** `user_id` → CASCADE (dữ liệu cá nhân).

---

## 10. Kiểm toán

### `audit_logs` — Nhật ký kiểm toán (append-only, bất biến)
*Ý nghĩa:* tầng audit hành chính/bảo mật xuyên suốt (login, ban, gán role, đổi RBAC, impersonation, claim/transfer, duyệt…) — bổ sung `verification_events`/`wiki_revisions`/`source_attributions`. Nguồn: [database.md §3.21](./database.md), [ADR-016](../99-decisions/ADR-016-audit-log-model.md).

| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| event | VARCHAR(60) | ✗ | | mã `module.action` — khớp dòng "Audit Log:" của workflow |
| actor_id | UUID | ✓ | → users | null = hệ thống/job (**không cascade**) |
| actor_role | VARCHAR(40) | ✓ | | vai trò hiệu lực lúc hành động (snapshot) |
| is_service_account | BOOLEAN | ✗ | | default `false` — AI/hệ thống vs người |
| permission | VARCHAR(60) | ✓ | | permission đã đánh giá |
| scope | VARCHAR(10) | ✓ | | `Own, Managed, Any` |
| entity_type | VARCHAR(40) | ✗ | | loại tài nguyên (đa hình) |
| entity_id | UUID | ✓ | | id tài nguyên (**không FK cứng**; null cho sự kiện không gắn 1 tài nguyên) |
| result | ENUM | ✗ | | `success, failure, allow, deny` |
| ip | INET | ✓ | | |
| user_agent | VARCHAR(300) | ✓ | | |
| before / after | JSONB | ✓ | | ảnh chụp thay đổi (redact PII/secret) |
| context | JSONB | ✓ | | `reason`, `from→to`, `reason_code`, `source_ref`… |
| correlation_id | UUID | ✓ | | nối chuỗi hành động cùng request/job |
| created_at | TIMESTAMPTZ | ✗ | | **chỉ `created_at`** — không `updated_at`/`deleted_at` |

- **Bất biến:** chỉ `INSERT` (không `UPDATE`/`DELETE`/soft-delete); dọn theo retention policy. **Index:** `(entity_type, entity_id, created_at)`, `(actor_id, created_at)`, `(event, created_at)`, `(correlation_id) WHERE correlation_id NOT NULL`; khuyến nghị partition theo `created_at` (tháng). **Cascade:** — (đa hình, không cascade — giữ audit kể cả khi entity bị xóa).

---

## 11. Mở rộng Place (Wave 2)

*Nguồn authoritative: [places.md §13](./modules/places.md); cơ chế satellite [ADR-002](../99-decisions/ADR-002-place-extension.md). Discriminator = `places.category`; FK thật + `ON DELETE CASCADE`; **0 cột thêm vào `places`**.*

**Hotel** — `place_hotel_details` (1:1, PK=`place_id`→places): `star_rating` SMALLINT✓ (1–5), `hotel_type` ENUM✗ (resort/hotel/homestay/villa/guesthouse/apartment), `check_in`/`check_out` TIME✓. · `hotel_room_types` (1:N `place_id`): `name`✗, `capacity`✓, `price_ref` NUMERIC(12,2)✓ (cache), `currency` CHAR(3)✗, `valid_from/to`✓, `sort_order`✗. · `amenities` (dict): `code`ᵁ, `label_vi/en`, `icon`, `group`. · `place_amenities` (N:N): PK`(place_id,amenity_id)`.

**Restaurant** — `place_restaurant_details` (1:1, PK=`place_id`): `is_local_specialty` BOOLEAN✗, `dietary` JSONB✓. · `restaurant_menu_sections` (1:N `place_id`): `name`✗, `sort_order`✗. · `restaurant_menu_items` (1:N `section_id`→sections, CASCADE): `name`✗, `price` NUMERIC(12,2)✓, `currency`✗, `tags` JSONB✓, `sort_order`✗. · `cuisines` (dict): `code`ᵁ, `label_vi/en`. · `place_cuisines` (N:N): PK`(place_id,cuisine_id)`.

**Tour** — `place_tour_details` (1:1, PK=`place_id`): `tour_type` ENUM✗ (diving/fishing/trekking/sightseeing/cruise/other), `duration_minutes` INT✓, `difficulty` ENUM✓ (easy/moderate/hard), `organizer_id`✓ →places. · `tour_stops` (1:N `place_id`): `name`✗, `location` GEOGRAPHY(Point,4326)✓, `sort_order`✗, `time`✓, `note`✓ — **Index** `GIST(location)`. · `tour_schedules` (1:N `place_id`): `date` DATE✗, `capacity`✓, `price`✓, `currency`✗, `valid_from/to`✓.

- **Cascade:** tất cả bảng mở rộng ← `places` **ON DELETE CASCADE**; `restaurant_menu_items` ← `restaurant_menu_sections` CASCADE. **Giá:** `price_ref`/`tour_schedules.price` = cache; nguồn xác minh = `price_history` (`entity_type` `hotel/tour`).

## 12. Sự kiện (Wave 2)

*Thực thể **peer** (Hybrid) — KHÔNG phải Place extension. Nguồn: [database.md §3.22–3.23](./database.md), [ADR-002](../99-decisions/ADR-002-place-extension.md).*

### `events` — Sự kiện theo thời gian
| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| title | VARCHAR(200) | ✗ | | |
| slug | VARCHAR(220) | ✗ | | **UNIQUE** |
| description | TEXT | ✓ | | |
| cover_media_id | UUID | ✓ | → media | hero/thumbnail (gallery qua `media.event_id`) |
| start_at / end_at | TIMESTAMPTZ | ✗ | | `CHECK(start_at < end_at)` |
| timezone | VARCHAR(40) | ✗ | | default `Asia/Ho_Chi_Minh` |
| place_id | UUID | ✓ | → places | venue (**nullable** — BR-E3) |
| organizer_id | UUID | ✓ | → places | cơ sở đã claim |
| event_category | VARCHAR(60) | ✓ | | festival/music/food/cultural/sport/mice/other |
| status | ENUM | ✗ | | `draft, pending, published, archived` |
| status_override | ENUM | ✓ | | `cancelled, postponed` |
| recurrence_rule | VARCHAR(300) | ✓ | | RRULE-like |
| created_by / updated_by | UUID | ✓ | → users | |
| created_at / updated_at | TIMESTAMPTZ | ✗ | | |
| deleted_at | TIMESTAMPTZ | ✓ | | soft delete |

- **Ràng buộc:** `CHECK(start_at<end_at)`. **Index:** `UNIQUE(slug)`, `(start_at,end_at)`, `(place_id)`, `(organizer_id)`, `(status) WHERE deleted_at IS NULL`, GIN FTS. **Cascade:** — (place_id/organizer_id nullable, không cascade). Trạng thái thời gian `upcoming/ongoing/ended` **suy diễn**.

### `event_occurrences` — Lần diễn ra (định kỳ)
| Cột | Kiểu | Null | FK | Mô tả |
|---|---|---|---|---|
| id | UUID (PK) | ✗ | | |
| event_id | UUID | ✗ | → events | **ON DELETE CASCADE** |
| start_at / end_at | TIMESTAMPTZ | ✗ | | `CHECK(start_at<end_at)` |
| status_override | ENUM | ✓ | | `cancelled, postponed` |
| created_at | TIMESTAMPTZ | ✗ | | |

- **Index:** `(event_id, start_at)`. **Cascade:** `event_id` **CASCADE**.

---

## Phụ lục A — Quy ước Cascade & Soft-delete

- **Soft-delete (`deleted_at`):** `places`, `media`, `contacts`, `price_history`, `sources`, `saved_searches`, `events`, `community_posts` (ẩn qua `status`). Không hard-delete dữ liệu người dùng.
- **CASCADE cứng:** `verification_events`/`verification_votes` ← `verifications`; `media` arc ← chủ (place/review/post/business/**event**); satellite 1:1 (`place_seo`, `place_ai_summary`, `place_faqs`) ← `places`; **bảng mở rộng Wave 2** (`place_hotel_details`/`hotel_room_types`/`place_restaurant_details`/`restaurant_menu_sections`/`place_tour_details`/`tour_stops`/`tour_schedules`/`place_amenities`/`place_cuisines`) ← `places`; `restaurant_menu_items` ← `restaurant_menu_sections`; `event_occurrences` ← `events`.
- **Append-only (không cascade, giữ audit):** `wiki_revisions`, `verification_events`, `price_history`, `audit_logs`.
- **Polymorphic (không FK cứng, toàn vẹn tầng app):** `contacts`, `price_history`, `source_attributions`, `wiki_revisions`, `audit_logs`.
- **Exclusive arc (FK thật, đúng-một):** `media` (place/review/post/business/**event** — 5 nhánh), `verifications` (place/contact/price_history).

## Phụ lục B — Thực thể CHƯA thiết kế (Wave 3–5)

Không đưa vào dictionary (chưa Accepted): `reports`, `votes`, `notifications`, `devices`, `notification_preferences`, `email_verification_tokens`, `password_reset_tokens`, `api_keys`, `partner_clients`, `ai_jobs`, `tags`, `entity_tags`. Xem [database.md §11](./database.md) dòng "chưa phê duyệt".

> **Đã chuyển sang Accepted (Wave 2/ADR-002):** `place_hotel_details`, `hotel_room_types`, `amenities`, `place_amenities`, `place_restaurant_details`, `restaurant_menu_sections`, `restaurant_menu_items`, `cuisines`, `place_cuisines`, `place_tour_details`, `tour_stops`, `tour_schedules`, `events`, `event_occurrences` → xem §11–§12.

## Phụ lục C — Vấn đề mở ảnh hưởng dictionary

- ~~**Naming discriminator** (UPPERCASE vs lowercase) chưa chuẩn hóa~~ ✅ **B-3 đóng (2026-07-13):** toàn bộ discriminator đa hình → `lowercase snake_case` (`contacts.owner_type`, `price_history.entity_type` chuyển từ UPPERCASE; `source_attributions`/`wiki_revisions`/`audit_logs` vốn đã lowercase).
- **`reviews`** thiếu `updated_at`/`deleted_at` trong tài liệu nguồn dù API hỗ trợ edit/delete.
- ~~**ADR-002/003** chưa Accepted~~ ✅ **Accepted 2026-07-13** — nền tảng arc/polymorphic + Place Extension (satellite) đã chốt; media arc = 5 nhánh (+event_id).

---

*Nguồn authoritative: [database.md](./database.md), [places.md](./modules/places.md), [source.md](./modules/source.md), [verification.md](./modules/verification.md), [business.md](./modules/business.md), [analytics.md](./modules/analytics.md). Cập nhật khi các tài liệu này đổi.*
