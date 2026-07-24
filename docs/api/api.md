# PhuQuocHub — Thiết kế REST API

> Tài liệu **chỉ thiết kế API** — không code, không Controller, không DTO. Ví dụ JSON chỉ để minh họa hợp đồng (contract). Phân quyền tham chiếu [rbac.md](../security/rbac.md); cơ chế bảo mật [security.md](../architecture/security.md).

## 1. Nguyên tắc chung

- **RESTful (JSON)**, tài nguyên danh từ số nhiều (`/places`, `/reviews`).
- **HTTP method:** `GET` đọc · `POST` tạo · `PATCH` sửa một phần · `PUT` thay thế · `DELETE` xóa (mềm).
- **Versioning qua prefix** theo từng kênh (xem §2).
- **Deny by default:** endpoint ghi yêu cầu xác thực + kiểm tra **Permission**.
- **Không đưa dữ liệu nhạy cảm vào query string.**
- **Contract dùng chung** FE/BE qua `packages/shared-types` (chỉ nói ở mức thiết kế).

## 2. Đa kênh (Web · Mobile · Public · Partner)

| Kênh | Base path | Xác thực | Đối tượng | Đặc thù |
|---|---|---|---|---|
| **Web** | `/api` | Session cookie (httpOnly) hoặc Bearer JWT | App chính | Đầy đủ tính năng, CSRF cho cookie |
| **Mobile** | `/api` | Bearer JWT (access + refresh) | App PWA/native | **Cursor pagination**, payload gọn, ETag/offline hint, push token |
| **Public API** | `/public/v1` | **API key** (header `X-Api-Key`) | Nhà phát triển bên thứ ba | **Chỉ đọc**, quota theo key, **không PII**, bắt buộc **ghi công OSM/ODbL** |
| **Partner API** | `/partner/v1` | **OAuth2 client-credentials** + scope | Đối tác (khách sạn, tour, OTA) | Ghi tài nguyên **thuộc đối tác**, quota cao theo SLA, webhook |

> **Ghi chú versioning (INC-01):** base path Web/Mobile hiện là **`/api`** (chưa gắn `/v1`) — khớp hệ thống đang chạy. Việc gắn tiền tố phiên bản được **hoãn** tới khi [ADR-010](../99-decisions/ADR-010-api-versioning.md) (đang *Proposed*) được Accepted; khi đó cập nhật lại thành `/api/v1`. Public/Partner (`/public/v1`, `/partner/v1`) là bề mặt **tương lai** (Sprint 9), chốt prefix cùng ADR-010.

Nguyên tắc: cùng mô hình dữ liệu, khác **bề mặt** — Public/Partner là **tập con có kiểm soát** của API nội bộ; kênh xác định qua credential, không lộ endpoint quản trị ra ngoài.

## 3. Xác thực & phân quyền

- **Web/Mobile:** JWT access ngắn hạn + refresh (Redis) — [auth.md](../security/auth.md).
- **Public:** `X-Api-Key`; key gắn quota + phạm vi đọc; xoay vòng/thu hồi qua `Developer.ApiKey.Manage`.
- **Partner:** OAuth2 `client_credentials` → access token có **scope** (vd `tours:write`, `hotels:write`); ánh xạ scope → Permission trong PDP.
- Mọi request ghi đều qua **PEP→PDP** (kiểm tra permission + scope Own/Managed/Any).

## 4. Chuẩn phản hồi (Response Envelope)

**Thành công:**
```json
{ "success": true, "data": {}, "meta": { "page": 1, "limit": 20, "total": 134 } }
```
**Lỗi:**
```json
{ "success": false, "error": { "code": "PLACE_NOT_FOUND", "message": "Không tìm thấy địa điểm", "details": [] } }
```
- `meta` mang phân trang, `cursor`, hoặc thông tin quota (Public/Partner).
- Mã lỗi **ổn định** (SNAKE_CASE), không chỉ message.

## 5. Mã trạng thái HTTP

| Mã | Ý nghĩa | | Mã | Ý nghĩa |
|---|---|---|---|---|
| 200 | OK | | 409 | Xung đột (trùng/optimistic lock) |
| 201 | Đã tạo | | 422 | Validation thất bại |
| 202 | Đã nhận (xử lý nền: AI, media) | | 429 | Vượt rate limit/quota |
| 400 | Sai định dạng | | 451 | Bị chặn vì lý do pháp lý (bản quyền) |
| 401 | Chưa xác thực | | 500 | Lỗi máy chủ |
| 403 | Không đủ quyền | | 503 | Quá tải/bảo trì |
| 404 | Không tìm thấy | | | |

## 6. Phân trang, lọc, sắp xếp

> ⚠️ **Trạng thái triển khai (F-6 / OD-F-6, 2026-07-23).** Mục này mô tả quy ước MỤC TIÊU của
> dự án. Với các endpoint đã hiện thực, **chỉ offset pagination + lọc là có thật**. `cursor`,
> `sort` và `fields` **chưa được triển khai ở bất kỳ endpoint nào**; do `ValidationPipe` chạy với
> `whitelist` + `forbidNonWhitelisted`, gửi chúng lên sẽ nhận **HTTP 400**, không phải bị bỏ qua.
> Xem `openapi.yaml` để biết tham số thực tế của từng operation.

