# Smart Travel Capability Audit — 2026-08-24

**Loại:** read-only audit. Không sửa code, không sửa dữ liệu, không migration, không git add/commit/push/deploy.
**Phạm vi:** chuyển Product Vision ("trợ lý du lịch đáng tin cậy cho Phú Quốc") thành kế hoạch triển khai kỹ thuật.

---

## 0. Git state — trước và sau

| | Trước audit | Sau audit |
|---|---|---|
| Branch | `feat/place-administrative-backfill` | `feat/place-administrative-backfill` |
| HEAD | `a045a8f84768635003802d34c5d39b114e713d1d` | `a045a8f84768635003802d34c5d39b114e713d1d` |
| Tracked changes | *(none)* | *(none)* |
| Untracked | `deploy-c9cf9e5.sh`, `research-round-2-21-places.md` | `deploy-c9cf9e5.sh`, `research-round-2-21-places.md`, **+ file báo cáo này** |
| Stash | empty | empty |

`deploy-c9cf9e5.sh` **không bị đụng tới**. Không file tracked nào bị sửa. Thay đổi duy nhất là file
báo cáo này, đặt tại `docs/delivery/reports/` theo đúng convention sẵn có của repo
(`RELEASE-READINESS-AUDIT-2026-07-30.md`, `SEARCH-FILTERS-2026-07-30.md`, …).

---

## 1. Executive summary

Repository này **không thiếu code**. Nó thiếu một đường dẫn để dữ liệu đã xác minh đến được người dùng.

Ba phát hiện chi phối toàn bộ kế hoạch bên dưới:

1. **Đường ghi vào production bị khoá cứng.** Cả `backfill-administrative-data.ts` lẫn
   `ingest-verified-facts.ts` gọi `assertNotProduction()` — abort khi `NODE_ENV=production` hoặc khi
   `DATABASE_URL`/`DB_HOST`/`DB_NAME` chứa chuỗi `"prod"`, **không có cờ bỏ qua, theo thiết kế**.
   Hiện **không tồn tại cơ chế nào** để một dữ kiện đã nghiên cứu đi vào CSDL thật.
   *Bằng chứng:* `apps/api/src/scripts/backfill-administrative-data.ts:33-58`,
   `apps/api/src/scripts/ingest-verified-facts.ts:6,23`.

2. **Đường đọc chậm 43 commit.** Production đang chạy `c9cf9e5`. API thật **không trả**
   `province`, `admin_area`, `trust_sources`. Toàn bộ Trust & Freshness Surface, administrative
   backfill, data-quality audit và legal pages đều vô hình với người dùng.
   *Bằng chứng:* `git log --oneline c9cf9e5..HEAD` → 43 commit; xác nhận bằng `GET /api/places/jw-marriott-phu-quoc`
   (không có ba trường trên trong payload).

3. **Lỗi NOT_APPLICABLE của beach là có thật, và đúng ~20 tác vụ thừa** — nhưng không phải ở nơi
   thường bị nghi. Rule N/A hoạt động đúng cho bãi biển *chưa có contact nào*. Nó **vỡ ngay khi
   thêm một contact bất kỳ** — kể cả một website do biên tập viên thêm vào. Xem §6.

Về mặt tích cực: mô hình miền ở đây mạnh hơn mặt bằng chung đáng kể. Provenance (`sources` +
`source_attributions` field-level), verification state machine đầy đủ (votes + optimistic lock +
expiry job), `wiki_revisions`, media licensing hoàn chỉnh, moderation với reason-code có kiểm soát,
RBAC theo DAG — tất cả đều là code thật, có test, nằm trong dependency graph. **Vấn đề là giao
hàng, không phải năng lực kỹ thuật.**

---

## 2. Trạng thái thực tế của sản phẩm

### 2.1. Phân biệt bốn tầng

Báo cáo này phân biệt rõ, vì trộn lẫn chúng là nguồn gốc của mọi đánh giá sai về độ sẵn sàng:

| Tầng | Nghĩa |
|---|---|
| **DB support** | Bảng/cột tồn tại trong migration đang chạy |
| **Backend support** | Có service + controller + route đăng ký trong `app.module.ts` |
| **UI support** | Có component/page render nó |
| **Production readiness** | Đã deploy VÀ có dữ liệu thật |

### 2.2. Quy mô code

| Hạng mục | Số lượng | Nguồn |
|---|---:|---|
| API module đăng ký | 30 | `apps/api/src/app.module.ts:51-87` |
| Controller | 30 | `find apps/api/src -name "*.controller.ts"` |
| Entity | 29 | `find apps/api/src -name "*.entity.ts"` |
| Migration | 46 | `apps/api/src/core/database/migrations/` |
| Web route | 41 | `apps/web/src/app/**/page.tsx` |
| Web module | 23 | `apps/web/src/modules/` |
| OpenAPI | 4.161 dòng | `docs/api/openapi.yaml` |

### 2.3. Dữ liệu thật (đo qua public API, 2026-08-24)

Postgres local không truy cập được từ máy này (`ECONNREFUSED 127.0.0.1:5432`), nên
`npm run audit:data-quality` **không chạy được trong lượt này**. Số liệu dưới đây đo qua public API —
đường đọc read-only đã được thiết lập từ trước.

| Trường | Coverage | Ghi chú |
|---|---:|---|
| Toạ độ | 49/49 | PostGIS, đầy đủ |
| Description | 49/49 | Từ seed migration |
| `price_range` | 27/49 | Enum thô (`free/low/mid/high`) |
| Reviews | 2/49 | |
| Ảnh | **0/49** | |
| Contacts (phone/website) | **0/49** | |
| `opening_hours` | **0/49** | |
| Verification tin cậy | **0/49** | Tất cả `pending` |
| FAQ | **0/49** | |
| `source_attributions` | **~0/49** | Backfill chưa chạy được lên production |

### 2.4. Mâu thuẫn tài liệu ↔ code (code là bằng chứng chính)

| Mâu thuẫn | Tài liệu nói | Code thật | Xử lý |
|---|---|---|---|
| `/weather/current`, `/forecast`, `/marine` | OpenAPI `2924-2952` mô tả đầy đủ | **Không có module, không có controller** | Ghi nhận: contract nói quá |
| `/ai/summary`, `/faq`, `/translate`, `/suggestions` | OpenAPI `2953-3000` | Bảng `place_ai_summary` có; **không service nào ghi** | Ghi nhận |
| `/notifications/*` | OpenAPI `3041-3115` | Thư mục `modules/notifications/` **rỗng** | Ghi nhận |
| `/community/posts` | OpenAPI `1860-1927` | Thư mục `modules/community/` **rỗng** | Ghi nhận |
| `/audit`, `/audit/entities/*` | OpenAPI `3116-3175` | `core/audit` có service, **không có controller** | Ghi nhận |
| Revision approval | ADR-014 mô tả vòng đời `pending → approved` | `PlacesService.update()` ghi thẳng `status: APPROVED` | Xem §7 |

