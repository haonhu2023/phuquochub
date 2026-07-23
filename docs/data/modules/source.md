# PhuQuocHub — Thiết kế Entity `Source` (Nguồn gốc dữ liệu)

> Tài liệu này chỉ **thiết kế** (không code). Bổ sung thực thể `Source` cho tầng dữ liệu, chi tiết hóa nguyên tắc *"có nguồn, có phiên bản"* nêu trong [vision.md](../../overview/vision.md) và mục *"Phân biệt nguồn nội dung"* trong [module-places-db.md](./places.md).

## 1. Nguyên tắc: mọi dữ liệu Place phải biết nguồn gốc

Trong mô hình **Wikipedia + Reddit + Google Maps**, giá trị cốt lõi là **chính xác & minh bạch**. Điều đó chỉ đạt được khi **mỗi mẩu dữ liệu đều truy vết được về nguồn**: một số điện thoại đến từ chủ cơ sở, một tọa độ đến từ OpenStreetMap, một mô tả do cộng đồng viết, một tóm tắt do AI sinh.

Ba mức truy vết (provenance) mà thiết kế phải hỗ trợ:

1. **Mức trường (field-level):** biết từng trường/bản ghi đến từ nguồn nào (badge "Nguồn: OSM" cạnh tọa độ `places`, "Nguồn: Chủ cơ sở" cạnh hotline trong `contacts`).
2. **Mức bản ghi (entity-level):** một ảnh, một vé, một FAQ, một review gắn với nguồn.
3. **Mức phiên bản (revision-level):** mỗi lần chỉnh sửa (`WikiRevision`) trích dẫn nguồn làm căn cứ — giống *citation* của Wikipedia.

## 2. Hai khái niệm tách biệt

| Khái niệm | Vai trò | Bảng |
|---|---|---|
| **Source (Nguồn)** | *Danh mục* nguồn có thể tái sử dụng: một URL, một node OSM, một người dùng, một lần chạy AI, một tài liệu chính quyền. | `sources` |
| **Attribution (Quy chiếu nguồn)** | *Liên kết đa hình* nối một `Source` tới một mẩu dữ liệu cụ thể (place, trường, ảnh, vé, revision…). | `source_attributions` |

Tách hai khái niệm để **một nguồn dùng lại cho nhiều dữ liệu** (một dataset chính quyền seed hàng trăm địa điểm) và **một dữ liệu có nhiều nguồn** (tọa độ vừa từ OSM vừa được chủ cơ sở xác nhận) — tức quan hệ **N–N**.

## 3. Sơ đồ quan hệ (ERD)

```
                          ┌──────────────────────┐
       (đa hình)          │       sources        │
   ┌──────────────────────┤  danh mục nguồn      │
   │                      │  (URL / OSM / user /  │
   │                      │   AI / offline …)     │
   │                      └──────────┬───────────┘
   │                                 │ 1:N
   │                                 ▼
   │                    ┌────────────────────────┐
   │  entity_type +     │  source_attributions   │  ── verified_by ──► users
   ├───entity_id──────► │  (quy chiếu nguồn)      │
   │  [+ field]         │  source_id, entity,     │
   │                    │  field, confidence…     │
   │                    └────────────────────────┘
   │                                 ▲
   ▼ trỏ tới bất kỳ                  │ entity_type='wiki_revision'
  places · media · price_history · place_faqs · reviews · wiki_revisions
                                     ▲
                                     │ 1:N
                          ┌──────────┴───────────┐
   places ──1:N────────►  │     wiki_revisions   │  ── editor_id / reviewed_by ─► users
                          │  (lịch sử phiên bản) │
                          └──────────────────────┘
```

## 4. Bảng `sources` — Danh mục nguồn

