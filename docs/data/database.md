# PhuQuocHub — Thiết kế cơ sở dữ liệu (Database)

## 1. Nền tảng

- **PostgreSQL 15+** với extension **PostGIS** (dữ liệu không gian).
- Hệ tọa độ: **SRID 4326** (WGS84 — kinh độ/vĩ độ chuẩn GPS/OSM).
- Đặt tên: `snake_case`, bảng số nhiều (`places`, `reviews`).
- Mỗi bảng có: `id` (UUID), `created_at`, `updated_at`, `deleted_at` (soft delete khi phù hợp).

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

## 2. Sơ đồ quan hệ (ERD — tổng quan)

```
users ──1:N── contributions ──N:1── places
  │                                    │
  │ 1:N                                │ 1:N
  ▼                                    ▼
reviews ──────────────N:1─────────► places ──N:1── categories
  │                                    │
  └── media (exclusive arc) ◄──────────┘
users ──1:N── community_posts ──1:N── community_comments
```

## 3. Các bảng chính

### 3.1 `users` — Người dùng
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | UUID (PK) | |
| email | VARCHAR unique | |
| password_hash | VARCHAR | null nếu OAuth |
| display_name | VARCHAR | |
| avatar_url | VARCHAR | |
| provider | ENUM | local, google |
| is_active | BOOLEAN | |
| is_service_account | BOOLEAN | default false — AI Agent / service principal ([rbac.md §4.10](../security/rbac.md)) |
| created_at / updated_at | TIMESTAMPTZ | |

> **Vai trò (RBAC):** **bỏ** cột `role` ENUM. Vai trò được gán qua bảng **`user_roles`** (§3.13) theo mô hình RBAC **hướng dữ liệu** — một principal có thể giữ **nhiều** vai trò. Chi tiết §3.9–3.13 và [rbac.md](../security/rbac.md).

### 3.2 `categories` — Phân loại địa điểm
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | UUID (PK) | |
| slug | VARCHAR unique | vd: beach, restaurant, homestay |
| name_vi | VARCHAR | Tên tiếng Việt |
| name_en | VARCHAR | Tên tiếng Anh |
| icon | VARCHAR | |
| parent_id | UUID (FK → categories) | phân cấp cây |

### 3.3 `places` — Địa điểm (POI) — **bảng lõi**

> **Nguồn sự thật duy nhất (ADR-001, B7):** định nghĩa trường đầy đủ (kiểu, nullable, unique, FK, index, audit) ở **[places.md §3](./modules/places.md)** — tài liệu này **không định nghĩa lại** schema Place để tránh lệch (drift). Mục này chỉ giữ **tổng quan + quan hệ**.

**Tổng quan:** thực thể trung tâm (POI) mà mọi module tham chiếu (ADR-001). Place chỉ chứa **dữ liệu ổn định** (name, slug, location `GEOGRAPHY(Point,4326)`, address, `ward`, category, opening_hours JSONB, price_range, osm_id, audit/soft-delete) + **cache đọc nhanh job-synced** (`rating_avg`, `rating_count`, `view_count`, `verification_status`, `verified_at`). Mọi dữ liệu biến động nằm ở entity vệ tinh.

**Quan hệ chính:**

| Quan hệ | Entity | Ghi chú |
|---|---|---|
| N:1 | `categories` | phân loại |
| 1:N | `contacts` (owner=place) | liên hệ — ADR-005 |
| 1:N | `price_history` (entity=place) | giá/lịch sử giá — ADR-006 |
| 1:N | `media` (place_id, exclusive arc) | ảnh/video — ADR-009; ảnh đại diện qua `cover_image_id` |
| 1:N | `wiki_revisions` (entity=place) | phiên bản/lịch sử (kiêm lịch sử trạng thái, WF-14) — ADR-014 |
| 1:1 (arc) | `verifications` | xác minh — ADR-008; cache `verification_status`/`verified_at` |
| 1:N | `reviews` · `contributions` · `place_faqs` | cộng đồng & đóng góp |
| 1:1 | `place_seo` · `place_ai_summary` | SEO / AI summary |

**Index không gian (bắt buộc):** `GIST(location)` — bộ index đầy đủ (UNIQUE slug, BTREE, GIN FTS) ở [places.md §3](./modules/places.md).

### 3.4 `reviews` — Đánh giá
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | UUID (PK) | |
| place_id | UUID (FK → places) | |
| user_id | UUID (FK → users) | |
| rating | SMALLINT | 1–5 |
| content | TEXT | |
| status | ENUM | pending, published, hidden |
| created_at | TIMESTAMPTZ | |

Ràng buộc: `UNIQUE(place_id, user_id)` — mỗi người 1 review/địa điểm.

### 3.5 `media` — Ảnh / video (exclusive arc)

Một bảng chung cho ảnh/video của **Place · Review · Community Post · Business · Event**. **Không polymorphic** (không `owner_type/owner_id`): dùng **exclusive arc** — nhiều FK nullable + `CHECK` đúng-một — để giữ FK thật + `ON DELETE CASCADE` ([ADR-009](../99-decisions/ADR-009-media-model.md), theo nguyên tắc [ADR-003](../99-decisions/ADR-003-no-polymorphic.md)). **Thay hoàn toàn `place_media`.** Media của Event dùng **chung pipeline** qua `event_id` — **không** có bảng `event_media` (Wave 2/ADR-002).

| Cột | Kiểu | Null | Ghi chú |
|---|---|---|---|
| id | UUID (PK) | ✗ | |
| place_id | UUID (FK → places) | ✓ | *exclusive arc* |
| review_id | UUID (FK → reviews) | ✓ | |
| post_id | UUID (FK → community_posts) | ✓ | |
| business_id | UUID (FK → places) | ✓ | media **chính thức** do cơ sở đăng (Place đã claim) — vs `place_id` = media cộng đồng; **chốt B8/[ADR-015](../99-decisions/ADR-015-business-ownership-model.md)** |
| event_id | UUID (FK → events) | ✓ | *exclusive arc* — media của một Sự kiện (gallery); `events.cover_media_id` chỉ là hero/thumbnail. **Wave 2/[ADR-002](../99-decisions/ADR-002-place-extension.md)** |
| type | ENUM | ✗ | `image, video` |
| url | VARCHAR(500) | ✗ | link object storage (không lưu nhị phân trong DB) |
| thumbnail_url | VARCHAR(500) | ✓ | ảnh thu nhỏ / poster video |
| provider | ENUM | ✗ | `upload, youtube, vimeo` |
| external_id | VARCHAR(100) | ✓ | id video nếu nhúng (YouTube…) |
| width / height | INT | ✓ | kích thước (ảnh) |
| duration | INT | ✓ | thời lượng giây (video) |
| caption | VARCHAR(300) | ✓ | chú thích |
| alt_text | VARCHAR(200) | ✓ | alt cho SEO/accessibility |
| sort_order | INT | ✓ | thứ tự trong gallery |
| status | ENUM | ✗ | `pending, published, hidden, rejected` (kiểm duyệt — WF-17/18) |
| ai_moderation_score | NUMERIC(4,3) | ✓ | điểm AI kiểm ảnh ([WF-18](../workflow/moderation.md)) |
| ai_labels | JSONB | ✓ | nhãn AI (NSFW/bạo lực/không liên quan) |
| uploaded_by | UUID (FK → users) | ✓ | |
| created_at / updated_at | TIMESTAMPTZ | ✗ | |
| deleted_at | TIMESTAMPTZ | ✓ | soft delete |