- **Offset (Web):** `?page=&limit=` (mặc định `page=1`, `limit=20`). `limit > 100` **bị cắt xuống
  100**, không bị từ chối; `page`/`limit` `< 1` hoặc không phải số nguyên bị từ chối **400**. — ✅
  **đã triển khai** — hợp đồng chính thức đã chốt (ADR-010 Accepted / OD-B1, 2026-07-24).
- **Cursor (Mobile/Public):** `?cursor=&limit=` → `meta.next_cursor`. — ❌ **chưa triển khai**
  (`?cursor=` → 400; `meta.next_cursor` không được phát ra). Cursor/keyset ĐÃ QUYẾT ĐỊNH KHÔNG áp
  dụng cho v1 (OD-B1 / ADR-010 Accepted 2026-07-24; GAP-05/10 resolved); nếu có sau này phải là một
  major version mới theo ADR-010.
- **Lọc:** `?field=value` — ✅ **đã triển khai** (tập trường tuỳ endpoint).
- **Sắp xếp:** `?sort=field_asc|field_desc` — ❌ **chưa triển khai** (`?sort=` → 400). Thứ tự do
  server quyết định cố định; xem `description` của từng operation trong `openapi.yaml`.
- **Field shaping:** `?fields=id,name,location` — ❌ **chưa triển khai** (`?fields=` → 400).

## 7. Rate Limiting & Quota (mô hình chung)

| Tầng | Giới hạn tham khảo | Áp dụng |
|---|---|---|
| Ẩn danh (Guest/Web) | 60 req/phút/IP | GET công khai |
| Đã đăng nhập | 300 req/phút/user | Web/Mobile |
| Ghi dữ liệu | 20–60 req/phút/user | POST/PATCH/DELETE |
| Public API | quota theo key (vd 10.000 req/ngày) | `/public/v1` |
| Partner API | theo hợp đồng/SLA (cao) | `/partner/v1` |

- Thực thi qua Redis; trả header `X-RateLimit-Remaining`, `Retry-After`.
- Endpoint nhạy cảm (login, forgot-password, AI, upload) có **giới hạn chặt riêng**.

## 8. Caching (mô hình chung)

- **GET công khai:** `Cache-Control: public` + **ETag** + `If-None-Match` (304); Redis **cache-aside**; **CDN** cho `/public/v1`.
- **Cá nhân hóa:** `Cache-Control: private, no-store`.
- **Bản đồ/bbox:** key theo **geohash + zoom**; TTL ngắn.
- **Invalidation:** khi duyệt/cập nhật (workflow) → xóa key liên quan; ETag đổi theo `updated_at`/revision.

---

# MODULE

> Với mỗi module: **Endpoint · Method · Permission · Request · Response · Validation · Rate Limit · Caching.** Ký hiệu kênh: **W**=Web, **M**=Mobile, **P**=Public, **Pt**=Partner.

## 9. Auth

| Method | Endpoint | Permission | Kênh |
|---|---|---|---|
| POST | `/api/auth/register` | public | W·M |
| POST | `/api/auth/login` | public | W·M |
| POST | `/api/auth/refresh` | public (refresh token) | W·M |
| POST | `/api/auth/logout` | authenticated | W·M |
| POST | `/api/auth/verify-email` | public (token) | W·M |
| POST | `/api/auth/forgot-password` | public | W·M |
| POST | `/api/auth/reset-password` | public (token) | W·M |
| GET | `/api/auth/google` · `/google/callback` | public | W·M |
| POST | `/partner/v1/oauth/token` | client credentials | Pt |

- **Request:** register `{email,password,display_name}`; login `{email,password}`; reset `{token,new_password}`; partner `{client_id,client_secret,scope}`.
- **Response:** `{access_token, refresh_token, expires_in, user}`; partner `{access_token, scope, expires_in}`.
- **Validation:** email định dạng & unique; password đủ mạnh; token hợp lệ/chưa hết hạn/chưa dùng; provider hợp lệ.
- **Rate Limit:** **chặt** — login/forgot 5–10 req/phút/IP; khóa tạm sau N lần sai.
- **Caching:** **không cache** (auth luôn `no-store`).

## 10. Users

| Method | Endpoint | Permission | Kênh |
|---|---|---|---|
| GET | `/api/users/me` | authenticated | W·M |
| PATCH | `/api/users/me` | `User.Edit.Own` | W·M |
| GET | `/api/users/:id` | public (hồ sơ công khai) | W·M·P |
| GET | `/api/users/:id/contributions` | public | W·M |
| POST | `/api/users/:id/roles` | `Role.Assign` | W |
| DELETE | `/api/users/:id/roles/:roleId` | `Role.Assign` | W |
| POST | `/api/users/:id/ban` | `User.Ban` | W |