| Cột | Kiểu | Null | Mô tả |
|---|---|---|---|
| `id` | UUID (PK) | ✗ | |
| `type` | ENUM | ✗ | **Loại nguồn** (xem §4.1) |
| `kind` | ENUM | ✗ | Hình thức tham chiếu: `url, dataset, platform_user, ai_model, offline` |
| `title` | VARCHAR(200) | ✓ | Tên hiển thị ("Website chính thức Vinpearl", "OSM node #123") |
| `url` | VARCHAR(500) | ✓ | Link nguồn (nếu `kind=url`) |
| `external_ref` | VARCHAR(150) | ✓ | Định danh ngoài: OSM node/way id, Google Place ID, Facebook page id |
| `publisher` | VARCHAR(200) | ✓ | Đơn vị phát hành ("OpenStreetMap contributors", "Sở Du lịch Kiên Giang") |
| `author_user_id` | UUID (FK → users) | ✓ | Nếu nguồn là người dùng nền tảng (community/moderator/business_owner) |
| `license` | VARCHAR(60) | ✓ | Giấy phép dữ liệu: `ODbL-1.0`, `CC-BY-4.0`, `proprietary`… |
| `reliability` | SMALLINT | ✗ | Bậc tin cậy 0–100 (mặc định theo `type`, có thể tinh chỉnh) |
| `language` | CHAR(2) | ✓ | Ngôn ngữ nguồn |
| `retrieved_at` | TIMESTAMPTZ | ✓ | Thời điểm lấy/đối chiếu dữ liệu (đánh giá độ mới) |
| `metadata` | JSONB | ✓ | Bổ sung: version model AI, snapshot tiêu đề trang, HTTP status… |
| `created_at / updated_at` | TIMESTAMPTZ | ✗ | |
| `deleted_at` | TIMESTAMPTZ | ✓ | Soft delete |

**Index:** `UNIQUE(type, external_ref) WHERE external_ref IS NOT NULL` (không nhân bản cùng một node OSM), `BTREE(type)`, `BTREE(author_user_id)`.

### 4.1 `type` — Bảng phân loại nguồn (khớp yêu cầu)

| `type` | Nhóm | `reliability` gợi ý | Ghi chú |
|---|---|---|---|
| `official_website` | Chính thức | 90 | Website chính thức của địa điểm/thương hiệu |
| `business_owner` | Chính thức | 85 | Chủ cơ sở đã claim & xác minh trang |
| `government` | Chính thức | 95 | Cổng dữ liệu/công báo chính quyền |
| `google_maps` | Bên thứ ba | 70 | *Lưu ý ToS:* dùng để đối chiếu, cân nhắc ràng buộc bản quyền |
| `openstreetmap` | Mở | 75 | Dữ liệu mở (ODbL) — **bắt buộc ghi công (attribution)** |
| `press` | Bên thứ ba | 65 | Báo chí, bài viết uy tín |
| `facebook` | Mạng xã hội | 55 | Trang/bài Facebook |
| `community` | Cộng đồng | 50 | Người dùng đóng góp (chờ/đã kiểm duyệt) |
| `field_survey` | Bản địa | 60 | Khảo sát thực địa của cộng tác viên |
| `moderator` | Nội bộ | 80 | Moderator biên tập/hợp nhất, đã kiểm chứng |
| `ai` | Máy sinh | 30 | Nội dung do AI sinh — **luôn thấp nhất, cần người duyệt** |
| `other` | — | 40 | Chưa phân loại |

> `reliability` là **điểm khởi tạo theo loại**, không cố định — moderator có thể nâng/hạ cho một nguồn cụ thể. Điểm này dùng để **xử lý xung đột** khi hai nguồn mâu thuẫn (§7).

## 5. Bảng `source_attributions` — Quy chiếu nguồn (đa hình)

Nối một `Source` với **một mẩu dữ liệu cụ thể**. Cột `field` cho phép truy vết **đến từng trường** của `places`.

| Cột | Kiểu | Null | Mô tả |
|---|---|---|---|
| `id` | UUID (PK) | ✗ | |
| `source_id` | UUID (FK → sources) | ✗ | Nguồn |
| `entity_type` | ENUM | ✗ | `place, place_field, contact, media, price_history, place_faq, review, wiki_revision` |
| `entity_id` | UUID | ✗ | Id đối tượng được quy chiếu |
| `field` | VARCHAR(60) | ✓ | Tên trường khi `entity_type=place_field` (`location`, `opening_hours`, `description`, `address`…). *Liên hệ dùng `entity_type=contact` (bản ghi `contacts`), không phải trường của `places`.* |
| `confidence` | SMALLINT | ✓ | Mức tin của lần gán này 0–100 (khác `sources.reliability` — độ tin của *nguồn nói chung*) |
| `note` | VARCHAR(300) | ✓ | Trích dẫn/ghi chú ("giờ mở cửa lấy từ mục Liên hệ trên web") |
| `is_primary` | BOOLEAN default false | ✗ | Nguồn chính cho trường/bản ghi (khi có nhiều nguồn) |
| `verified_by` | UUID (FK → users) | ✓ | Moderator đã đối chiếu và xác nhận |
| `verified_at` | TIMESTAMPTZ | ✓ | |
| `created_by` | UUID (FK → users) | ✓ | Người khai báo nguồn (null nếu hệ thống/AI) |
| `created_at` | TIMESTAMPTZ | ✗ | |