> Năm nhóm endpoint được tài liệu hoá mà không có implementation. Điều này **thổi phồng độ sẵn sàng
> của weather và AI** — đúng hai mảng dễ bị giả định là "đã làm được một nửa".

---

## 3. Ma trận GAP

Ký hiệu: **IMPLEMENTED** (đủ 4 tầng trừ dữ liệu) · **PARTIAL** (thiếu ≥1 tầng) ·
**MISSING** (không có) · **BLOCKED** (code xong, chặn bởi yếu tố ngoài code).

### A. Data foundation

| Khả năng | Trạng thái | Bằng chứng | Đã có | Còn thiếu | Dep | Rủi ro | Size | Ưu tiên |
|---|---|---|---|---|---|---|---|---|
| Hồ sơ địa điểm | **IMPLEMENTED** | `places/entities/place.entity.ts` | Toàn bộ cột lõi + PostGIS | — | — | Thấp | — | — |
| Nguồn (source) | **BLOCKED** | `sources/entities/source.entity.ts`, 12 `SourceType` có reliability tier | Model + repo + service + controller | Dữ liệu không ghi được lên prod | §1.1 | **Cao** | M | **P0** |
| Ngày kiểm tra | **IMPLEMENTED** | `sources.retrieved_at`, `places.verified_at` | Cột + mapper + UI | Dữ liệu | — | Thấp | — | P0 |
| Mức xác minh | **BLOCKED** | `verifications` + `verification_events` + `verification_votes` | State machine đầy đủ, CAS lock, expiry job | Deploy + dữ liệu | §1.2 | **Cao** | M | **P0** |
| Giờ mở cửa | **BLOCKED** | `places.opening_hours` JSONB; `web/modules/places/openingHours.ts` | **Toàn bộ logic đọc đã xong** — timezone, qua đêm, ngoại lệ lễ | Dữ liệu (0/49) | §1.1 | Thấp | — | **P0** |
| Giá | **PARTIAL** | `prices/entities/price-history.entity.ts` | amount/currency/unit/is_free/valid_from + verification | Dữ liệu chi tiết; chỉ có `price_range` thô | §1.1 | Trung | M | P0 |
| Liên hệ | **BLOCKED** | `contacts/entities/contact.entity.ts` (polymorphic) | Model + CRUD + UI | Dữ liệu (0/49) | §1.1 | Thấp | — | **P0** |
| Tiện ích (amenities) | **PARTIAL** | `/hotels/{id}/amenities` (OpenAPI 1107) | Có cho hotel | Không có khái niệm chung cho place | — | Thấp | L | P2 |
| Đối tượng phù hợp | **MISSING** | — | — | Không có schema | — | Thấp | L | P2 |
| Thời gian nên đến | **MISSING** | — | — | Không có schema | — | Thấp | M | P2 |
| Thời lượng tham quan | **MISSING** | — | — | Không có schema — **chặn trip planner** | — | Trung | M | P1 |
| Điều kiện thời tiết | **MISSING** | — | — | Không có schema | E.weather | Trung | L | P2 |
| Trạng thái hoạt động | **PARTIAL** | `PlaceStatus` = `draft/pending/published/archived` | 4 trạng thái | **Không diễn đạt được "nghi đã đóng cửa"** | — | **Cao** | M | **P0** |
| Ảnh + bản quyền | **BLOCKED** | `media.entity.ts:97-113` — `licenseType`, `attribution`, `licenseUrl` | Upload presign, ordering, cover, licence đầy đủ | **0 ảnh**; cần quyết định quyền ảnh | Owner | **Cao** | L | **P0** |
| Bản dịch | **MISSING** | — | Chỉ `place_ai_summary.language` | **Không có i18n lib, không có trường dịch trên Place** | — | Trung | XL | P1 |

### B. Discovery

| Khả năng | Trạng thái | Bằng chứng | Đã có | Còn thiếu | Dep | Rủi ro | Size | Ưu tiên |
|---|---|---|---|---|---|---|---|---|
| Tìm kiếm | **IMPLEMENTED** | `search/search.service.ts`, `searchFullText()` | Postgres FTS + unaccent, `ts_rank` không lộ ra API | — | — | Thấp | — | — |
| Bộ lọc | **IMPLEMENTED** | `places.dto.ts:120-135` `ListPlacesQueryDto` | category / ward / price_range | Chưa có `open_now` | — | Thấp | S | P0 |
| Đang mở | **BLOCKED** | `openingHours.ts:getOpeningToday()` | Logic **hoàn chỉnh và đúng**: quy về timezone của place, khung qua đêm, ngoại lệ, dữ liệu hỏng → `unknown` **không bao giờ** → `closed` | Dữ liệu; filter phía API | A.giờ | Thấp | S | **P0** |
| Gần tôi | **IMPLEMENTED** | `geo.service.ts:nearby()`, `places.repository.ts:415` | PostGIS `ST_Distance`, trả `distance_m` | — | — | Thấp | — | — |
| Sắp xếp theo khoảng cách | **IMPLEMENTED** | `places.repository.ts:420` `ORDER BY distance_m ASC, p.id ASC` | Có khoá phụ chống hoà | — | — | Thấp | — | — |
| Bản đồ | **IMPLEMENTED** | `geo.service.ts:bbox()`, `web/modules/map/` | Cluster theo zoom, MapLibre | — | — | Thấp | — | — |
| Chỉ đường | **MISSING** | — | Toạ độ có sẵn 49/49 | Deep-link ra app bản đồ | — | Thấp | **S** | **P0** |
| So sánh | **MISSING** | — | — | Vô nghĩa khi các trường còn rỗng | A | Thấp | M | P2 |

### C. Trust and safety

| Khả năng | Trạng thái | Bằng chứng | Đã có | Còn thiếu | Dep | Rủi ro | Size | Ưu tiên |
|---|---|---|---|---|---|---|---|---|
| Báo sai thông tin | **PARTIAL** | `moderation/entities/report.entity.ts`; `ModerationTargetType.PLACE` **đã có trong enum** | reports + cases + severity + queue UI; media target hoạt động đầy đủ | **FSM cho `place` chưa triển khai** (ADR-018 cố ý để ngoài); `ReportReason` thiên về nội dung xấu, không có mã "sai dữ kiện" | — | Trung | M | **P0** |
| Xử lý xung đột nguồn | **PARTIAL** | `source.md §7`; `IssueType.CONFLICTING_DATA` | Thang reliability + thứ tự giải quyết đã định nghĩa | Chưa có UI/luồng cho moderator xử lý | — | Trung | M | P1 |
| Cảnh báo dữ liệu cũ | **BLOCKED** | `trust.ts:getTrustBadge()` → `stale`; `expireOverdue()` | Badge + job hết hạn đã xong | Deploy + dữ liệu | §1.2 | Thấp | — | P0 |
| Xác thực doanh nghiệp | **PARTIAL** | `business/business-claims.controller.ts` | Claim + duyệt + members + transfer | **Lỗi tách bạch trust/commercial** — xem §3.1 | — | **Cao** | M | **P0** |
| Cảnh báo lừa đảo | **MISSING** | — | — | Không có model | — | Trung | L | P1 |
| Trung tâm hỗ trợ khẩn cấp | **MISSING** | — | — | Cần nội dung có nguồn, không cần schema mới | Owner | **Cao** | M | P1 |