- **Request:** `me` PATCH `{display_name?, avatar_url?, preferences?}`; gán vai trò `POST .../roles {role_id, scope_type?, business_id?}`, thu hồi `DELETE .../roles/:roleId`; ban `{reason, duration?}`.
- **Response:** hồ sơ công khai (không email/PII cho người khác); `me` trả đầy đủ + role/permission tối thiểu.
- **Validation:** chỉ chủ sở hữu sửa hồ sơ mình; role đích tồn tại & `is_assignable` & không vượt cấp; `scope_type=managed` cần `business_id` hợp lệ; ban cần lý do.
- **Rate Limit:** đọc tiêu chuẩn; hành động admin thấp + audit.
- **Caching:** hồ sơ công khai `public` ETag ngắn; `me` `private, no-store`.

### 10.1 Roles & Permissions (Authorization)

> Quản trị **lược đồ RBAC** (vai trò, quyền, ánh xạ) — dữ liệu, không hardcode ([rbac.md](../security/rbac.md), [security.md](../architecture/security.md)). Mọi endpoint **audited**.

| Method | Endpoint | Permission | Kênh |
|---|---|---|---|
| GET | `/api/roles` | `Role.Assign` | W |
| POST | `/api/roles` | `Role.Create` | W |
| PATCH | `/api/roles/:id` | `Role.Edit` | W |
| DELETE | `/api/roles/:id` | `Role.Delete` | W |
| POST | `/api/roles/:id/permissions` | `Permission.Manage` | W |
| DELETE | `/api/roles/:id/permissions/:permId` | `Permission.Manage` | W |
| GET | `/api/permissions` | `Permission.Manage` | W |

- **Request:** role `{code, name, description, parent_role_ids?}`; map quyền `{permission_id, effect?}` (`effect=allow|deny`).
- **Response:** vai trò + danh sách permission hiệu lực (đã nở wildcard & kế thừa DAG).
- **Validation:** `code` unique; **không tạo chu trình** kế thừa (DAG); `is_system` không cho xóa; đổi lược đồ quyền chỉ `Permission.Manage` (Super Admin) + 4-eyes.
- **Rate Limit:** rất thấp (hành động đặc quyền) + audit đầy đủ.
- **Caching:** `private, no-store`; đổi role/permission → **vô hiệu hóa cache effective permissions** ([security.md §5](../architecture/security.md)).

### 10.2 Categories (Danh mục)

> Danh mục phân loại địa điểm (cây phân cấp qua `parent_id`). Đọc công khai; ghi cần `Category.Manage` (Moderator/Admin — [rbac.md §3.3](../security/rbac.md)). Thực thể: `categories` ([data-dictionary §2](../data/data-dictionary.md)).

| Method | Endpoint | Permission | Kênh |
|---|---|---|---|
| GET | `/api/categories` | public | W·M·P |
| GET | `/api/categories/:id` | public | W·M·P |
| POST | `/api/categories` | `Category.Manage` | W |
| PATCH | `/api/categories/:id` | `Category.Manage` | W |
| DELETE | `/api/categories/:id` | `Category.Manage` | W |

- **Request:** create `{name_vi, name_en?, icon?, slug?, parent_id?}` (bỏ trống `slug` → tự sinh từ `name_vi`, slugify tiếng Việt); update các trường tùy chọn.
- **Response:** `{id, slug, name_vi, name_en, icon, parent_id}` (snake_case).
- **Validation:** `slug` unique; `name_vi` bắt buộc; `parent_id` tồn tại (self-ref RESTRICT).
- **Caching:** đọc `public` + ETag ngắn; ghi hiếm, audit.

## 11. Places (lõi)

| Method | Endpoint | Permission | Kênh |
|---|---|---|---|
| GET | `/api/places` | public | W·M·P |
| GET | `/api/places/:slug` | public | W·M·P |
| POST | `/api/places` | `Place.Create` | W·M |
| PATCH | `/api/places/:id` | `Place.Edit.*` | W·M·Pt |
| DELETE | `/api/places/:id` | `Place.Archive` | W |
| POST | `/api/places/:id/approve` | `Place.Approve` | W |
| GET | `/api/places/:id/revisions` | public | W·M |
| GET | `/api/geo/nearby` | public | W·M·P |
| GET | `/api/geo/bbox` | public | W·M·P |
| GET | `/api/geo/geocode` · `/reverse` | public | W·M |