**Ràng buộc exclusive arc — đúng một chủ sở hữu:**
```sql
ALTER TABLE media ADD CONSTRAINT chk_media_one_owner CHECK (
    (place_id    IS NOT NULL)::int
  + (review_id   IS NOT NULL)::int
  + (post_id     IS NOT NULL)::int
  + (business_id IS NOT NULL)::int
  + (event_id    IS NOT NULL)::int = 1
);
```

**Index:** partial theo từng FK — `(place_id) WHERE place_id IS NOT NULL` (và tương tự `review_id`/`post_id`/`business_id`/`event_id`); `(place_id, sort_order) WHERE place_id IS NOT NULL` và `(event_id, sort_order) WHERE event_id IS NOT NULL` (gallery); `(status)`.

- Ảnh đại diện Place: `places.cover_image_id → media` ([places.md §3](./modules/places.md)); hero Event: `events.cover_media_id → media` (§3.22).
- **Biểu diễn ORM:** **5 quan hệ optional** (place/review/post/business/event) trên `media`; `CHECK` đúng-một áp qua migration (ORM không hỗ trợ FK đa hình gốc — [erd.md §5](./erd.md)).

### 3.6 `contributions` — Đóng góp & kiểm duyệt
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | UUID (PK) | |
| user_id | UUID (FK → users) | người đóng góp |
| place_id | UUID (FK → places) | null nếu tạo mới |
| type | ENUM | create, update, report |
| payload | JSONB | dữ liệu đề xuất |
| status | ENUM | pending, approved, rejected |
| reviewed_by | UUID (FK → users) | moderator |
| review_note | TEXT | |
| created_at / reviewed_at | TIMESTAMPTZ | |

### 3.7 `community_posts` — Bài viết cộng đồng
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | UUID (PK) | |
| author_id | UUID (FK → users) | |
| title | VARCHAR | |
| slug | VARCHAR unique | |
| content | TEXT / Markdown | |
| place_id | UUID (FK → places) | null nếu không gắn địa điểm |
| status | ENUM | draft, published, hidden |
| created_at / updated_at | TIMESTAMPTZ | |

### 3.8 `community_comments` — Bình luận
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | UUID (PK) | |
| post_id | UUID (FK → community_posts) | |
| author_id | UUID (FK → users) | |
| parent_id | UUID (FK self) | trả lời lồng nhau |
| content | TEXT | |
| created_at | TIMESTAMPTZ | |

### 3.9 `roles` — Vai trò (RBAC, dạng dữ liệu)

Thay cho `users.role` ENUM cũ. Danh mục vai trò chi tiết ở [rbac.md §4](../security/rbac.md).

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | UUID (PK) | |
| code | VARCHAR unique | định danh máy: `guest, member, local_guide, contributor, business_owner, business_manager, moderator, administrator, super_administrator, ai_agent` |
| name | VARCHAR | tên hiển thị |
| description | VARCHAR | |
| is_system | BOOLEAN default true | vai trò lõi — không cho xóa; đổi lược đồ cần `Permission.Manage` |
| is_assignable | BOOLEAN default true | có thể gán trực tiếp cho user (`Role.Assign`) |
| created_at / updated_at | TIMESTAMPTZ | |

### 3.10 `permissions` — Quyền nguyên tử

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | UUID (PK) | |
| code | VARCHAR unique | `Module.Action[.Scope]`, vd `Place.Edit.Own`; hỗ trợ wildcard `Place.*`, `*` |
| module | VARCHAR | vd `Place`, `Review`, `AI` |
| action | VARCHAR | vd `Edit`, `Approve`, `Verify` |
| scope | VARCHAR | `Own, Managed, Any` hoặc null (mức chung) |
| description | VARCHAR | |
| created_at / updated_at | TIMESTAMPTZ | |

### 3.11 `role_permissions` — Ánh xạ Role→Permission (N–N)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| role_id | UUID (FK → roles) | |
| permission_id | UUID (FK → permissions) | |
| effect | ENUM | `allow, deny` (default `allow`) — hỗ trợ **explicit deny** ([security.md §5](../architecture/security.md)) |
| created_at | TIMESTAMPTZ | |

PK `(role_id, permission_id)`.

### 3.12 `role_parents` — Kế thừa vai trò (DAG)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| role_id | UUID (FK → roles) | vai trò **con** |
| parent_role_id | UUID (FK → roles) | vai trò **cha** (kế thừa quyền) |
| created_at | TIMESTAMPTZ | |

PK `(role_id, parent_role_id)`; `CHECK(role_id <> parent_role_id)`; đồ thị **không chu trình** (DAG — cưỡng chế ở tầng nghiệp vụ). Mô hình kế thừa ở [rbac.md §5](../security/rbac.md).

### 3.13 `user_roles` — Gán vai trò cho principal (kèm scope)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | UUID (PK) | |
| user_id | UUID (FK → users) | principal (người hoặc service account) |
| role_id | UUID (FK → roles) | |
| scope_type | ENUM | `global, managed, own` (default `global`) |
| business_id | UUID (FK → places) | null; **chỉ dùng khi `scope_type=managed`** — cơ sở (Place đã claim) được giao. Quan hệ sở hữu chi tiết ở **`business_members`** (**Accepted** — B8/[ADR-015](../99-decisions/ADR-015-business-ownership-model.md)). |
| granted_by | UUID (FK → users) | ai gán (null nếu hệ thống/seed) |
| granted_at | TIMESTAMPTZ | |
| revoked_at | TIMESTAMPTZ | null = đang hiệu lực |

`UNIQUE(user_id, role_id, business_id) WHERE revoked_at IS NULL`; index `(user_id) WHERE revoked_at IS NULL`.