#### 3.1. Lỗi tách bạch trust ↔ ownership (phát hiện mới)

`BusinessClaimsService.decide()` ghi **thẳng** `places.verification_status = 'official'` khi duyệt
claim — không đi qua `verifications`, không tạo `sources` row. Trong khi đó
`web/src/modules/places/trust.ts:44-48` ánh xạ **mọi** trạng thái tin cậy — gồm `official` — sang
badge công khai **"Đã xác minh"**.

Hệ quả: **chứng minh mình là chủ cơ sở ⇒ được badge độ chính xác dữ kiện, với 0 bằng chứng nguồn.**
Sở hữu và độ chính xác là hai khẳng định khác nhau; badge hiện đang gộp chúng.

ADR-008 ghi nhận đây là ngoại lệ chuyển tiếp có chủ đích, và CORRECTION sau đó thêm guard để claim
không **ghi đè** một `verifications` row đã có. Guard đó chống *mâu thuẫn giữa hai writer* — nó
**không** giải quyết việc gộp hai khái niệm.

### D. Trip intelligence

| Khả năng | Trạng thái | Đã có | Còn thiếu | Dep | Size | Ưu tiên |
|---|---|---|---|---|---|---|
| Tạo lịch trình | **MISSING** | Toạ độ + khoảng cách | Giờ mở cửa, thời lượng tham quan | A | XL | P2 |
| Dự toán ngân sách | **PARTIAL** | `price_history` map gọn vào 4 lớp phân loại (xem §8.6) | Dữ liệu giá; giá vận tải **không có nguồn nào** | A.giá | L | P2 |
| Tối ưu tuyến | **MISSING** | `ST_Distance` làm nền | Routing thật (external) | — | L | P2 |
| Phương án khi mưa/biển động | **MISSING** | — | Weather + alert | E | L | P2 |
| AI hỏi đáp grounded | **MISSING** | `sources.reliability` đặt AI ở đáy (30) | Dữ liệu để ground | A | XL | P2 |
| Lưu & chia sẻ lịch trình | **MISSING** | — | — | D.lịch trình | M | P2 |
| Dùng ngoại tuyến | **MISSING** | — | PWA shell | — | M | P2 |

### E. Real-time information

| Khả năng | Trạng thái | Bằng chứng | Còn thiếu | Size | Ưu tiên |
|---|---|---|---|---|---|
| Thời tiết | **MISSING** | OpenAPI mô tả, **0 implementation** | Toàn bộ module | L | P1 |
| Thời tiết biển | **MISSING** | như trên | Toàn bộ | L | P1 |
| Tàu/phà/cano/cáp treo | **PARTIAL** | `transports` module + `/transports` API | Không có dữ liệu lịch/giá; không có trạng thái vận hành | L | P1 |
| Chuyến bay | **MISSING** | — | Toàn bộ (external) | XL | P2 |
| Đường sá / công trình | **MISSING** | — | Toàn bộ | L | P2 |
| Sự kiện | **PARTIAL** | `events` table (raw SQL repo, **không có entity**), `/events`, `/events/calendar`, trang web đã có | **Nội dung sự kiện** (nhiều khả năng 0) | M | P1 |
| Cảnh báo đóng cửa | **PARTIAL** | `events.status_override` + `sources` + `source_attributions` | 3 cột: `severity`, `affected_area`, `last_checked_at` | M | P1 |

> **Kết luận quan trọng cho E:** không cần xây "alert subsystem". `events` + `sources` +
> `source_attributions` đã bao phủ ~70% mô hình cảnh báo (cửa sổ thời gian, place liên quan, loại,
> nguồn + publisher + reliability, khả năng tắt thủ công). Thiếu đúng **ba cột**. Chi phí thật nằm ở
> chỗ `events` dùng raw SQL không có TypeORM entity, nên sửa là chạm SQL viết tay.

### F. International visitors

| Khả năng | Trạng thái | Bằng chứng | Còn thiếu | Size | Ưu tiên |
|---|---|---|---|---|---|
| Việt–Anh | **MISSING** | `apps/web/package.json` dependencies = maplibre-gl, next, react, react-dom — **không có i18n lib** | Trích xuất chuỗi UI (toàn bộ page/component đang hard-code tiếng Việt) | XL | P1 |
| Mở rộng Hàn/Trung/Nga | **MISSING** | — | Kiến trúc phải cho phép; **không triển khai ở P0/P1** | XL | P2 |
| Tiền tệ | **MISSING** | `price_history.currency` char(3) có sẵn | Quy đổi + hiển thị | M | P2 |
| Visa | **MISSING** | — | Nội dung có nguồn + ngày cập nhật | M | P2 |
| Địa chỉ cho tài xế | **IMPLEMENTED** | `places.address` giữ nguyên tiếng Việt | **Không được dịch** — dịch là làm hỏng | — | — |
| Mẫu câu khẩn cấp | **MISSING** | — | Nội dung | S | P2 |
| WhatsApp/Zalo/gọi điện | **PARTIAL** | `contacts.contact_type` là varchar(30) **tự do** → chứa được ZALO/WHATSAPP | Dữ liệu + nút hành động trên UI | S | P0 |

---

## 4. Lỗi NOT_APPLICABLE của beach — điều tra chi tiết

### 4.1. Root cause

Rule N/A **hoạt động đúng** cho bãi biển chưa có contact nào. Nó **vỡ ngay khi có một contact bất kỳ**.

```ts
// apps/api/src/modules/admin-data/data-quality-audit.service.ts:88-91
export function hasOperator(input: {
  businessClaimStatus: string | null;
  contactCount: number;          // ← BẤT KỲ contact nào cũng tính
}): boolean {
  return input.businessClaimStatus === 'approved' || input.contactCount > 0;
}
```

```ts
// :98-105
export function notApplicableFieldsFor(input): string[] {
  if (!input.categorySlug || !OPERATOR_OPTIONAL_CATEGORIES.has(input.categorySlug)) return [];
  if (hasOperator(input)) return [];        // ← thoát N/A cho CẢ BA field
  return [...OPERATOR_DEPENDENT_FIELDS];    // ['phone', 'opening_hours', 'website']
}
```

Gọi tại `:376-380` với `contactCount: contacts.length` — **đếm thô mọi dòng contact**.

**Kịch bản vỡ:** biên tập viên thêm **một link website** (ví dụ trang của Sở Du lịch) cho Bãi Sao.

1. `contacts.length = 1` → `hasOperator()` = `true`
2. `notApplicableFieldsFor()` → `[]`
3. `record.contacts.phone_count = 0` → **MISSING_FIELD `phone`** (P1) phát sinh (`:606`)
4. `record.opening_hours_present = false` → **MISSING_FIELD `opening_hours`** (P1) phát sinh (`:616`)