**Index:** `BTREE(entity_type, entity_id)` (lấy mọi nguồn của một place), `BTREE(source_id)` (mọi dữ liệu sinh ra từ một nguồn — phục vụ gỡ bỏ theo giấy phép), `UNIQUE(entity_type, entity_id, field, source_id)`.

### 5.1 Ví dụ dữ liệu — một Place, nhiều nguồn theo trường

| entity_type | field | source.type | is_primary | ý nghĩa |
|---|---|---|---|---|
| `place_field` | `location` | `openstreetmap` | ✓ | Tọa độ nhập từ OSM |
| `place_field` | `location` | `business_owner` | ✗ | Chủ cơ sở xác nhận lại |
| `contact` | — (bản ghi) | `official_website` | ✓ | Hotline (`contacts`) lấy từ web chính thức |
| `place_field` | `opening_hours` | `community` | ✓ | Giờ mở cửa do cộng đồng cập nhật |
| `place` (bản ghi) | — | `google_maps` | ✗ | Địa điểm phát hiện ban đầu từ Google Maps |

Nhờ vậy giao diện render được **badge nguồn cạnh từng trường**, và người đọc biết trường nào "chính thức", trường nào "cộng đồng".

## 6. Bảng `wiki_revisions` — Phiên bản & lịch sử (WikiRevision)

Tiến hóa từ phác thảo `place_revisions` cũ (**đã retire — legacy**, xem [places.md §10](./places.md)) thành thực thể phiên bản đầy đủ, **đa hình** để áp dụng cho cả trang chủ đề/khu vực (theo trụ cột Wikipedia trong vision).

| Cột | Kiểu | Null | Mô tả |
|---|---|---|---|
| `id` | UUID (PK) | ✗ | |
| `entity_type` | ENUM | ✗ | `place` (giai đoạn đầu; sau: `topic, area`) |
| `entity_id` | UUID | ✗ | Trỏ tới `places.id` |
| `revision_number` | INT | ✗ | Số thứ tự tăng dần theo entity |
| `parent_revision_id` | UUID (FK self) | ✓ | Phiên bản cha (dựng cây/diff) |
| `snapshot` | JSONB | ✗ | Toàn bộ trạng thái nội dung tại thời điểm đó |
| `diff` | JSONB | ✓ | Danh sách trường đổi (tối ưu hiển thị lịch sử) |
| `origin` | ENUM | ✗ | **Kênh phát sinh:** `community_edit, owner_update, moderator_edit, osm_sync, ai_generation, import` |
| `change_note` | VARCHAR(300) | ✓ | Ghi chú thay đổi (tóm tắt sửa) |
| `editor_id` | UUID (FK → users) | ✓ | Người sửa (null nếu hệ thống/AI/đồng bộ) |
| `status` | ENUM | ✗ | `pending, approved, rejected, reverted` |
| `reviewed_by` | UUID (FK → users) | ✓ | Moderator duyệt |
| `reviewed_at` | TIMESTAMPTZ | ✓ | |
| `created_at` | TIMESTAMPTZ | ✗ | |

**Index:** `UNIQUE(entity_type, entity_id, revision_number)`, `BTREE(entity_type, entity_id, status)`.

### 6.1 Quan hệ `Source` ↔ `WikiRevision`