- **Request:** list `?category=&ward=&price_range=&page=&limit=` — **đó là toàn bộ tham số được chấp nhận**; `status`, `sort`, `cursor` **chưa triển khai** và trả **400** (F-6/OD-F-6). Lọc theo trạng thái là đặc quyền kiểm duyệt (GAP-02/04), sẽ có endpoint riêng có kiểm tra quyền. Thứ tự cố định `rating_avg DESC NULLS LAST, created_at DESC, id ASC`. Không có bộ lọc địa lý ở endpoint này — dùng `/geo/*`. nearby `?lat=&lng=&radius=&category=`; bbox `?minLng=&minLat=&maxLng=&maxLat=&zoom=`; create/patch: nội dung Place (đi qua contribution/revision — [contribution.md](../workflow/contribution.md)). Lịch sử/phiên bản lưu ở **`wiki_revisions`** (`entity_type='place'`) — thực thể phiên bản **duy nhất** ([ADR-014](../99-decisions/ADR-014-revision-model.md); `place_revisions` đã retire).
- **Response:** danh sách Place gọn (card) / chi tiết đầy đủ (media, **prices** (`price_history`), faqs, **contacts**, verification badge, provenance); nearby kèm `distance_m`; bbox trả **clustered points**. `GET /revisions` trả danh sách **`wiki_revisions`** (`entity_type='place'`) theo `revision_number` giảm dần (kèm `origin`, `status`, `editor_id`, trích nguồn). *(Liên hệ qua `contacts` §11.1; giá qua `price_history` §11.2 — không còn inline.)*
- **Validation:** slug unique; tọa độ trong Phú Quốc; category tồn tại; thay đổi nhạy cảm → `pending`.
- **Rate Limit:** đọc cao; ghi 20–60/phút/user; Public theo quota key.
- **Caching:** chi tiết Place `public`+ETag; bbox theo **geohash+zoom** TTL ngắn; invalidation khi duyệt/sửa.

### 11.1 Contacts (Liên hệ)

> Liên hệ của Place/Business/module tương lai lưu ở bảng chung `contacts` (polymorphic) — [database.md §3.14](../data/database.md). **Không** còn trả `phone/hotline/website/email` inline trong payload Place.

| Method | Endpoint | Permission | Kênh |
|---|---|---|---|
| GET | `/api/places/:id/contacts` | public | W·M·P |
| POST | `/api/places/:id/contacts` | `Contact.Edit.Managed`/`.Any` | W·M |
| PATCH | `/api/contacts/:id` | `Contact.Edit.Managed`/`.Any` | W·M |
| DELETE | `/api/contacts/:id` | `Contact.Edit.Managed`/`.Any` | W·M |

- **Request:** `{contact_type, value, label?, is_primary?, display_order?}` (owner suy từ path: `owner_type=place`, `owner_id=:id`).
- **Response:** danh sách/chi tiết `contacts` (kèm `verification_status`); nhóm theo `contact_type`, `is_primary` lên đầu.
- **Validation:** `contact_type` thuộc từ điển chuẩn (`HOTLINE/PHONE/EMAIL/WEBSITE/FACEBOOK/…`); `value` hợp lệ theo loại (URL/email/số); **một `is_primary` mỗi loại/chủ**; scope Managed cho cơ sở đã claim.
- **Rate Limit:** ghi theo chuẩn nội dung. **Caching:** GET công khai `public` + ETag ngắn.

### 11.2 Prices (Giá — Price History)

> Giá của Place/Hotel/Tour/Event… lưu ở bảng chung `price_history` (polymorphic, append-only) — [database.md §3.15](../data/database.md). **Thay `place_tickets`.** "Giá hiện hành" = bản ghi đang trong `[valid_from, valid_to]`.

| Method | Endpoint | Permission | Kênh |
|---|---|---|---|
| GET | `/api/places/:id/prices` | public | W·M·P |
| POST | `/api/places/:id/prices` | `Price.Edit.Managed`/`.Any` | W·M·Pt |
| PATCH | `/api/prices/:id` | `Price.Edit.Managed`/`.Any` | W·Pt |

- **Request:** `{service_name, amount, currency?, unit?, is_free?, valid_from?, valid_to?, display_order?}` (owner suy từ path: `entity_type=place`, `entity_id=:id`).
- **Response:** danh sách giá **hiện hành** (mặc định) + tùy chọn `?history=true` trả lịch sử; kèm `verification_status` + nguồn.
- **Validation:** `amount ≥ 0`; `valid_from < valid_to`; **ghi bản mới, không ghi đè** (append-only); scope Managed cho cơ sở đã claim.
- **Rate Limit:** ghi theo chuẩn nội dung. **Caching:** GET công khai `public` + ETag; giá đổi → invalidation.

### 11.3 Verification (Xác minh — hàng đợi & hành động)

> Trạng thái tin cậy của Place/Contact/PriceHistory theo máy trạng thái `pending → verified → official/community_verified → expired | rejected` — [verification.md](../data/modules/verification.md), [ADR-008](../99-decisions/ADR-008-verification-model.md). Chỉ trả **`verification_status`** (badge); **không** có cờ boolean `is_verified` (đã bỏ). "Đã xác minh?" = `verification_status IN ('verified','official','community_verified')`.