Một bãi biển công cộng vừa bị giao hai tác vụ **không thể hoàn thành** — đúng loại việc mà rule N/A
được viết ra để loại bỏ (xem chính comment ở `:63-70`).

### 4.2. Phạm vi ảnh hưởng

10 slug thuộc category `beach` trong bộ 49 (`administrative-backfill.manifest.ts`):

`bai-cua-can`, `bai-dai`, `bai-khem`, `bai-ong-lang`, `bai-rach-vem`, `bai-sao`, `bai-thom`,
`bai-truong`, `bai-vong`, `mui-ganh-dau`

**10 bãi × 2 trường (`phone` + `opening_hours`) = 20 tác vụ dữ liệu thừa** — khớp chính xác con số
"~20" đã nêu.

> ⚠️ *Cảnh báo về số đếm:* hai lần đọc API qua tóm tắt cho hai phân bố category khác nhau (một tổng
> 49, một tổng 45). Số bãi biển là **9 hoặc 10** — cần một `GROUP BY category_id` trực tiếp để chốt.
> Con số 20 dựa trên 10 slug có tiền tố `bai-`/`mui-` trong manifest.

Lỗi này **chưa kích hoạt** vì cả 49 place đang có 0 contact. Nó sẽ nổ **đúng lúc Slice 1/3 bắt đầu
nhập liệu** — tức là ngay khi công việc dữ liệu bắt đầu có kết quả.

### 4.3. Test hiện có

`data-quality-audit.service.spec.ts:575-660` — có hẳn một `describe` regression cho N/A, phủ:

| Test | Dòng | Phủ |
|---|---|---|
| Bãi không operator → `phone`/`opening_hours` là N/A | 581 | ✅ |
| Bãi có business claim approved → vẫn báo MISSING | 596 | ✅ |
| Bãi **có contacts** → thoát N/A | 613 | ⚠️ **dùng contact loại `PHONE`** |
| Restaurant chưa có phone → vẫn báo MISSING | 628 | ✅ |
| Attraction công cộng vẫn báo MISSING phone | 639 | ✅ |
| `price_range` không bao giờ N/A cho bãi biển | 647 | ✅ |
| N/A không tạo completeness ảo | 656 | ✅ |

### 4.4. Test còn thiếu — chính là chỗ lỗi ẩn

Test ở dòng 613 dùng `contactType: 'PHONE'` — **trường hợp lành tính**. Nếu bãi biển có phone thì
`phone_count > 0`, nên MISSING_FIELD `phone` không phát sinh dù N/A đã mất. Test vô tình chỉ chứng
minh trường hợp không gây hại rồi khái quát hoá.

**Thiếu:** bãi biển có contact **không phải phone** (website/email/zalo) → phải khẳng định
`phone` và `opening_hours` **vẫn** là N/A.

### 4.5. Phương án sửa nhỏ nhất và an toàn nhất

Chỉ những contact **chỉ dấu operator** mới được xoá N/A. Một link website do biên tập viên thêm
không phải bằng chứng có đơn vị vận hành.

Regex đã tồn tại sẵn trong cùng file (`:476`, dùng cho `hasPhone`) — **tái dùng, không viết lần hai**:

```ts
// Đề xuất — MỘT định nghĩa "contact chỉ dấu operator", dùng lại regex ở :476
const OPERATOR_SIGNAL_CONTACT = /phone|hotline|mobile|tel/i;

export function hasOperator(input: {
  businessClaimStatus: string | null;
  operatorContactCount: number;   // đổi tên: chỉ đếm contact chỉ dấu operator
}): boolean {
  return input.businessClaimStatus === 'approved' || input.operatorContactCount > 0;
}
```

Tại call site `:376-384`, truyền:
```ts
operatorContactCount: contacts.filter((c) => OPERATOR_SIGNAL_CONTACT.test(c.contactType)).length,
```

**Vì sao đây là phương án nhỏ nhất:**
- Không migration, không đổi schema, không đổi API contract.
- Không đổi hành vi cho bãi biển có phone (test dòng 613 vẫn xanh — phone vẫn là chỉ dấu operator).
- Không đụng `price_range`/`address`/`faqs` (đang cố ý không bị chặn).
- Không mở rộng `OPERATOR_OPTIONAL_CATEGORIES` — giữ nguyên phạm vi hẹp chỉ `beach`.
- Giữ nguyên nguyên tắc gốc: N/A suy ra từ **tín hiệu thật**, không từ tên category.

**Rủi ro:** thấp. Rủi ro duy nhất là bãi biển thật sự có đơn vị vận hành nhưng **chỉ** đăng website
(không có số điện thoại) sẽ giữ N/A sai. Trường hợp này tự thoát ngay khi có business claim hoặc
khi thêm số điện thoại — đúng cơ chế tự-thoát mà thiết kế gốc đã chủ ý.

---

## 5. Pipeline Sun World Hòn Thơm + VinWonders

Pipeline mục tiêu: `source → candidate fact → revision → moderation/approval → verified fact → API → UI`

### 5.1. Từng bước

| Bước | Trạng thái | Bằng chứng | Ghi chú |
|---|---|---|---|
| **source** | ✅ **CÓ** | `verified-facts-ingestion.service.ts:170` `ensureSource()`; dedupe theo `(type, external_ref)` | `SourceType.OFFICIAL_WEBSITE`, reliability suy từ `retrievalMethod` |
| **candidate fact** | ✅ **CÓ** | `verified-facts.manifest.ts:VERIFIED_FACTS_ROUND1` | **Cả hai place đã có sẵn trong manifest**, kèm quote nguyên văn |
| **revision** | ✅ **CÓ** | `PlacesService.update(…, RevisionOrigin.IMPORT)` → `recordPlaceRevision()` | Tự sinh `wiki_revisions` |
| **moderation / approval** | ❌ **THIẾU** | `places.service.ts:315` ghi thẳng `status: RevisionStatus.APPROVED` | Comment ở `:305` tự nhận: *"Sprint 4 sẽ chuyển sang luồng `pending` chờ duyệt"* — **TODO đã biết, chưa làm** |
| **verified fact** | ✅ **CÓ** | `VerificationsService.submit()` + `.official()`; `ensureOfficialFromClaim()` method=`SOURCE_MATCH` | Không ghi tay cache — để `syncTargetCache()` làm, đúng ADR-008 |
| **source_attributions** | ✅ **CÓ** | 3 lớp: `place_field`, `contact`, `wiki_revision` | Cùng 3 lớp administrative-backfill dùng |
| **API** | ✅ **CÓ** (code) / ❌ **KHÔNG** (prod) | `places.mapper.ts:48-49`; `PlaceDetail.trust_sources` | **Production chưa deploy** |
| **UI** | ✅ **CÓ** (code) / ❌ **KHÔNG** (prod) | `places/[slug]/page.tsx:110,119,269` — badge giờ mở cửa, bảng tuần, contacts, trust sources | **Production chưa deploy** |

### 5.2. Hai chặn thật

1. **`assertNotProduction()`** — script từ chối chạy với production. Không có cờ bỏ qua.
   → Dữ kiện của Sun World/VinWonders **không thể** đến CSDL thật.