- **Mỗi revision trích dẫn nguồn:** các nguồn làm căn cứ cho lần sửa được gắn qua `source_attributions` với `entity_type='wiki_revision'`, `entity_id = revision.id`. Đây chính là *citation* của Wikipedia — "bạn sửa gì thì phải dẫn nguồn".
- **`origin` vs `Source`:** `origin` cho biết **kênh kỹ thuật** phát sinh revision (đồng bộ OSM, chủ cơ sở, AI…), còn `source_attributions` cho biết **bằng chứng nội dung**. Một revision `origin=community_edit` vẫn có thể trích dẫn nguồn `official_website`.
- **Provenance của Place là hình chiếu của lịch sử:** trạng thái hiện tại của `places` = snapshot của revision `approved` mới nhất. Vì mỗi revision mang theo nguồn, **mọi trường của Place đều truy về được revision (và nguồn) đã đặt ra nó**.

### 6.2 Đồng bộ hai tầng provenance

- `source_attributions(entity_type='wiki_revision')` — **lịch sử, bất biến** (audit trail đầy đủ).
- `source_attributions(entity_type IN ('place','place_field',…))` — **ảnh chụp hiện hành** để hiển thị nhanh badge, được *materialize* từ revision `approved` mới nhất qua job/nghiệp vụ khi duyệt.

Cách này vừa cho tra cứu tức thời (khỏi dựng lại từ lịch sử mỗi lần render) vừa giữ nguyên vết đầy đủ.

## 7. Xử lý xung đột nguồn (Source conflict)

Khi nhiều nguồn gán cùng một trường với giá trị khác nhau:

1. Chọn attribution `is_primary = true`; nếu không có →
2. Chọn nguồn có `reliability` (đã tinh chỉnh) cao nhất; nếu bằng →
3. Ưu tiên `retrieved_at` mới hơn (dữ liệu tươi hơn); cuối cùng →
4. Đưa vào hàng chờ **moderator** quyết định, ghi lại lựa chọn như một revision mới.

`ai` luôn ở bậc thấp nhất → dữ liệu AI **không bao giờ tự ghi đè** dữ liệu người/chính thức.

## 8. Vì sao `Source` là một trong những Entity quan trọng nhất

`Source` không phải bảng phụ trợ — nó là **xương sống của trụ cột "Chính xác & minh bạch"** và của **Trust model** (vision §5, §6). Cụ thể:

1. **Là điều tách PhuQuocHub khỏi "một blog nữa".** Tuyên ngôn *"Muốn biết bất cứ điều gì về Phú Quốc — hãy mở PhuQuocHub"* chỉ đáng tin khi mỗi thông tin **có thể kiểm chứng**. Không có `Source`, nền tảng chỉ là tập hợp khẳng định không dẫn chứng.

2. **Vận hành phân tầng niềm tin (verified vs community).** Vision phân biệt nội dung *chính thức* và *cộng đồng*. Ranh giới đó **chính là `source.type`** — không có nó thì "verified" chỉ là một cờ boolean không giải thích được.

3. **Trọng tài khi dữ liệu mâu thuẫn.** Cộng đồng mở tất yếu sinh xung đột; `reliability` + `retrieved_at` cho một quy tắc **khách quan, tự động** để hòa giải (§7), giảm gánh nặng moderator.

4. **Tuân thủ pháp lý & giấy phép.** OSM là ODbL (**buộc ghi công**), dữ liệu Google có ràng buộc ToS. Nhờ `source.license` + `source_attributions(source_id)`, có thể **lọc/gỡ bỏ dữ liệu theo giấy phép** hoặc xuất trang ghi công — thứ không thể làm nếu nguồn bị trộn lẫn.

5. **Quản trị AI (AI governance).** Vision và [module-places-db.md](./places.md) đã yêu cầu *provenance* cho nội dung AI. `Source(type=ai)` với `reliability` thấp nhất đảm bảo nội dung máy sinh **được đánh dấu rõ, không tự ghi đè, luôn qua người duyệt** — chống "ô nhiễm" tri thức bằng ảo giác AI.

6. **Độ tươi & đồng bộ.** `retrieved_at` cho biết dữ liệu cũ tới đâu, kích hoạt re-sync từ OSM/website — trực tiếp phục vụ North Star *"độ phủ & độ đầy đủ thông tin"*.

7. **Nền tảng cho Dữ liệu mở / API công khai.** Bên thứ ba tiêu thụ API cần biết **độ tin và cách ghi công** của từng trường. `Source` biến dữ liệu thành **có thể trích dẫn (citable)** — điều kiện để trở thành hạ tầng tri thức mở, không chỉ một website.