> **Vai trò mặc định khi đăng ký:** gán `member` qua `user_roles` (thay cột ENUM cũ — [WF-01](../workflow/workflow.md)). Một principal giữ được **nhiều** vai trò (vd Contributor + Business Owner *scope Managed*). **AI Agent** = user có `is_service_account=true` mang vai trò `ai_agent` ([rbac.md §4.10](../security/rbac.md), [security.md §8](../architecture/security.md)).

### 3.14 `contacts` — Thông tin liên hệ (dùng chung, polymorphic)

Bảng **dùng chung** cho mọi kênh liên hệ của **Place · Business · module tương lai** (RealEstate, JobPosting…). **Thay hoàn toàn** các cột liên hệ inline (`phone/hotline/website/email/facebook…`) trên `places` (và Business). Thiết kế **polymorphic** (`owner_type/owner_id`) theo **ngoại lệ ADR-003** cho tham chiếu **lỏng & nhiều loại chủ** (như `source_attributions`), để **tái sử dụng đa module không đổi schema** ([ADR-005](../99-decisions/ADR-005-contact-entity.md)).

| Cột | Kiểu | Null | Ghi chú |
|---|---|---|---|
| id | UUID (PK) | ✗ | |
| owner_type | VARCHAR(30) | ✗ | **lowercase snake_case (B-3):** `place, business` (mở rộng: `real_estate, job_posting…` — **không đổi schema**). `business` = liên hệ **chính thức** của cơ sở (Place đã claim) vs `place` = cộng đồng — [ADR-015](../99-decisions/ADR-015-business-ownership-model.md) |
| owner_id | UUID | ✗ | id thực thể chủ (**không FK cứng** — polymorphic; toàn vẹn cưỡng chế ở tầng ứng dụng). Với `BUSINESS` → `places.id` |
| contact_type | VARCHAR(30) | ✗ | `HOTLINE, PHONE, EMAIL, WEBSITE, FACEBOOK, INSTAGRAM, TIKTOK, ZALO, YOUTUBE, OTHER` (**kênh mới không đổi schema**) |
| value | VARCHAR(300) | ✗ | số / URL / handle |
| label | VARCHAR(120) | ✓ | nhãn tùy chọn ("Lễ tân", "Đặt tour") |
| is_primary | BOOLEAN default false | ✗ | liên hệ chính của loại đó |
| verification_status | ENUM | ✗ | cache từ `verifications`: `pending, verified, official, community_verified, expired, rejected` (default `pending`) — [verification.md §6](./modules/verification.md) |
| verified_at | TIMESTAMPTZ | ✓ | thời điểm đạt trạng thái tin cậy gần nhất |
| display_order | INT default 0 | ✗ | thứ tự hiển thị |
| created_at / updated_at | TIMESTAMPTZ | ✗ | |
| deleted_at | TIMESTAMPTZ | ✓ | soft delete |

**Index:** `(owner_type, owner_id)`; `(owner_type, owner_id, contact_type)`; **partial UNIQUE** `(owner_type, owner_id, contact_type) WHERE is_primary AND deleted_at IS NULL` (một *primary* mỗi loại/chủ).

- **Verification:** `verifications.contact_id → contacts.id` (FK thật, exclusive arc — [verification.md §4](./modules/verification.md)); provenance qua `source_attributions(entity_type='contact')`.
- **Vì sao polymorphic (khác `media` exclusive arc):** `media` cần cascade + **ít loại chủ** → arc; `contacts` **nhiều loại chủ + tái dùng đa module** → polymorphic (ngoại lệ ADR-003, như `source_attributions`).

### 3.15 `price_history` — Lịch sử giá & bảng giá (dùng chung, polymorphic)

**Thay hoàn toàn `place_tickets`.** Bảng dùng chung cho mọi khoản giá của **Place · Hotel · Tour · Event · Business Service · Real Estate** (tương lai), **append-only theo thời gian** (giữ lịch sử, không ghi đè) và đồng thời là **bảng giá hiện hành** (bản ghi đang trong `[valid_from, valid_to]`). Thiết kế **polymorphic** (`entity_type/entity_id`) theo **ngoại lệ ADR-003** (như `contacts`); xác minh qua `verifications.price_history_id` (exclusive arc) — [ADR-006](../99-decisions/ADR-006-price-history.md).

| Cột | Kiểu | Null | Ghi chú |
|---|---|---|---|
| id | UUID (PK) | ✗ | |
| entity_type | VARCHAR(30) | ✗ | **lowercase snake_case (B-3):** `place, hotel, tour, event, business_service, real_estate` (mở rộng **không đổi schema**) |
| entity_id | UUID | ✗ | id thực thể chủ (**không FK cứng** — polymorphic). "Place 1:N PriceHistory" = `entity_type=place, entity_id=places.id` |
| service_name | VARCHAR(120) | ✗ | tên khoản giá: "Người lớn", "Trẻ em", "Combo", "Phòng Deluxe"… (thay `name` của place_tickets) |
| amount | NUMERIC(12,2) | ✗ | giá |
| currency | CHAR(3) default 'VND' | ✗ | tiền tệ |
| unit | VARCHAR(40) | ✓ | `/vé, /người, /giờ, /đêm` (giữ từ place_tickets) |
| is_free | BOOLEAN default false | ✗ | miễn phí (giữ từ place_tickets) |
| description | VARCHAR(300) | ✓ | điều kiện áp dụng |
| display_order | INT default 0 | ✗ | thứ tự hiển thị (thay `sort_order`) |
| valid_from | TIMESTAMPTZ | ✓ | bắt đầu hiệu lực |
| valid_to | TIMESTAMPTZ | ✓ | hết hiệu lực (null = không hạn) → job tự `expired` |
| source_id | UUID (FK → sources) | ✓ | provenance (thay cột `source` thô — nối `source_attributions`/`verifications`) |
| verification_status | ENUM | ✗ | cache từ `verifications`: `pending, verified, official, community_verified, expired, rejected` (default `pending`) — [verification.md §6](./modules/verification.md) |
| verified_at | TIMESTAMPTZ | ✓ | thời điểm đạt trạng thái tin cậy gần nhất |
| updated_by | UUID (FK → users) | ✓ | |
| created_at / updated_at | TIMESTAMPTZ | ✗ | |
| deleted_at | TIMESTAMPTZ | ✓ | soft delete |

**Index:** `(entity_type, entity_id)`; `(entity_type, entity_id, service_name)`; `(entity_type, entity_id, valid_to)` (quét `expired` / lấy giá hiện hành); `(source_id)`.

- **"Giá hiện hành"** = bản ghi mới nhất mỗi `service_name` với `now ∈ [valid_from, valid_to]` (hoặc `valid_to` null).
- `places.price_range` (ENUM thô `free/low/mid/high`) **giữ lại** làm **bộ lọc nhanh**, không thay bằng `price_history`.
- **Vì sao polymorphic (khác `media` arc):** nhiều loại chủ + tái dùng đa module → polymorphic (ngoại lệ ADR-003, như `contacts`).