2. **43 commit chưa deploy** — kể cả khi ghi được, API prod không trả `trust_sources`.

### 5.3. Điểm mạnh đã sẵn sàng

Manifest đã thể hiện đúng kỷ luật cần có, và nên giữ nguyên làm chuẩn:
- Sun World: `openingHours: null` vì nguồn **chỉ nói giờ đóng**, không nói giờ mở → dữ kiện một phần
  đi vào `partialFactNote` (→ `source_attributions.note`), **không** vào `places.opening_hours`.
  Audit vẫn báo `opening_hours` MISSING — **đúng**, vì ta thật sự chưa biết.
- VinWonders: `retrievalMethod: 'search_index'` (vinwonders.com trả 403) → reliability 75/confidence 70,
  **không làm tròn lên** 90.

### 5.4. Tiêu chí nghiệm thu cho Slice 1

- [ ] `npm run admin:ingest-verified-facts -- --dry-run` chạy sạch, in đúng 2 target.
- [ ] Chạy thật trên DB rehearsal: tạo ≥1 `sources` row/target, `source_attributions` đủ 3 lớp,
      1 `wiki_revisions`, `verifications` cho từng contact.
- [ ] Chạy lại lần hai → **idempotent** (0 ghi mới, `alreadyCurrent = 2`).
- [ ] `GET /api/places/sun-world-hon-thom` trả `contacts[]` có 2 số + `trust_sources[]` không rỗng.
- [ ] Trang chi tiết render badge "Đã xác minh" + tên publisher + ngày kiểm tra.
- [ ] Sun World **vẫn** báo `opening_hours` MISSING trong audit (không bịa giờ mở).
- [ ] VinWonders hiển thị đúng mức tin cậy thấp hơn (search_index), không bị nâng lên 90.

---

## 6. Place Completeness Contract (đề xuất cho 300 địa điểm)

### 6.1. Bắt buộc cho MỌI địa điểm

| Trường | Lý do |
|---|---|
| `name`, `slug` | Định danh |
| `location` (toạ độ) | Không có toạ độ thì không lên bản đồ, không "gần tôi", không chỉ đường |
| `category_id` | Quyết định các trường còn lại |
| **`status` hoạt động** | Câu hỏi đắt nhất: *nơi này còn tồn tại không* |
| `short_description` | Nhận biết trong danh sách |
| **≥1 `source_attribution`** | Lời hứa cốt lõi của sản phẩm |
| **ảnh có licence đầy đủ** | Không có ảnh = không dùng được; ảnh không licence = rủi ro pháp lý |

### 6.2. Bắt buộc theo category

| Category | Thêm bắt buộc |
|---|---|
| Hotel / Resort | `phone`, `website`, `address`, giá (khoảng + nguồn) |
| Restaurant / Cafe | `phone`, `opening_hours`, `address` |
| Attraction (có bán vé) | `opening_hours`, giá vé, `phone` nếu có đơn vị vận hành |
| Attraction (công cộng) | `address`; **không** ép `phone`/`website` |
| Tour | `phone`, giá, điểm hẹn, giờ khởi hành |
| Market | `opening_hours`, `address` |
| Beach | `address`; `phone`/`opening_hours`/`website` **chỉ khi có operator** |

### 6.3. Được phép NOT_APPLICABLE

Chỉ khi **suy ra từ tín hiệu thật**, không bao giờ từ tên category:

| Trường | Điều kiện N/A |
|---|---|
| `phone`, `opening_hours`, `website` | category ∈ {`beach`} **VÀ** không có business claim approved **VÀ** không có contact chỉ dấu operator (§4.5) |

> Quy tắc bất biến: **N/A thu hẹp mẫu số, không cộng điểm.** Đã được `computeCompleteness()`
> (`:518-527`) thực hiện đúng — giữ nguyên.

### 6.4. Được phép UNKNOWN

Mọi trường ở §6.1/§6.2 đều được phép UNKNOWN **có thời hạn**, với điều kiện UI nói rõ là chưa biết.
UNKNOWN là kết quả hợp lệ; UNKNOWN **im lặng** thì không.

Cấm tuyệt đối: biến UNKNOWN thành khẳng định. Chuẩn mực đã có trong code — `getOpeningToday()` đưa
mọi đường không đọc được về `unknown`, **không bao giờ** về `closed`, vì *"nói 'đã đóng cửa' khi
thực ra ta không biết là bịa thông tin, và người đọc sẽ không đến nơi"* (`openingHours.ts:16-18`).
**Áp dụng nguyên tắc này cho mọi trường mới.**

### 6.5. Quy tắc nguồn

Dùng thang đã có ở `docs/data/modules/source.md §4.1` — **không tạo thang mới**:

`government` 95 > `official_website` 90 > `business_owner` 85 > `moderator` 80 >
`openstreetmap` 75 > `google_maps` 70 > `press` 65 > `field_survey` 60 > `facebook` 55 >
`community` 50 > `other` 40 > **`ai` 30 (luôn thấp nhất)**

Thêm quy tắc `retrievalMethod` đã có ở `verified-facts.manifest.ts:44-51`:
`direct_fetch` → reliability 90 / confidence 90 · `search_index` → 75 / 70. **Không làm tròn lên.**

**Dữ liệu hành chính** (`province`, `admin_area`, ward, khu phố): chỉ nhận nguồn `government`.
Website doanh nghiệp **không được** ghi đè — bằng chứng thực tế: website chính thức của Sailing Club
Phú Quốc đăng *"Duong To ward, Phu Quoc City, Kien Province"*, cả hai tên đều đã bị thay thế
(`verified-facts.manifest.ts:19-27`). **Không suy đoán khu phố từ tên xã/phường cũ.**

### 6.6. Quy tắc độ mới

Dùng chính sách đã có, **không phát minh ngưỡng số-ngày thứ hai**: `verifications.expires_at`
(mặc định +12 tháng) + job `expireOverdue()` hạ trạng thái xuống `expired`.
`verification_status = 'expired'` **chính là** tín hiệu "đã lâu chưa kiểm tra lại"
(`trust.ts:14-18`, `data-quality-audit.service.ts:549-553`).

Bổ sung đề xuất: **báo cáo sai thông tin từ người dùng là tín hiệu độ mới đang bị bỏ phí.** Một
place tích tụ nhiều report "giờ sai" nên được hạ hạn xác minh sớm.

### 6.7. Quy tắc xử lý xung đột

Theo `source.md §7`, thứ tự: `is_primary` → `reliability` cao hơn → `retrieved_at` mới hơn →
hàng đợi moderator.

Bổ sung từ thực tế Research Round 2: **hai nguồn cùng hạng, không nguồn nào `is_primary`, cùng độ
tươi → KHÔNG được tung đồng xu.** Ghi `NEEDS_REVIEW` và chờ direct_fetch hoặc quyết định người.
(Ca thật: giờ mở cửa Vinpearl Safari — hai nguồn search_index nói 9:00 và 8:30.)

### 6.8. Quy tắc hiển thị "Chưa xác minh"