| Method | Endpoint | Permission | Kênh |
|---|---|---|---|
| GET | `/api/verifications` | `Verification.Verify` | W |
| GET | `/api/verifications/:id` | `Verification.Verify` | W |
| POST | `/api/verifications/:id/assign` | `Verification.Verify` | W |
| POST | `/api/verifications/:id/verify` | `Verification.Verify` | W |
| POST | `/api/verifications/:id/reject` | `Verification.Reject` | W |
| POST | `/api/verifications/:id/vote` | `Verification.Vote` | W·M |
| GET | `/api/verifications/:id/events` | `Verification.Verify` | W |

- **Request:** hàng đợi `?status=pending&assigned_to=&priority=&overdue=true&sort=sla_due_at`; assign `{assigned_to?, priority?, sla_due_at?}`; verify `{status:"verified"|"official", source_id?, expires_at?, note?}` (`official` **bắt buộc** `source_id`); reject `{reason_code, rejected_reason?}` (`reason_code` thuộc từ điển §4.1 verification.md); vote `{vote:"confirm"|"dispute", note?}` (idempotent — một người một phiếu).
- **Response:** đối tượng `verification` (kèm target `place_id|contact_id|price_history_id`, `status`, `lock_version`, `confirm_count/dispute_count`, `sla_due_at`); `/events` trả audit trail bất biến `verification_events`.
- **Validation:** transition hợp lệ theo máy trạng thái (§3.2 verification.md); **optimistic lock** qua `lock_version` (client gửi kèm, lệch → `409 Conflict`); `official` cần `source_id` chính thức; AI/hệ thống **không** được đặt `official`.
- **Rate Limit:** hành động moderator thấp + **audit**; `vote` chống lạm dụng theo user. **Caching:** hàng đợi `private`, **no-store** (dữ liệu vận hành).

> Hotel là **Place chuyên biệt** (`category=hotel`) + phần mở rộng (phòng, tiện ích, hạng). Kế thừa toàn bộ endpoint Places, thêm:

| Method | Endpoint | Permission | Kênh |
|---|---|---|---|
| GET | `/api/hotels` · `/hotels/:slug` | public | W·M·P |
| GET | `/api/hotels/:id/rooms` | public | W·M·P |
| PATCH | `/api/hotels/:id/rooms` | `Place.Edit.Managed` | W·Pt |
| GET | `/api/hotels/:id/amenities` | public | W·M·P |

- **Request:** filter `?stars=&amenities=&price_min=&price_max=&available_from=&to=`; rooms `{room_types:[{name,capacity,price,amenities}]}`.
- **Response:** thông tin lưu trú (hạng sao, tiện ích, loại phòng, khoảng giá). *Giai đoạn đầu không đặt phòng* — chỉ thông tin & khám phá.
- **Validation:** giá ≥ 0; amenity thuộc từ điển chuẩn; chỉnh sửa trong scope Managed (Owner/Manager/Partner).
- **Rate Limit / Caching:** như Places; danh sách phòng cache `public` ETag.

## 13. Restaurants

| Method | Endpoint | Permission | Kênh |
|---|---|---|---|
| GET | `/api/restaurants` · `/:slug` | public | W·M·P |
| GET | `/api/restaurants/:id/menu` | public | W·M·P |
| PATCH | `/api/restaurants/:id/menu` | `Place.Edit.Managed` | W·Pt |
| GET | `/api/restaurants/:id/dishes/:dishId` | public | W·M |

- **Request:** filter `?cuisine=&price_range=&open_now=true&dietary=`; menu `{sections:[{name,items:[{name,price,tags}]}]}`.
- **Response:** menu, đặc sản, khoảng giá, giờ mở cửa, ảnh món.
- **Validation:** giá món hợp lệ; `open_now` suy từ `opening_hours` + timezone; scope Managed để sửa.
- **Rate Limit / Caching:** đọc cao; menu cache `public` ETag; `open_now` TTL ngắn.

## 14. Tours

| Method | Endpoint | Permission | Kênh |
|---|---|---|---|
| GET | `/api/tours` · `/:slug` | public | W·M·P |
| GET | `/api/tours/:id/itinerary` | public | W·M·P |
| POST | `/api/tours` | `Place.Create` / partner `tours:write` | W·Pt |
| PATCH | `/api/tours/:id` | `Place.Edit.Managed` | W·Pt |
| GET | `/api/tours/:id/schedule` | public | W·M·P |

- **Request:** filter `?type=(diving,fishing,trekking)&duration=&price_max=&departure_area=`; itinerary `{stops:[{point,location,time,note}]}`; schedule `{dates, capacity, price}`.
- **Response:** lộ trình (điểm dừng có tọa độ để vẽ bản đồ), lịch khởi hành, giá, đánh giá.
- **Validation:** điểm dừng có tọa độ hợp lệ; ngày/khung giá hợp lệ; partner chỉ sửa tour của mình.
- **Rate Limit:** đọc cao; ghi partner theo SLA.
- **Caching:** itinerary cache `public` ETag; schedule TTL ngắn (thay đổi thường).

## 15. Events