8. **Chống lạm dụng & kiểm toán.** Mọi khẳng định gắn với nguồn và người khai báo (`created_by`, `verified_by`) → truy vết được ai đưa dữ liệu sai, hỗ trợ phát hiện review/nguồn giả (vision §6).

> Tóm lại: `places` trả lời *"cái gì"*, `users`/`wiki_revisions` trả lời *"ai và khi nào"*, còn **`Source` trả lời *"vì sao nên tin"*** — mảnh ghép biến dữ liệu thành **tri thức đáng tin**, đúng linh hồn "Wikipedia" của nền tảng.

## 9. Quyết định cần chốt

1. **Field-level ngay từ đầu?** Bật `place_field` provenance cho mọi trường, hay giai đoạn 1 chỉ gắn nguồn ở **mức bản ghi** (place/media/review) rồi mở rộng sau? → **Chốt: mức bản ghi trước** (§10.1).
2. **Materialize ảnh chụp provenance** (§6.2) bằng job nền hay tính trực tiếp từ revision khi render (đơn giản hơn, chậm hơn)? → **Chốt: tính trực tiếp (live query)**, chưa cần job (§10.1).
3. **`reliability` tự động vs thủ công:** chỉ khởi tạo theo `type`, hay cho moderator một UI tinh chỉnh từng nguồn? → **Chốt: tự động theo `type`**, không có UI tinh chỉnh ở vòng này; `sources.reliability` vẫn ghi được thủ công qua API nếu cần (§10.1).
4. **Gộp hay tách với `place_ai_summary`:** coi mỗi lần chạy AI là một bản ghi `sources(type=ai)` + attribution, hay giữ `place_ai_summary` riêng và chỉ tham chiếu chéo? → **Chốt: giữ tách**, không đụng vào `place_ai_summary` ở vòng này (§10.1).

## 10. Trạng thái triển khai

### 10.1 Quyết định triển khai (đóng §9)

- **entity_type của `source_attributions` là `VARCHAR(30)` lowercase, KHÔNG phải enum** — dù bảng ở §5 ghi "ENUM", triển khai theo đúng chuẩn discriminator đa hình B-3 (data-dictionary.md), nhất quán với `contacts.owner_type`/`price_history.entity_type` (tập giá trị còn mở — `review` chưa có bảng riêng nhưng đã ghi attribution được, `wiki_revision` đã có bảng). Khác `wiki_revisions.entity_type` (enum thật) vì tập đó đóng và hẹp hơn.
- Bốn quyết định còn lại: xem đáp án inline ở §9 phía trên.

### 10.2 Đã triển khai

- **Schema:** `1720001700000-InitSources.ts` — enum `source_type` (12 giá trị §4.1)/`source_kind` (5 giá trị §4), bảng `sources`, bảng `source_attributions`, đủ index theo §4/§5, và nối FK còn thiếu `price_history.source_id → sources.id` (bảng `sources` lúc `price_history` được tạo — InitPlaces — chưa tồn tại).
- **Permission:** `1720001800000-SeedSourcePermissions.ts` — `Source.Create` (contributor, business_manager), `Source.Verify` (moderator). Không seed `Source.Manage`/`Source.View` vì chưa có endpoint dùng tới (tránh permission "chết").
- **Module:** `apps/api/src/modules/sources/` — entities, repositories, `SourcesService` (gồm thuật toán phân xử §7: `is_primary` → `reliability` → `retrieved_at` → hàng chờ moderator, hàm thuần `resolveConflict`, test riêng từng nhánh), controller (`POST/GET sources`, `POST/GET attributions`, `PATCH attributions/:id/verify`).
- **Ngoài phạm vi vòng này** (giữ nguyên, chưa làm): backfill provenance cho 49 place đã seed (nguồn thực của chúng không xác định được — xem `SeedPlacesExpansion`); field-level provenance (cột `field` đã tồn tại, chưa bắt buộc dùng); FE badge nguồn; cập nhật `prisma/schema.prisma` (đang là artifact mồ côi, không gắn build nào).

---

*Tài liệu liên quan: [vision.md](../../overview/vision.md), [database.md](../database.md), [module-places-db.md](./places.md), [architecture.md](../../architecture/architecture.md)*