- Ba badge, không bốn: `verified` / `stale` / `unverified` (`trust.ts:34-40`). `pending` và
  `rejected` gộp thành `unverified`.
- **Cấm cụm "Đã xác minh chính thức"** — tạo cảm giác bảo đảm pháp lý mà hệ thống không chứng minh
  được. Cả ba trạng thái tin cậy dùng chung một nhãn (`trust.ts:41-49`).
- Trường UNKNOWN phải hiển thị "Chưa có thông tin", **không được ẩn đi** — ẩn khiến người đọc tưởng
  đã đầy đủ.
- **Đề xuất mới (từ §3.1):** place có badge tin cậy *chỉ nhờ business claim* phải phân biệt được với
  place có bằng chứng nguồn thật.

### 6.9. Quy tắc cấm AI suy đoán

AI **không bao giờ** được khởi tạo: số điện thoại · giá · giờ mở cửa · tình trạng còn chỗ ·
trạng thái hoạt động · thông tin pháp lý/visa · cảnh báo chính thức · dữ liệu hành chính.

Thiếu dữ liệu ⇒ **UNKNOWN / CHƯA XÁC MINH**, không bao giờ là một giá trị hợp lý hoá.
`sources.reliability` đã đặt AI ở đáy (30) nên nội dung AI không thể ghi đè nguồn người/chính thức —
**giữ nguyên**. Tiền lệ đã có trong code: audit service không có nhánh nào tự sinh giá trị thay thế;
`proposed_value` luôn `null` khi thiếu dữ liệu (`data-quality-audit.types.ts`).

---

## 7. Roadmap theo vertical slice

### 7.1. Thay đổi so với thứ tự đề xuất — có bằng chứng

Thứ tự đề xuất trong brief **về cơ bản đúng** và tôi giữ nguyên Slice 0→9, với **một thay đổi bắt buộc**:

> **Phải chèn Slice 0.5 — Production Data Delivery Path — giữa Slice 0 và Slice 1.**

**Bằng chứng kỹ thuật:** Slice 1 ("hoàn thiện pipeline cho Sun World và VinWonders") **không thể
hoàn thành** theo định nghĩa hiện tại. `assertNotProduction()` (`backfill-administrative-data.ts:33`,
được `ingest-verified-facts.ts:6` import lại) abort trên mọi dấu hiệu production, **không có cờ bỏ
qua**. Pipeline chạy được đến CSDL local — nhưng "qua toàn bộ pipeline đến giao diện người dùng"
đòi production. Không có Slice 0.5 thì Slice 1 chỉ nghiệm thu được trên máy dev, và Slice 3/4
(nâng chất 49 place, mở rộng lên 300) sẽ tích luỹ dữ liệu không bao giờ đến tay người dùng.

Ngoài ra, **Slice 5 nên tách đôi**: "Chỉ đường" (size S, không phụ thuộc dữ liệu mới, dùng toạ độ
đã có 49/49) nên tách khỏi "Đang mở / bộ lọc" (phụ thuộc dữ liệu giờ mở cửa từ Slice 3).

### 7.2. Bảng slice

| # | Slice | Ưu tiên | Phụ thuộc |
|---|---|---|---|
| 0 | Sửa NOT_APPLICABLE + audit completeness đúng | **P0** | — |
| 0.5 | **Production data delivery path** | **P0** | Owner |
| 1 | Pipeline Sun World + VinWonders | **P0** | 0.5 |
| 2 | Place Completeness Contract + import template | **P0** | 0, 1 |
| 3 | Nâng chất 49 place hiện có | **P0** | 2, quyết định quyền ảnh |
| 3.5 | Chỉ đường + nút gọi *(tách từ Slice 5)* | **P0** | — |
| 4 | Mở rộng batch 100 → 200 → 300 | P1 | 3 |
| 5 | Tìm kiếm, bộ lọc, Đang mở, Gần tôi | P1 | 3 |
| 6 | Báo sai thông tin + trust/safety | P1 | 3 |
| 7 | Việt–Anh | P1 | — |
| 8 | Thời tiết, cảnh báo biển, trung tâm hỗ trợ | P2 | Owner |
| 9 | Lịch trình + AI grounded | P2 | 4, 5, 8 |

### 7.3. Chi tiết từng slice

---

#### Slice 0 — Sửa NOT_APPLICABLE

- **Mục tiêu người dùng:** *(gián tiếp)* hàng đợi dữ liệu chỉ chứa việc làm được, nên công sức đi vào
  chỗ thật sự cải thiện trang địa điểm.
- **Phạm vi:** `hasOperator()` chỉ tính contact chỉ dấu operator; thêm test cho contact non-phone.
- **Ngoài phạm vi:** mở rộng N/A ra category khác; đụng `price_range`/`address`/`faqs`; đổi
  `computeCompleteness()`.
- **File dự kiến:** `data-quality-audit.service.ts` (`hasOperator`, `notApplicableFieldsFor`, call
  site `:376`), `data-quality-audit.service.spec.ts`.
- **Migration:** ❌ không.
- **API:** ❌ không đổi.
- **UI:** ❌ không đổi.
- **Test bắt buộc:** bãi biển có contact **website-only** → `phone` + `opening_hours` **vẫn** N/A;
  toàn bộ 7 test regression hiện có phải xanh.
- **Dữ liệu cần chuẩn bị:** không.
- **Rủi ro:** **Thấp.** Chỉ ảnh hưởng báo cáo audit, không ảnh hưởng dữ liệu hay API công khai.
- **Nghiệm thu:** thêm một website vào một bãi biển ⇒ không sinh MISSING_FIELD `phone`/`opening_hours`.
- **Rollback:** revert một commit; không có state nào cần hoàn tác.

---

#### Slice 0.5 — Production data delivery path

- **Mục tiêu người dùng:** dữ kiện đã xác minh cuối cùng cũng đến được trang mà du khách đọc.
- **Phạm vi:** thiết kế đường ghi production có kiểm soát — migration đã review, hoặc endpoint admin
  sau RBAC, hoặc luồng promotion — kèm cổng phê duyệt và audit trail đầy đủ.
- **Ngoài phạm vi:** **gỡ bỏ `assertNotProduction()`**; ghi trực tiếp từ máy dev.
- **File dự kiến:** thiết kế trước, chưa chốt file. Tái dùng `core/audit`, RBAC, `sources`.
- **Migration:** có thể, tuỳ phương án được chọn.
- **API:** có thể thêm endpoint admin.
- **UI:** không ở bước thiết kế.
- **Test bắt buộc:** phải chứng minh tính chất "không thể ghi production do nhầm lẫn" **vẫn giữ**.
- **Rủi ro:** **Cao.** Một đường không an toàn ở đây phá bỏ mọi bảo đảm mà guard hiện tại cung cấp.
- **Nghiệm thu:** owner duyệt bản thiết kế; guard chống-nhầm-lẫn còn nguyên.
- **Rollback:** thiết kế → không có gì để rollback.

---

#### Slice 1 — Pipeline Sun World + VinWonders