| Method | Endpoint | Permission | Kênh |
|---|---|---|---|
| GET | `/api/events` | public | W·M·P |
| GET | `/api/events/:slug` | public | W·M·P |
| POST | `/api/events` | `Place.Create` (event) | W·M·Pt |
| PATCH | `/api/events/:id` | `Place.Edit.*` | W·Pt |
| GET | `/api/events/calendar` | public | W·M·P |

- **Request:** filter `?from=&to=&category=&area=&status=(upcoming,ongoing,ended)`; body `{title, start_at, end_at, location, place_id?}`.
- **Response:** sự kiện theo thời gian + vị trí; `/calendar` gom theo ngày.
- **Validation:** `start_at < end_at`; timezone `Asia/Ho_Chi_Minh`; trạng thái suy theo thời gian hiện tại.
- **Rate Limit:** tiêu chuẩn.
- **Caching:** danh sách theo cửa sổ thời gian cache `public` TTL ngắn; sự kiện đã kết thúc cache dài.

## 16. Reviews

| Method | Endpoint | Permission | Kênh |
|---|---|---|---|
| GET | `/api/places/:id/reviews` | public | W·M·P |
| POST | `/api/places/:id/reviews` | `Review.Create` | W·M |
| PATCH | `/api/reviews/:id` | `Review.Edit.Own` | W·M |
| DELETE | `/api/reviews/:id` | `Review.Delete.Own`/`.Any` | W·M |
| POST | `/api/reviews/:id/report` | `Report.Create` | W·M |
| POST | `/api/reviews/:id/reply` | `Review.Reply.Managed` | W·M |
| POST | `/api/reviews/:id/vote` | `Vote.Cast` | W·M |

- **Request:** `{rating:1-5, content, media_ids?}`; report `{reason, description}`.
- **Response:** review + tác giả (gọn), `rating_avg`/`count` của Place, trạng thái kiểm duyệt.
- **Validation:** rating 1–5; **`UNIQUE(place_id,user_id)`**; Business Owner **không** tự review cơ sở mình; nội dung không rỗng.
- **Rate Limit:** ghi thấp (chống spam) — vd 5–10 review/giờ/user.
- **Caching:** danh sách review `public` ETag ngắn; đếm rating denormalize.

## 17. Community

| Method | Endpoint | Permission | Kênh |
|---|---|---|---|
| GET | `/api/community/posts` · `/:slug` | public | W·M·P |
| POST | `/api/community/posts` | `Post.Create` | W·M |
| PATCH | `/api/community/posts/:id` | `Post.Edit.Own` | W·M |
| POST | `/api/community/posts/:id/comments` | `Comment.Create` | W·M |
| POST | `/api/community/posts/:id/vote` | `Vote.Cast` | W·M |
| POST | `/api/community/comments/:id/report` | `Report.Create` | W·M |

- **Request:** post `{title, content(markdown), place_id?, tags?}`; comment `{content, parent_id?}`.
- **Response:** bài viết + tác giả + điểm vote + số bình luận (lồng nhau qua `parent_id`).
- **Validation:** slug unique; markdown được sanitize; comment lồng theo `parent_id`.
- **Rate Limit:** ghi trung bình; vote chống lạm dụng.
- **Caching:** bài công khai `public` ETag; feed cá nhân hóa `private`.

## 18. Business

| Method | Endpoint | Permission | Kênh |
|---|---|---|---|
| POST | `/api/business/claims` | `Business.Claim` | W·M |
| GET | `/api/business/claims` | `Business.Verify` | W |
| POST | `/api/business/claims/:id/verify` | `Business.Verify` | W |
| GET | `/api/business/:id/dashboard` | `Analytics.View.Managed` | W·Pt |
| POST | `/api/business/:id/managers` | `Business.Manager.Assign` | W |
| DELETE | `/api/business/:id/managers/:userId` | `Business.Manager.Revoke` | W |
| POST | `/api/business/:id/transfer` | `Business.Transfer` | W |

> Mô hình **Place-centric** ([ADR-015](../99-decisions/ADR-015-business-ownership-model.md)): `:id` = `place_id` (Place đã claim). Claim lưu ở **`business_claims`**; sở hữu/ủy quyền ở **`business_members`** (đồng bộ `user_roles` scope Managed). **Không** có thực thể `businesses` riêng.

- **Request:** claim `{place_id, evidence:[...]}`; verify `{decision:"approve"|"reject", reason_code?, note?}`; managers `{user_id, role:"manager"}`; transfer `{new_owner_id}`.
- **Response:** `business_claims` (status/reviewer/decision); `business_members` (owner/manager hiệu lực); dashboard = số liệu cơ bản (view/review) *scope Managed*.
- **Validation:** bằng chứng đủ định dạng; **một owner hiệu lực/cơ sở** (place đã có owner → `disputed`/transfer); `reject` cần `reason_code`; chỉ Owner gán/thu hồi manager & transfer; verify → đặt Verification `official` (source `business_owner`, ADR-008).
- **Rate Limit:** thấp (hành động nhạy cảm) + **audit** (claim/verify/transfer/manager).
- **Caching:** dashboard `private, no-store`; số liệu tổng hợp từ Analytics (đã rollup).