### 3.16 `verifications` — Xác minh dữ liệu (exclusive arc, máy trạng thái)

Thực thể xác minh **dùng chung** cho Place/Contact/PriceHistory theo **máy trạng thái** + **exclusive arc** (FK thật, không polymorphic). Thiết kế đầy đủ (transitions, `CHECK`, partial-unique, index) ở [verification.md §3–§5](./modules/verification.md); tóm tắt trường:

| Cột | Kiểu | Null | Ghi chú |
|---|---|---|---|
| id | UUID (PK) | ✗ | |
| place_id | UUID (FK → places) | ✓ | *exclusive arc* — đúng một target |
| contact_id | UUID (FK → contacts) | ✓ | |
| price_history_id | UUID (FK → price_history) | ✓ | |
| status | ENUM | ✗ | `pending, verified, official, community_verified, expired, rejected` |
| method | ENUM | ✗ | `moderator, owner_claim, source_match, community_vote, system_auto` |
| source_id | UUID (FK → sources) | ✓ | **bắt buộc khi `official`** |
| confidence | SMALLINT | ✓ | 0–100 |
| confirm_count / dispute_count | INT default 0 | ✗ | **cache dẫn xuất** từ `verification_votes` (§3.18) |
| reason_code | ENUM | ✓ | mã lý do khi `rejected` (`duplicate/fabricated/outdated/insufficient_evidence/policy_violation/wrong_target/other`) |
| verified_by | UUID (FK → users) | ✓ | |
| assigned_to | UUID (FK → users) | ✓ | moderator phụ trách (hàng đợi) |
| assigned_at / sla_due_at | TIMESTAMPTZ | ✓ | nhận việc / hạn SLA |
| priority | SMALLINT default 0 | ✗ | ưu tiên hàng đợi (0…3) |
| note / rejected_reason | VARCHAR(300) | ✓ | |
| valid_from / expires_at | TIMESTAMPTZ | ✓ | `expires_at` → job tự `expired` (official mặc định +12 tháng) |
| lock_version | INT default 0 | ✗ | **optimistic lock** (chống ghi đè transition đồng thời) |
| created_by | UUID (FK → users) | ✓ | |
| created_at / updated_at | TIMESTAMPTZ | ✗ | |

**Ràng buộc:** `CHECK` đúng-một `(place_id, contact_id, price_history_id)`; `CHECK(status <> 'official' OR source_id IS NOT NULL)`; `CHECK(status <> 'rejected' OR reason_code IS NOT NULL)`; **partial UNIQUE** mỗi target (một xác minh hiện hành/đối tượng). **Index hàng đợi:** `(assigned_to, sla_due_at) WHERE status='pending'`.

> **Cache đọc nhanh:** `places`/`contacts`/`price_history` giữ `verification_status` (+`verified_at`) — **thay hoàn toàn `is_verified`** (bỏ). "Đã xác minh?" = `verification_status IN ('verified','official','community_verified')`.

### 3.17 `verification_events` — Lịch sử chuyển trạng thái (append-only)

Audit trail **bất biến** của `verifications` — một FK duy nhất (không polymorphic).

| Cột | Kiểu | Null | Ghi chú |
|---|---|---|---|
| id | UUID (PK) | ✗ | |
| verification_id | UUID (FK → verifications) | ✗ | **`ON DELETE CASCADE`** |
| from_status | ENUM | ✓ | null nếu khởi tạo |
| to_status | ENUM | ✗ | |
| method | ENUM | ✗ | |
| source_id | UUID (FK → sources) | ✓ | nguồn căn cứ lần chuyển |
| actor_id | UUID (FK → users) | ✓ | null = system |
| note | VARCHAR(300) | ✓ | |
| created_at | TIMESTAMPTZ | ✗ | |

**Index:** `(verification_id, created_at)`.

### 3.18 `verification_votes` — Sổ phiếu cộng đồng (chống trùng, có kiểm toán)

Nguồn sự thật cho `community_verified`: **một người một phiếu**, thu hồi/đổi được, có kiểm toán; `confirm_count`/`dispute_count` ở §3.16 chỉ là cache dẫn xuất. Chi tiết [verification.md §5B](./modules/verification.md).

| Cột | Kiểu | Null | Ghi chú |
|---|---|---|---|
| id | UUID (PK) | ✗ | |
| verification_id | UUID (FK → verifications) | ✗ | **`ON DELETE CASCADE`** |
| user_id | UUID (FK → users) | ✗ | người bỏ phiếu |
| vote | ENUM | ✗ | `confirm, dispute` |
| weight | SMALLINT default 1 | ✗ | trọng số theo uy tín (Local Guide > Member) |
| note | VARCHAR(300) | ✓ | lý do (nhất là `dispute`) |
| created_at | TIMESTAMPTZ | ✗ | |

**Ràng buộc:** **UNIQUE** `(verification_id, user_id)` — một người một phiếu (idempotent). **Index:** `(verification_id)`.

### 3.19 `business_claims` — Yêu cầu nhận quyền cơ sở (Business Claim)

Yêu cầu chủ cơ sở nhận quyền quản lý một `Place` (state machine + audit). Mô hình **Place-centric** — [ADR-015](../99-decisions/ADR-015-business-ownership-model.md); thiết kế đầy đủ ở [business.md §2](./modules/business.md).

| Cột | Kiểu | Null | Ghi chú |
|---|---|---|---|
| id | UUID (PK) | ✗ | |
| place_id | UUID (FK → places) | ✗ | cơ sở được claim |
| requester_id | UUID (FK → users) | ✗ | người gửi |
| evidence | JSONB | ✗ | bằng chứng (**riêng tư, chỉ Moderator**) |
| status | ENUM | ✗ | `pending, approved, rejected, disputed, withdrawn` |
| reviewer_id | UUID (FK → users) | ✓ | Moderator xử lý |
| reason_code | ENUM | ✓ | khi `rejected` (`insufficient_evidence/duplicate/fraud/wrong_target/other`) |
| decision_note | VARCHAR(300) | ✓ | |
| decided_at | TIMESTAMPTZ | ✓ | |
| created_at / updated_at | TIMESTAMPTZ | ✗ | |

**Ràng buộc:** `CHECK(status<>'rejected' OR reason_code IS NOT NULL)`; **partial UNIQUE** `(place_id, requester_id) WHERE status='pending'` (chống claim trùng). **Index:** `(place_id, status)`.