- **Mục tiêu người dùng:** hai điểm đến lớn nhất đảo có số điện thoại, giờ mở cửa và badge nguồn thật.
- **Phạm vi:** chạy manifest đã có qua toàn pipeline; kiểm chứng idempotency.
- **Ngoài phạm vi:** thêm place mới; thêm dữ kiện ngoài manifest; **triển khai cổng moderation**.
- **File dự kiến:** không sửa code nếu pipeline chạy đúng — đây là slice **vận hành + kiểm chứng**.
- **Migration:** ❌.
- **API/UI:** ❌ không đổi (đã có sẵn).
- **Test bắt buộc:** dry-run; chạy thật; chạy lại → idempotent.
- **Dữ liệu:** `VERIFIED_FACTS_ROUND1` — **đã có sẵn**.
- **Rủi ro:** Trung. Ghi thật vào CSDL.
- **Nghiệm thu:** xem §5.4.
- **Rollback:** `wiki_revisions` giữ snapshot trước đó; revert bằng revision.

---

#### Slice 2 — Completeness Contract + import template

- **Mục tiêu người dùng:** *(gián tiếp)* mọi place mới đạt cùng một chuẩn tối thiểu.
- **Phạm vi:** mã hoá §6 thành contract kiểm chứng được; template nhập liệu có cột nguồn bắt buộc.
- **Ngoài phạm vi:** thêm trường schema mới (thời lượng, đối tượng phù hợp… — **chưa đủ bằng chứng**).
- **Migration:** ❌ (cố ý).
- **Rủi ro:** Thấp.
- **Nghiệm thu:** một place nhập theo template đạt Contract mà không cần sửa tay.
- **Rollback:** tài liệu + config.

---

#### Slice 3 — Nâng chất 49 place

- **Mục tiêu người dùng:** mỗi place trong 49 trả lời được: liên hệ ở đâu, mở lúc nào, ở đâu, trông thế nào.
- **Phạm vi:** contacts + opening_hours + ảnh có licence + source attribution cho 49 place.
- **Ngoài phạm vi:** thêm place thứ 50.
- **Dữ liệu:** Research Round 2 Batch 1+2 đã có **9 ứng viên direct_fetch confidence cao**.
- **Rủi ro:** Trung — phụ thuộc quyết định quyền ảnh của owner.
- **Nghiệm thu:** Gate 49 (ảnh ≥80%, contact ≥90% applicable, hours ≥80% applicable, source 100%).
- **Rollback:** theo revision.

---

#### Slice 3.5 — Chỉ đường + nút gọi

- **Mục tiêu người dùng:** từ "đọc về nơi này" sang "đi tới nơi này".
- **Phạm vi:** deep-link ra app bản đồ từ toạ độ (đã có 49/49); `tel:` khi có phone.
- **Migration/API:** ❌.
- **UI:** `places/[slug]/page.tsx`.
- **Rủi ro:** **Rất thấp.** Không phụ thuộc dữ liệu mới cho phần chỉ đường.
- **Nghiệm thu:** chỉ đường hoạt động trên iOS/Android/desktop; nút gọi chỉ hiện khi có phone.
- **Rollback:** revert UI.

---

#### Slice 4–9

Chi tiết đầy đủ cần một vòng thiết kế riêng sau khi Slice 0–3 hoàn thành, vì phạm vi thật của chúng
phụ thuộc vào dữ liệu mà Slice 3 tạo ra. Điểm chốt đã xác định được từ bằng chứng repo:

- **Slice 5 "Đang mở":** phía web **0 dòng code mới** (`getOpeningToday()` đã xong). Chỉ cần thêm
  `open_now` vào `ListPlacesQueryDto` + SQL. **Bắt buộc:** place không rõ giờ **không bao giờ** bị
  lọc ra như "đã đóng".
- **Slice 6:** tái dùng `reports` + `moderation_cases`; chỉ cần thêm FSM cho target `place`
  (`ModerationTargetType.PLACE` **đã có trong enum**) + mã lý do sai-dữ-kiện theo tiền lệ
  `MediaModerationReasonCode`.
- **Slice 7:** lớn hơn vẻ ngoài — **không có i18n lib nào** trong `apps/web/package.json`; trích xuất
  chuỗi là refactor toàn bộ page/component. Địa chỉ **giữ tiếng Việt** (cho tài xế).
- **Slice 8:** cảnh báo = `events` + 3 cột (`severity`, `affected_area`, `last_checked_at`) +
  `source_attributions`, **không phải subsystem mới**. Trung tâm hỗ trợ = **nội dung có nguồn,
  không cần schema**.
- **Slice 9:** chặn bởi `opening_hours` + thời lượng tham quan; AI grounded chặn bởi dữ liệu.

---

## 8. Tác vụ tiếp theo được chọn

### **Slice 0 — Sửa `hasOperator()` để chỉ contact chỉ dấu operator mới xoá NOT_APPLICABLE**

**Vì sao chọn tác vụ này:**

- **Nhỏ:** một hàm, một call site, một file test. Vừa một commit.
- **Giá trị thật:** ngăn 20 tác vụ không thể hoàn thành làm ô nhiễm hàng đợi **trước khi** Slice 1/3
  bắt đầu nhập liệu. Sửa sau khi đã nhập thì phải dọn cả hàng đợi lẫn niềm tin vào báo cáo audit.
- **Rủi ro thấp:** không migration, không đổi API, không đụng dữ liệu, không chạm production.
  Chỉ ảnh hưởng đầu ra của một báo cáo nội bộ.
- **Không trộn mục tiêu:** đúng một lỗi, đúng một hàm.
- **Không bị chặn:** đây là tác vụ P0 **duy nhất** không phụ thuộc quyết định của owner.

> Slice 0.5 quan trọng hơn về mặt chiến lược, nhưng nó là **quyết định của owner về khẩu vị rủi ro**,
> không phải việc Claude tự làm được — nên nó nằm ở §9, không phải ở đây.

### 8.1. Implementation prompt (chưa thực hiện)