## 19. Media

| Method | Endpoint | Permission | Kênh |
|---|---|---|---|
| POST | `/api/media/presign` | `Media.Upload.*` | W·M·Pt |
| POST | `/api/media` | `Media.Upload.*` | W·M·Pt |
| DELETE | `/api/media/:id` | `Media.Delete.Own`/`.Any` | W·M |
| POST | `/api/media/:id/moderate` | `Media.Moderate` | W |

- **Request:** presign `{content_type, size, place_id? | review_id? | post_id? | business_id?}` (**đúng một** — exclusive arc, **không** dùng `owner_type/owner_id`) → trả **presigned URL**; sau upload gọi `POST /media` `{key, caption?, alt?}`.
- **Response:** `{id, url, thumbnail_url, status}` (status `pending` cho tới khi kiểm duyệt/AI xong — [moderation.md](../workflow/moderation.md) WF-18).
- **Validation:** MIME & size hợp lệ; quét mã độc; giới hạn số lượng; **không lưu nhị phân trong DB**; **đúng một** chủ sở hữu (`place_id`/`review_id`/`post_id`/`business_id`) — khớp `CHECK` exclusive arc ([database.md §3.5](../data/database.md)).
- **Rate Limit:** upload **chặt** (vd 30 ảnh/giờ/user).
- **Caching:** file phục vụ qua **object storage + CDN** (immutable, hash key); metadata cache ngắn.

## 20. Weather

> Tích hợp nguồn thời tiết bên ngoài, **cache mạnh** để giảm gọi & chi phí.

| Method | Endpoint | Permission | Kênh |
|---|---|---|---|
| GET | `/api/weather/current` | public | W·M·P |
| GET | `/api/weather/forecast` | public | W·M·P |
| GET | `/api/weather/marine` | public | W·M·P |

- **Request:** `?lat=&lng=` hoặc `?area=` (mặc định đảo Phú Quốc); forecast `?days=1..7`; marine cho tour biển (sóng/gió).
- **Response:** `{current:{temp,condition,wind}, forecast:[...]}` chuẩn hóa từ provider.
- **Validation:** tọa độ hợp lệ; `days` trong giới hạn provider.
- **Rate Limit:** đọc cao (đã cache); bảo vệ upstream bằng cache.
- **Caching:** **TTL 10–30 phút** (Redis) + CDN; key theo `area/lat,lng`; **không** gọi provider mỗi request.

## 21. AI

> Mọi endpoint AI **bất đồng bộ**, đầu ra `pending` chờ duyệt (human-in-the-loop) — [moderation.md](../workflow/moderation.md) WF-09.

| Method | Endpoint | Permission | Kênh |
|---|---|---|---|
| POST | `/api/ai/places/:id/summary` | `AI.GenerateSummary` | W |
| POST | `/api/ai/places/:id/faq` | `AI.GenerateFAQ` | W |
| POST | `/api/ai/translate` | `AI.Translate` | W·M |
| POST | `/api/ai/media/:id/check` | `AI.DetectSpam` | (nội bộ) |
| GET | `/api/ai/suggestions/places` | `AI.Assist` | W |

- **Request:** summary `{language, force?}`; translate `{text|entity_ref, target_lang}`.
- **Response:** **`202 Accepted`** + `{job_id, status:"generating"}`; kết quả lấy qua job/notification; nội dung ở trạng thái `pending`.
- **Validation:** đủ dữ liệu nguồn; ngôn ngữ hợp lệ; **chặn tần suất/chi phí**; AI **không** có quyền publish/verify/delete.
- **Rate Limit:** **rất chặt** theo cost budget (per place/per phút).
- **Caching:** kết quả gắn `source_hash` → tái dùng, chỉ sinh lại khi nguồn đổi (stale).

## 22. Search

| Method | Endpoint | Permission | Kênh |
|---|---|---|---|
| GET | `/api/search` | public | W·M·P |
| GET | `/api/search/suggest` | public | W·M |
| POST | `/api/search/reindex` | `Search.Reindex` | W |

- **Request:** `?q=&type=(place,hotel,restaurant,tour,event,community)&lat=&lng=&page/cursor`; suggest `?q=` (autocomplete).
- **Response:** kết quả trộn nhiều loại + `type`, sắp xếp theo mức liên quan do server quyết định (F-35/OD-B4, 2026-07-24: điểm số ts_rank là tín hiệu NỘI BỘ, không phát ra trong payload công khai); hỗ trợ tìm **không dấu** (unaccent, tiếng Việt).
- **Validation:** `q` tối thiểu 1–2 ký tự; sanitize; giới hạn độ dài.
- **Rate Limit:** suggest **cao nhưng nhẹ**; search tiêu chuẩn; ghi log **0-kết-quả** → tín hiệu cho AI/Analytics.
- **Caching:** suggest cache mạnh (prefix, TTL ngắn); search cache theo `(q, filters)` TTL ngắn; Postgres FTS → Meilisearch khi lớn.