### 3.20 `business_members` — Sở hữu & ủy quyền hiệu lực

Sổ sở hữu/ủy quyền của cơ sở (`role ∈ {owner, manager}`). Đồng bộ với `user_roles` (scope Managed). Chi tiết [business.md §3](./modules/business.md).

| Cột | Kiểu | Null | Ghi chú |
|---|---|---|---|
| id | UUID (PK) | ✗ | |
| place_id | UUID (FK → places) | ✗ | cơ sở |
| user_id | UUID (FK → users) | ✗ | thành viên |
| role | ENUM | ✗ | `owner, manager` |
| claim_id | UUID (FK → business_claims) | ✓ | nguồn gốc (với owner) |
| granted_by | UUID (FK → users) | ✓ | người cấp |
| granted_at | TIMESTAMPTZ | ✗ | |
| revoked_at | TIMESTAMPTZ | ✓ | thu hồi (soft); null = còn hiệu lực |

**Ràng buộc (cưỡng chế nghiệp vụ):** **partial UNIQUE** `(place_id) WHERE role='owner' AND revoked_at IS NULL` (**một Owner hiệu lực/cơ sở — BR-B2**); **partial UNIQUE** `(place_id, user_id) WHERE revoked_at IS NULL`. **Index:** `(user_id) WHERE revoked_at IS NULL`.

> **Owner hiệu lực** = `role='owner' AND revoked_at IS NULL`. Claim `approved` → tạo `business_members(owner)` + đặt `verifications(place)` = `official` (source `business_owner`, ADR-008).

### 3.21 `audit_logs` — Nhật ký kiểm toán (append-only, bất biến)

Sổ **kiểm toán xuyên suốt** cho **mọi hành động đặc quyền / đổi trạng thái** (khớp dòng *"Audit Log:"* của cả 20 workflow và [security.md §9](../architecture/security.md)). Đây là **tầng audit thứ tư**, **bổ sung chứ không thay** các audit chuyên biệt đã có:

| Tầng | Bảng | Phạm vi |
|---|---|---|
| Nội dung (content history) | `wiki_revisions` | thay đổi nội dung Place/Topic (snapshot/diff) |
| Nguồn (provenance) | `source_attributions` | từng trường/bản ghi đến từ nguồn nào |
| Xác minh (state machine) | `verification_events` | chuyển trạng thái của `verifications` |
| **Hành chính & bảo mật** | **`audit_logs`** | **login, ban, gán role, đổi lược đồ RBAC, impersonation, claim/transfer, broadcast, duyệt/từ chối…** — những thứ 3 tầng trên **không** bao phủ |

Thiết kế **đa hình** (`entity_type/entity_id`, **không FK cứng** — ngoại lệ [ADR-003](../99-decisions/ADR-003-no-polymorphic.md) như `source_attributions`) vì audit phải trỏ tới **mọi loại** tài nguyên và **sống sót** kể cả khi tài nguyên bị xóa/soft-delete ([ADR-016](../99-decisions/ADR-016-audit-log-model.md)).

| Cột | Kiểu | Null | Ghi chú |
|---|---|---|---|
| id | UUID (PK) | ✗ | |
| event | VARCHAR(60) | ✗ | mã sự kiện chuẩn hóa `module.action` — khớp trực tiếp dòng *"Audit Log:"* của workflow (`user.registered`, `auth.login.success`, `place.status_changed`, `moderation.decided`, `business.claim_approved`, `role.assigned`, `user.impersonated`…) |
| actor_id | UUID (FK → users) | ✓ | người/service thực hiện; **null = hệ thống/job** |
| actor_role | VARCHAR(40) | ✓ | vai trò **hiệu lực lúc hành động** (snapshot — vai trò có thể đổi về sau) |
| is_service_account | BOOLEAN default false | ✗ | phân biệt AI Agent/hệ thống vs người ([rbac.md §4.10](../security/rbac.md)) |
| permission | VARCHAR(60) | ✓ | permission đã đánh giá (khớp security.md §9: *ai · permission · resource · scope · result*) |
| scope | VARCHAR(10) | ✓ | `Own, Managed, Any` (null = mức chung) |
| entity_type | VARCHAR(40) | ✗ | loại tài nguyên: `place, review, media, contact, price_history, verification, wiki_revision, contribution, business_claim, business_member, user, role, permission, notification…` |
| entity_id | UUID | ✓ | id tài nguyên (**không FK cứng** — đa hình; null cho sự kiện không gắn 1 tài nguyên, vd login) |
| result | ENUM | ✗ | `success, failure, allow, deny` |
| ip | INET | ✓ | địa chỉ IP (WF-01/02 yêu cầu) |
| user_agent | VARCHAR(300) | ✓ | thiết bị/agent |
| before | JSONB | ✓ | ảnh chụp **trước** thay đổi (tùy chọn; **redact PII/secret**) |
| after | JSONB | ✓ | ảnh chụp **sau** thay đổi (tùy chọn; **redact PII/secret**) |
| context | JSONB | ✓ | bổ sung: `reason`, `from→to`, `decision`, `reason_code`, `source_ref`… |
| correlation_id | UUID | ✓ | nối chuỗi hành động cùng một request/job (điều tra) |
| created_at | TIMESTAMPTZ | ✗ | **chỉ có `created_at`** — **không** `updated_at`/`deleted_at` |

**Bất biến (immutable, append-only):** chỉ `INSERT`; **không** `UPDATE`/`DELETE`/soft-delete. Cưỡng chế ở tầng ứng dụng + quyền DB (role ghi chỉ có `INSERT`). Xóa theo **retention policy** (vd giữ tối thiểu 12 tháng, archive lạnh sau đó) — không sửa từng dòng.

**Index:** `(entity_type, entity_id, created_at)` (lịch sử một tài nguyên); `(actor_id, created_at)` (điều tra theo người); `(event, created_at)`; `(correlation_id) WHERE correlation_id IS NOT NULL`. Khuyến nghị **partition theo `created_at`** (tháng) cho khối lượng lớn.

> **Ranh giới với `verification_events`:** `verification_events` là audit **chi tiết, có FK cứng + cascade** của riêng máy trạng thái Verification; `audit_logs` là audit **rộng, không cascade** cho toàn hệ thống. Một transition Verification có thể sinh **cả hai** (chi tiết kỹ thuật ở `verification_events`, dấu vết hành chính "ai·quyền·kết quả" ở `audit_logs`) — không mâu thuẫn, khác mục đích.

### 3.22 `events` — Sự kiện (thực thể peer, Hybrid — **KHÔNG** phải Place extension)