```text
NHIỆM VỤ: Sửa lỗi NOT_APPLICABLE của beach trong Data Quality Audit.

BỐI CẢNH
File: apps/api/src/modules/admin-data/data-quality-audit.service.ts

Rule NOT_APPLICABLE hiện hoạt động đúng cho bãi biển KHÔNG có contact nào, nhưng vỡ
ngay khi có MỘT contact bất kỳ. `hasOperator()` (dòng ~88) đếm thô `contactCount`,
nên một link website do biên tập viên thêm vào cũng bị coi là bằng chứng "có đơn vị
vận hành", làm bãi biển công cộng thoát diện N/A và sinh lại hai MISSING_FIELD
không thể hoàn thành (`phone`, `opening_hours`).

Ảnh hưởng: 10 slug category `beach` trong bộ 49 × 2 trường = 20 tác vụ thừa. Lỗi
chưa kích hoạt vì hiện 0/49 place có contact — nó sẽ nổ đúng lúc bắt đầu nhập liệu.

YÊU CẦU

1. Đổi `hasOperator()` để CHỈ contact chỉ dấu operator mới tính:
   - TÁI DÙNG regex đã có ở `summarizeContacts()` (dòng ~476): /phone|hotline|mobile|tel/i
   - Khai báo nó thành MỘT hằng số dùng chung cho cả hai chỗ. KHÔNG viết regex lần hai.
   - Đổi tên tham số `contactCount` → `operatorContactCount` để tên nói đúng ngữ nghĩa.

2. Cập nhật call site (dòng ~376-384) truyền số contact ĐÃ LỌC.

3. GIỮ NGUYÊN, không được đụng:
   - `OPERATOR_OPTIONAL_CATEGORIES` vẫn CHỈ chứa 'beach'
   - `OPERATOR_DEPENDENT_FIELDS` vẫn là ['phone','opening_hours','website']
   - `price_range`, `address`, `faqs` vẫn KHÔNG bị chặn (có chủ đích)
   - `computeCompleteness()` — N/A vẫn thu hẹp mẫu số, KHÔNG cộng điểm
   - Nhánh business claim approved vẫn xoá N/A như cũ

4. Test (data-quality-audit.service.spec.ts, describe 'NOT_APPLICABLE' ~dòng 575):
   - THÊM: bãi biển có contact WEBSITE-ONLY → `phone` và `opening_hours` VẪN N/A,
     `has_operator` = false, không sinh MISSING_FIELD cho hai trường đó.
   - THÊM: bãi biển có contact EMAIL-only → hành vi như trên.
   - GIỮ XANH cả 7 test regression hiện có, đặc biệt test dòng ~613 (contact PHONE
     → thoát N/A) — hành vi này KHÔNG được đổi.

RÀNG BUỘC
- Không migration. Không đổi API contract. Không đụng dữ liệu.
- Không chạm production, không deploy.
- Comment bằng tiếng Việt, theo đúng văn phong giải thích "vì sao" của file hiện tại.

NGHIỆM THU
- `npm test -- data-quality-audit` xanh toàn bộ.
- `npm run lint` và `tsc --noEmit` sạch.
- Thêm một website vào một bãi biển ⇒ KHÔNG sinh MISSING_FIELD phone/opening_hours.
```

---

## 9. Quyết định cần chủ dự án phê duyệt

| # | Quyết định | Vì sao repo không tự trả lời được | Chặn |
|---|---|---|---|
| 1 | **Deploy 43 commit tồn đọng** | Deploy đã bị dừng bởi quyết định trước của owner; legal pages trong đó cố ý chưa qua luật sư | Toàn bộ roadmap |
| 2 | **Phương án ghi production** | Khẩu vị rủi ro cho cơ chế ghi dữ liệu thật là phán đoán của người | Slice 0.5, 1, 3, 4 |
| 3 | **Mô hình quyền ảnh** | Chủ cơ sở cung cấp / mua licence / thuê chụp — câu hỏi chi phí và quyền | Slice 3, Gate 49 |
| 4 | **Số khẩn cấp công bố** | Công bố kênh khẩn cấp mang trách nhiệm pháp lý | Slice 8 |
| 5 | **Câu chữ trách nhiệm cảnh báo** | Cách diễn đạt khi chuyển tiếp cảnh báo chính thức là vấn đề pháp lý | Slice 8 |
| 6 | **Tách bạch trust ↔ ownership (§3.1)** | Cần quyết định sản phẩm: badge riêng cho owner-managed, hay bắt buộc sinh `sources` row từ claim evidence | Slice 6 |
| 7 | **Lộ trình ngôn ngữ** | Thị trường nào quan trọng là quyết định kinh doanh | Slice 7 |

---

## 10. Blocker cần con người xác minh

| # | Blocker | Vì sao cần người |
|---|---|---|
| 1 | **Postgres local không chạy** — `npm run audit:data-quality` không thực thi được | Cần khởi động Docker; số liệu coverage trong báo cáo này đến từ public API thay thế |
| 2 | **Phân bố category chưa chốt** (9 hay 10 beach) | Hai lần đọc API qua tóm tắt cho kết quả khác nhau (49 vs 45). Cần `GROUP BY category_id` trực tiếp |
| 3 | **`cho-dem-phu-quoc` — nghi đã đóng cửa từ 28/02/2026** | Claim không có nguồn trích dẫn, chỉ là ghi chú trong code comment. Cần nguồn báo chí/chính quyền |
| 4 | **`fusion-resort-phu-quoc` — vắng mặt trên portfolio của chính thương hiệu** | `fusionresorts.com` chỉ liệt kê Cam Ranh, Quy Nhon, Da Nang; trade press nói resort mới mở 4Q2027. Place đang `published` |
| 5 | **`tour-3-dao-an-thoi` — có thể là tuyến, không phải doanh nghiệp** | Câu hỏi mô hình thực thể, cần quyết định người |
| 6 | **Vinpearl Safari — hai nguồn nói giờ mở khác nhau** (9:00 vs 8:30) | Hai nguồn cùng hạng search_index, không có tiêu chí phân xử |
| 7 | **Duplicate-distance check chưa chạy** | `detectPossibleDuplicates()` (ngưỡng 25m) cần DB local. Novotel/Mường Thanh/Sonasea cùng khu phức hợp Bãi Trường — cần kiểm tra chéo |

---

## 11. Nếu chỉ làm một việc tiếp theo — việc đó là gì và vì sao?

**Sửa `hasOperator()` trong `data-quality-audit.service.ts` để chỉ contact chỉ dấu operator mới xoá
trạng thái NOT_APPLICABLE.**

Không phải vì đó là việc quan trọng nhất — việc quan trọng nhất là mở đường ghi production (§9.2),
và đó là quyết định của owner, không phải việc Claude tự làm.

Mà vì đây là **việc duy nhất thoả mãn cả bốn điều kiện cùng lúc**: đủ nhỏ để gọn trong một commit,
tạo giá trị thật, rủi ro gần như bằng không, và **không bị chặn bởi bất kỳ quyết định nào của owner**.

Và vì thời điểm. Lỗi này hiện **chưa gây hại** — cả 49 place đều có 0 contact nên rule chưa bao giờ
bị kích hoạt sai. Nó sẽ nổ **đúng vào khoảnh khắc Slice 1 và Slice 3 bắt đầu nhập liệu thật**, tức
là đúng lúc công việc dữ liệu bắt đầu có kết quả. Sửa bây giờ tốn một commit. Sửa sau khi đã nhập
liệu thì phải dọn hàng đợi, dọn báo cáo, và dọn cả niềm tin của người vận hành vào con số audit —
mà niềm tin vào chính hệ thống đo lường chất lượng là thứ đắt nhất để lấy lại.

Một hệ thống đo lường chất lượng dữ liệu chỉ có giá trị khi nó không tạo ra việc không thể làm.
Sửa nó trước khi mở vòi dữ liệu là thứ tự đúng.

---

*Báo cáo này chỉ đọc. Không file tracked nào bị sửa. `deploy-c9cf9e5.sh` giữ nguyên untracked, không bị đụng.*