> **Kiến trúc chi tiết (tham chiếu):** 12 loại tìm kiếm (keyword · semantic · geo · nearby · category · tag · business · AI · autocomplete · suggestion · trending · saved) và thuật toán **ranking · scoring · index · caching · logging · analytics** được thiết kế ở [architecture/search.md](../architecture/search.md). *Ghi chú: liên kết tham chiếu — **không thay đổi** hợp đồng API mô tả ở trên.*

## 23. Notification

| Method | Endpoint | Permission | Kênh |
|---|---|---|---|
| GET | `/api/notifications` | authenticated | W·M |
| PATCH | `/api/notifications/:id/read` | owner | W·M |
| PATCH | `/api/notifications/read-all` | owner | W·M |
| GET | `/api/notifications/preferences` | owner | W·M |
| PATCH | `/api/notifications/preferences` | owner | W·M |
| POST | `/api/notifications/devices` | authenticated | M |
| POST | `/api/notifications/broadcast` | `Notification.Broadcast` | W |

- **Request:** preferences `{email, push, in_app, categories}`; devices `{push_token, platform}` (mobile); broadcast `{audience, title, body}`.
- **Response:** danh sách thông báo (chưa đọc trước), `unread_count`.
- **Validation:** chỉ chủ sở hữu đọc/sửa; push_token hợp lệ; broadcast cần quyền + audit.
- **Rate Limit:** đọc tiêu chuẩn; broadcast rất thấp + audit.
- **Caching:** `private, no-store` (dữ liệu cá nhân hóa, realtime); dùng WebSocket/push cho realtime.

## 24. Audit Log (Kiểm toán)

> Nhật ký hành động đặc quyền **bất biến, append-only** — [database.md §3.21](../data/database.md), [ADR-016](../99-decisions/ADR-016-audit-log-model.md), [security.md §9](../architecture/security.md). **Chỉ đọc** qua API: không có endpoint tạo/sửa/xóa (audit sinh **nội bộ** trong mỗi workflow, không phải qua HTTP). Là nơi hiện thực permission `System.Audit.View` (rbac.md §3.3) vốn trước đây chưa có bề mặt.

| Method | Endpoint | Permission | Kênh |
|---|---|---|---|
| GET | `/api/audit` | `System.Audit.View` | W |
| GET | `/api/audit/:id` | `System.Audit.View` | W |
| GET | `/api/audit/entities/:entityType/:entityId` | `System.Audit.View` | W |

- **Request:** lọc `?event=&actor_id=&entity_type=&entity_id=&result=&from=&to=&correlation_id=&cursor=&limit=`; endpoint `/entities/:entityType/:entityId` trả **timeline** một tài nguyên (khớp index `(entity_type, entity_id, created_at)`).
- **Response:** danh sách `audit_logs` (`event`, `actor_id`/`actor_role`/`is_service_account`, `permission`/`scope`, `entity_type`/`entity_id`, `result`, `ip`, `context`, `created_at`); **cursor pagination** (dữ liệu chỉ tăng). `before`/`after` **redact PII/secret** trước khi trả.
- **Validation:** **chỉ `GET`** — mọi cố gắng ghi/sửa/xóa audit qua API bị từ chối (`405`/`403`); bất biến cưỡng chế ở tầng dữ liệu (§3.21). Truy cập bị **self-audit** (đọc audit cũng ghi `audit.viewed`).
- **Rate Limit:** hành động quản trị, thấp. **Caching:** `private, no-store` (dữ liệu điều tra/nhạy cảm).

---

## 25. Tài liệu & mở rộng

- **OpenAPI/Swagger** sinh từ contract, phục vụ tại `/api/docs` (dev/staging); **portal riêng** cho Public/Partner (`/public/docs`, `/partner/docs`).
- **Webhook (Partner):** sự kiện `place.updated`, `review.created`… đẩy tới đối tác (ký HMAC).
- **Mở rộng module tương lai** (Jobs, Real Estate, Marketplace) theo đúng khuôn: tài nguyên số nhiều + 8 mục + kênh — không đổi lõi.

## 26. Ghi chú — bổ sung sau

- [ ] Bảng lỗi (error code) đầy đủ theo module.
- [ ] Sơ đồ scope OAuth2 Partner ↔ Permission.
- [ ] Chuẩn webhook & retry/HMAC.
- [ ] Ngưỡng rate limit/quota cụ thể cho từng tier.
- [ ] Chuẩn định dạng bản ghi `audit_logs` chi tiết & chính sách retention (đồng bộ [security.md §12](../architecture/security.md)).

---

*Tài liệu liên quan: [architecture.md](../architecture/architecture.md), [security.md](../architecture/security.md), [rbac.md](../security/rbac.md), [auth.md](../security/auth.md), [database.md](../data/database.md), [workflow.md](../workflow/workflow.md), [coding-standard.md](../standards/coding-standard.md)*