Thực thể **theo thời gian**, tham chiếu Place chứ **không** nằm trong `places` (**Wave 2/[ADR-002](../99-decisions/ADR-002-place-extension.md)**, mô hình **Hybrid**). Tái dùng tầng Place qua liên kết: media (`media.event_id`, §3.5), giá vé (`price_history` `entity_type='event'`), provenance (`source_attributions('event')`), phiên bản (`wiki_revisions('event')`).

| Cột | Kiểu | Null | Ghi chú |
|---|---|---|---|
| id | UUID (PK) | ✗ | |
| title | VARCHAR(200) | ✗ | |
| slug | VARCHAR(220) UNIQUE | ✗ | |
| description | TEXT | ✓ | |
| cover_media_id | UUID (FK → media) | ✓ | **chỉ** hero/thumbnail; gallery qua `media.event_id` |
| start_at | TIMESTAMPTZ | ✗ | |
| end_at | TIMESTAMPTZ | ✗ | `CHECK(start_at < end_at)` |
| timezone | VARCHAR(40) | ✗ | default `Asia/Ho_Chi_Minh` |
| place_id | UUID (FK → places) | ✓ | địa điểm tổ chức (**nullable** — online/không cố định, BR-E3) |
| organizer_id | UUID (FK → places) | ✓ | nhà tổ chức = cơ sở đã claim (Place) |
| event_category | VARCHAR(60) | ✓ | `festival, music, food, cultural, sport, mice, other` |
| status | ENUM | ✗ | nội dung: `draft, pending, published, archived` |
| status_override | ENUM | ✓ | `cancelled, postponed` (null = theo thời gian); trạng thái thời gian `upcoming/ongoing/ended` **suy diễn**, không lưu (BR-E2) |
| recurrence_rule | VARCHAR(300) | ✓ | RRULE-like (BR-E5) |
| created_by / updated_by | UUID (FK → users) | ✓ | |
| created_at / updated_at | TIMESTAMPTZ | ✗ | |
| deleted_at | TIMESTAMPTZ | ✓ | soft delete |

**Ràng buộc:** `CHECK(start_at < end_at)`. **Index:** `UNIQUE(slug)`; `(start_at, end_at)` (calendar); `(place_id)`; `(organizer_id)`; `(status) WHERE deleted_at IS NULL`; GIN FTS(title+description).

### 3.23 `event_occurrences` — Lần diễn ra (sự kiện định kỳ)

Vật chất hóa từng "occurrence" của sự kiện định kỳ (BR-E5) để hiển thị/nhắc lịch.

| Cột | Kiểu | Null | Ghi chú |
|---|---|---|---|
| id | UUID (PK) | ✗ | |
| event_id | UUID (FK → events) | ✗ | **`ON DELETE CASCADE`** |
| start_at | TIMESTAMPTZ | ✗ | |
| end_at | TIMESTAMPTZ | ✗ | `CHECK(start_at < end_at)` |
| status_override | ENUM | ✓ | `cancelled, postponed` cho riêng lần này |
| created_at | TIMESTAMPTZ | ✗ | |

**Index:** `(event_id, start_at)`.

### 3.24 Bảng mở rộng Place (Hotel/Restaurant/Tour) — **định nghĩa tại [places.md §13](./modules/places.md)**

Theo **[ADR-002](../99-decisions/ADR-002-place-extension.md)** (satellite) + nguyên tắc SSOT/B7: schema đầy đủ (trường/kiểu/index) của **12 bảng mở rộng** là **authoritative tại [places.md §13](./modules/places.md)** — mục này **không** chép lại để tránh drift, chỉ liệt kê để tra cứu:

| Loại | Bảng | Quan hệ |
|---|---|---|
| Hotel | `place_hotel_details` (1:1) · `hotel_room_types` (1:N) · `amenities` (dict) · `place_amenities` (N:N) | `place_id` |
| Restaurant | `place_restaurant_details` (1:1) · `restaurant_menu_sections` (1:N) · `restaurant_menu_items` (1:N section) · `cuisines` (dict) · `place_cuisines` (N:N) | `place_id` |
| Tour | `place_tour_details` (1:1) · `tour_stops` (1:N) · `tour_schedules` (1:N) | `place_id` |

> **Nguyên tắc:** discriminator = `places.category`; **0 cột thêm vào `places`**; FK thật + `ON DELETE CASCADE`; giá xác minh dùng `price_history` (`entity_type` `hotel/tour`), `price_ref` chỉ là cache hiển thị.

## 4. Truy vấn không gian mẫu

```sql
-- Tìm địa điểm trong bán kính 2km quanh một điểm
SELECT id, name,
       ST_Distance(location, ST_MakePoint(:lng, :lat)::geography) AS distance_m
FROM places
WHERE status = 'published'
  AND ST_DWithin(location, ST_MakePoint(:lng, :lat)::geography, 2000)
ORDER BY distance_m
LIMIT 20;
```

## 5. Tìm kiếm văn bản (giai đoạn đầu)

- Dùng **PostgreSQL Full-Text Search** với cột `tsvector` tạo từ `name + description`.
- Hỗ trợ tiếng Việt: cân nhắc `unaccent` để tìm không dấu.
```sql
CREATE INDEX idx_places_fts ON places
USING GIN (to_tsvector('simple', unaccent(name || ' ' || description)));
```
- Khi dữ liệu lớn → chuyển sang **Meilisearch/Elasticsearch**.

## 6. Migration & Seed

- Quản lý schema bằng **migration** (TypeORM migrations), không dùng `synchronize` ở production.
- Seed dữ liệu ban đầu: danh mục, một số địa điểm import từ OSM (`osm_id`).

## 7. Nguyên tắc dữ liệu

- **Soft delete** (`deleted_at`) cho dữ liệu người dùng đóng góp.
- **Audit:** vết chủ thể ở `created_by`/`reviewed_by`/`updated_by` (mức bản ghi) **+** nhật ký hành động đặc quyền **bất biến** ở `audit_logs` (§3.21) cho mọi thao tác đổi trạng thái/đặc quyền.
- Denormalize có kiểm soát (`rating_avg`, `rating_count`) để giảm join, cập nhật qua job.

## 8. Nguồn gốc dữ liệu (Provenance)

Mọi dữ liệu của một địa điểm phải truy vết được về nguồn (Official Website, Facebook, Google Maps, OpenStreetMap, Business Owner, Community, Moderator, AI…). Thực thể `sources` + bảng quy chiếu đa hình `source_attributions` và phiên bản `wiki_revisions` được thiết kế riêng trong [module-source.md](./modules/source.md).

## 9. Xác minh dữ liệu (Verification)

Mọi `Place`, `Contact`, `PriceHistory` đều có vòng đời xác minh (`pending → verified → official / community_verified → expired`, hoặc `rejected`). Thực thể `verifications` dùng **exclusive arc** (FK cụ thể + `CHECK`, **không** polymorphic) và lịch sử `verification_events` — thiết kế trong [module-verification.md](./modules/verification.md).

## 10. Số liệu & Thống kê (Analytics)

Nhóm phân tích (`PageView`, `PlaceView`, `SearchAnalytics`, `PopularPlace`, `TrendingKeyword`) theo hướng **aggregate-first**: không lưu log thô, chỉ giữ bảng tổng hợp theo mốc thời gian (rollup `giờ→ngày→tháng`) và bảng xếp hạng materialized cho dashboard đọc nhanh — thiết kế trong [module-analytics.md](./modules/analytics.md).

## 11. Danh mục thực thể (Entity Catalog)

> Tổng hợp **mọi thực thể đã phê duyệt**, tài liệu định nghĩa trường **authoritative**, và **trạng thái nhất quán**. Không định nghĩa lại trường ở đây để tránh lệch với tài liệu nguồn. Ký hiệu: ✅ sẵn sàng · ⚠️ cần quyết định · ⛔ bị chặn (phụ thuộc thực thể chưa phê duyệt).
>
> **Thẩm quyền runtime (GAP-15 / OD-B7, 2026-07-24):** danh mục này từng được lập để chuẩn bị cho một schema Prisma; quyết định thực thi cuối cùng chọn **TypeORM** làm thẩm quyền persistence runtime (entities + migrations + PostgreSQL) — xem [ADR-013, mục Addendum](../99-decisions/ADR-013-prisma-readiness.md#addendum-runtime-persistence-authority-od-b7-2026-07-24). `prisma/schema.prisma` chỉ còn là **tài liệu tham chiếu mô hình dữ liệu**, không sinh migration/code/API.

| Thực thể | Định nghĩa tại | Trạng thái | Ghi chú |
|---|---|---|---|
| `users` | database.md §3.1 | ✅ | bỏ `role` ENUM → RBAC qua `user_roles` |
| `roles` | database.md §3.9 | ✅ | RBAC — vai trò dạng dữ liệu |
| `permissions` | database.md §3.10 | ✅ | quyền `Module.Action[.Scope]` |
| `role_permissions` | database.md §3.11 | ✅ | N–N Role↔Permission (+`effect` allow/deny) |
| `role_parents` | database.md §3.12 | ✅ | kế thừa vai trò (DAG) |
| `user_roles` | database.md §3.13 | ✅ | gán vai trò cho principal (+scope) |
| `categories` | database.md §3.2 | ✅ | self-ref `parent_id` |
| `places` | [places.md](./modules/places.md) §3 | ✅ | **authoritative duy nhất** (ADR-001, B7); database.md §3.3 chỉ tổng quan + quan hệ |
| `reviews` | database.md §3.4 | ✅ | đính kèm ảnh qua `media` (`review_id`) |
| `contributions` | database.md §3.6 | ✅ | |
| `community_posts` | database.md §3.7 | ✅ | |
| `community_comments` | database.md §3.8 | ✅ | self-ref `parent_id` |
| `price_history` | database.md §3.15 | ✅ | **polymorphic**; **thay `place_tickets`** (ADR-006) |
| `place_faqs` | [places.md](./modules/places.md) §7 | ✅ | |
| `place_seo` | [places.md](./modules/places.md) §8 | ✅ | 1–1 với places |
| `place_ai_summary` | [places.md](./modules/places.md) §9 | ✅ | 1–1 với places |
| `media` | database.md §3.5 | ✅ | **exclusive arc** (place/review/post/business) — thay `place_media` (ADR-009) |
| `contacts` | database.md §3.14 | ✅ | **polymorphic** (owner_type/owner_id) — liên hệ dùng chung, thay cột inline (ADR-005) |
| `wiki_revisions` | [source.md](./modules/source.md) §6 | ✅ | thực thể phiên bản **duy nhất**, **polymorphic** (place/topic/area…); **thay & retire `place_revisions`** (ADR-014) |
| `sources` | [source.md](./modules/source.md) §4 | ✅ | |
| `source_attributions` | [source.md](./modules/source.md) §5 | ✅ | đa hình (`entity_type`/`entity_id`) |
| `verifications` | database.md §3.16, [verification.md](./modules/verification.md) §4 | ✅ | exclusive arc → places/contacts/price_history; cache `verification_status` (**ADR-008**) |
| `verification_events` | database.md §3.17, [verification.md](./modules/verification.md) §5 | ✅ | audit trail append-only (**ADR-008**) |
| `verification_votes` | database.md §3.18, [verification.md](./modules/verification.md) §5B | ✅ | sổ phiếu cộng đồng (1 người/phiếu); cache `confirm_count`/`dispute_count` (**ADR-008**) |
| `page_views_agg` | [analytics.md](./modules/analytics.md) §3.1 | ✅ | |
| `place_views_agg` | [analytics.md](./modules/analytics.md) §3.2 | ✅ | |
| `search_queries_agg` | [analytics.md](./modules/analytics.md) §3.3 | ✅ | |
| `popular_places` | [analytics.md](./modules/analytics.md) §4.1 | ✅ | |
| `trending_keywords` | [analytics.md](./modules/analytics.md) §4.2 | ✅ | |
| `business_claims` | database.md §3.19, [business.md](./modules/business.md) §2 | ✅ | yêu cầu nhận quyền cơ sở (state machine) — **ADR-015** |
| `business_members` | database.md §3.20, [business.md](./modules/business.md) §3 | ✅ | sở hữu/ủy quyền (owner/manager); một owner hiệu lực/cơ sở — **ADR-015** |
| `audit_logs` | database.md §3.21 | ✅ | nhật ký kiểm toán **bất biến, append-only**, đa hình (`entity_type/entity_id`) — tầng audit hành chính/bảo mật xuyên suốt (**ADR-016**) |
| `place_hotel_details` | [places.md §13](./modules/places.md) | ✅ | **Wave 2** — 1:1 places (`category=hotel`); **ADR-002** satellite |
| `hotel_room_types` | [places.md §13](./modules/places.md) | ✅ | **Wave 2** — 1:N places; giá `price_ref` (cache) / `price_history` (xác minh) |
| `amenities` | [places.md §13](./modules/places.md) | ✅ | **Wave 2** — từ điển tiện ích (dùng chung) |
| `place_amenities` | [places.md §13](./modules/places.md) | ✅ | **Wave 2** — N:N places↔amenities |
| `place_restaurant_details` | [places.md §13](./modules/places.md) | ✅ | **Wave 2** — 1:1 places (`category=restaurant`) |
| `restaurant_menu_sections` | [places.md §13](./modules/places.md) | ✅ | **Wave 2** — 1:N places (mục thực đơn) |
| `restaurant_menu_items` | [places.md §13](./modules/places.md) | ✅ | **Wave 2** — 1:N section (món) |
| `cuisines` | [places.md §13](./modules/places.md) | ✅ | **Wave 2** — từ điển ẩm thực |
| `place_cuisines` | [places.md §13](./modules/places.md) | ✅ | **Wave 2** — N:N places↔cuisines |
| `place_tour_details` | [places.md §13](./modules/places.md) | ✅ | **Wave 2** — 1:1 places (`category=tour`); `organizer_id→places` |
| `tour_stops` | [places.md §13](./modules/places.md) | ✅ | **Wave 2** — 1:N places (lộ trình, PostGIS) |
| `tour_schedules` | [places.md §13](./modules/places.md) | ✅ | **Wave 2** — 1:N places (lịch khởi hành) |
| `events` | database.md §3.22 | ✅ | **Wave 2** — thực thể **peer** (Hybrid), tham chiếu Place (`place_id` nullable); **ADR-002** |
| `event_occurrences` | database.md §3.23 | ✅ | **Wave 2** — 1:N events (sự kiện định kỳ) |
| `saved_searches` | database.md §12 | ✅ | **planned** — user-owned; bổ sung cho Search Architecture (sơ đồ ERD cập nhật sau) |

**Thực thể được API/Workflow tham chiếu nhưng CHƯA phê duyệt** (kế hoạch B8, thiết kế theo Wave — xem [báo cáo B8]): ~~`business_claims`/binding owner~~ ✅ **Accepted (Wave 1/ADR-015)**; ~~`events`, `hotel_rooms`, `restaurant_menu`, `tour_itinerary`~~ ✅ **Accepted (Wave 2/ADR-002)** — nay là `events`/`event_occurrences` + 12 bảng mở rộng ([places.md §13](./modules/places.md)); `reports`, `notifications` (+ `devices`, `preferences`), `api_keys`/`partner_clients`, token email/reset, **`entity_tags`/Tag taxonomy** (Tag Search — [search.md](../architecture/search.md) §4.6; **chưa có taxonomy Tag thống nhất**, chỉ có `categories` — chờ quyết định, xem §13).

---

## 12. `saved_searches` — Tìm kiếm đã lưu (Saved Search)

> **Trạng thái: planned — đã thống nhất** bổ sung cho [search.md §4.12](../architecture/search.md). Thực thể **user-owned**; chỉ thêm quan hệ `users 1:N saved_searches` cho thực thể **mới** — **không** thay đổi ERD hiện tại hay quan hệ giữa các thực thể đang có; sơ đồ ERD cập nhật sau ([erd.md §5](./erd.md)).

| Cột | Kiểu | Null | Ghi chú |
|---|---|---|---|
| `id` | UUID (PK) | ✗ | |
| `user_id` | UUID (FK → users) | ✗ | chủ sở hữu truy vấn đã lưu |
| `name` | VARCHAR(120) | ✓ | tên do người dùng đặt (tùy chọn) |
| `query_raw` | VARCHAR(200) | ✓ | truy vấn gốc người dùng nhập |
| `query_normalized` | VARCHAR(200) | ✓ | chuẩn hóa (unaccent + lowercase + trim) — **đồng nhất** với Search & [analytics.md §3.3](./modules/analytics.md) |
| `filters` | JSONB | ✓ | bộ lọc đã lưu (type/category/price/rating/geo/open_now…) |
| `sort` | VARCHAR(40) | ✓ | tiêu chí sắp xếp đã lưu |
| `alert_enabled` | BOOLEAN default false | ✗ | có nhắc khi xuất hiện kết quả mới |
| `alert_channel` | ENUM | ✓ | `in_app, email, push` (khi bật alert) |
| `last_run_at` | TIMESTAMPTZ | ✓ | lần đối chiếu gần nhất (mốc tính delta cho alert) |
| `created_at / updated_at` | TIMESTAMPTZ | ✗ | |
| `deleted_at` | TIMESTAMPTZ | ✓ | soft delete |

- **Quan hệ:** `users ||--o{ saved_searches`. **Không** FK tới thực thể nội dung (places/…): chỉ lưu **tham số truy vấn**, chạy lại qua engine Search — không ràng buộc/không đổi quan hệ thực thể nội dung.
- **Riêng tư:** dữ liệu cá nhân → `private, no-store`, `noindex`; alert tôn trọng preference + dedupe ([WF-20](../workflow/workflow.md)).
- **Nghiệp vụ:** *chạy lại* = tái tạo truy vấn từ `query_normalized + filters + sort`; *alert* = thực thể mới `published` khớp tiêu chí, so `created_at`/cursor với `last_run_at`.

## 13. Điểm mở rộng dữ liệu cho Search (Extension points — planned)

> Chỉ **khai báo điểm mở rộng**; **không** thiết kế chi tiết, **không** tạo cột/bảng ở giai đoạn này. Bật khi tới giai đoạn tương ứng trong lộ trình [search.md §12](../architecture/search.md). Không đổi ERD/quan hệ hiện tại.

- **Semantic Search — Vector embedding (extension point):** khi bật Semantic/AI Search (giai đoạn 2+), sẽ bổ sung lưu trữ **vector embedding** cho nội dung thực thể (định hướng `pgvector` + ANN). *Chưa* khai báo cột/bảng/kích thước vector/index tại đây; dự kiến sinh & nhúng lại gắn theo `source_hash` (như [place_ai_summary](./modules/places.md) §9) để tiết kiệm chi phí. Mô hình hóa chi tiết để **giai đoạn sau**.
- **Tag Search — `entity_tags` (CHỜ QUYẾT ĐỊNH — chưa tạo):** [search.md §4.6](../architecture/search.md) mô tả Tag Search dựa trên `entity_tags` (N–N). **Hiện chưa có taxonomy Tag thống nhất** — mô hình dữ liệu mới chỉ có `categories` (phân cấp). **Không** tạo cơ chế Tag mới lần này. Cần quyết định: **(a)** mở taxonomy Tag riêng (`tags` + `entity_tags` N–N), hay **(b)** ánh xạ Tag Search vào `categories` hiện có (mở rộng danh mục con). Xem báo cáo.

---

*Tài liệu liên quan: [architecture.md](../architecture/architecture.md), [api.md](../api/api.md), [erd.md](./erd.md), [search.md](../architecture/search.md), [module-places-db.md](./modules/places.md), [module-source.md](./modules/source.md), [module-verification.md](./modules/verification.md), [module-analytics.md](./modules/analytics.md)*
