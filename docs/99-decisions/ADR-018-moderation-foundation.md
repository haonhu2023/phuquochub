# ADR-018 — Nền tảng Kiểm duyệt (Moderation Foundation)

## Status

**Accepted — 2026-08-02.**

Tiến trình phê duyệt trong cùng ngày: bản đầu (chỉ kiến trúc) → Owner **chấp thuận về nguyên tắc** kèm 6 quyết định (O1–O6) và 10 yêu cầu sửa đổi → **Bản sửa đổi 1** áp dụng toàn bộ, dịch sang tiếng Việt, nêu **O7** là quyết định còn lại duy nhất → Owner chốt **O7** → **Accepted**.

Toàn bộ **bảy** quyết định O1–O7 đã chốt; **không còn quyết định Owner nào chưa giải quyết** (xem §Quyết định & Ràng buộc mục 1 và mục 7). ADR này là **thẩm quyền triển khai** cho các milestone M1–M7.

Không supersede ADR nào. **Bổ sung** cho [ADR-009](ADR-009-media-model.md) (lần đầu tiên `media.status` có nơi ghi), [ADR-016](ADR-016-audit-log-model.md) (lần đầu tiên các mã sự kiện `moderation.decided` / `report.created` / `moderation.report_resolved` có nơi phát), và giải quyết thực thể **`reports`** — vốn bị [database.md §11](../data/database.md) liệt kê là *"được API/Workflow tham chiếu nhưng CHƯA phê duyệt"* từ Wave 1.

> Ngôn ngữ: tiếng Việt, khớp ADR-001…017 (bản đầu viết bằng tiếng Anh, đã dịch theo yêu cầu sửa đổi #7). **Giữ nguyên tiếng Anh:** tên bảng, tên cột, giá trị enum, mã quyền, route API, mã sự kiện audit, tên class/file.

## Context

### Tài sản đã có, và có ý nghĩa quyết định

| Tài sản | Trạng thái | Liên quan |
|---|---|---|
| `media.status` (`pending`/`published`/`hidden`/`rejected`) | Đã ship | Đối tượng kiểm duyệt media |
| `media.ai_moderation_score`, `media.ai_labels` | Đã ship, **chưa ai ghi** | Chỗ đáp sẵn cho AI (ADR-009) |
| `reviews.status` (`pending`/`published`/`hidden`) | Đã ship | Đối tượng kiểm duyệt review |
| `audit_logs` + `AuditService.record()` | Đã ship, đang dùng | ADR-016; đã có sẵn cơ chế redact |
| RBAC (`roles`/`permissions`/`role_parents`/`user_roles`) | Đã ship | `moderator` đã tồn tại, kế thừa `contributor`+`local_guide`; `administrator` kế thừa `moderator` |
| `authorization.util.ts` (`Any ⊃ Managed ⊃ Own`, deny thắng) | Đã ship | Ngữ nghĩa scope cho quyền mới |
| `booking-status.transition.ts` | Đã ship | Tiền lệ: module FSM thuần, không phụ thuộc DB, unit-test độc lập |
| `BOOKING_EVENT_PUBLISHER` + `LoggingBookingEventPublisher` | Đã ship | Tiền lệ: DI token cho domain event, không broker |
| `npm run media:cleanup` (`clean-orphan-media.ts`) | Đã ship | Tiền lệ: runner thủ công, không scheduler |
| [moderation.md](../workflow/moderation.md) (WF-07/09/11/12/13/18) | Chỉ thiết kế, chưa triển khai | Nguồn chuẩn về hành vi |
| `openapi.yaml`: `/reviews/{id}/report`, `/media/{id}/moderate` | Stub rỗng (chưa có schema) | Tên route đã được đặt trước, phải tôn trọng |

### Những gì chưa tồn tại

- **Không có bảng `reports`** — [database.md §11](../data/database.md) xếp vào nhóm chưa phê duyệt.
- **Không có hàng chờ kiểm duyệt** dưới bất kỳ hình thức nào.
- **Không có bảng/module `notifications`** (`apps/api/src/modules/notifications/` là thư mục rỗng). Mọi dòng "Notification:" trong WF-07/11/12/13/18 hiện không có đích đến.
- **Không có module `contributions`** (thư mục rỗng) — loại item `contribution` của WF-07 chưa có thực thể nào đứng sau.
- **Không có mô hình chế tài người dùng.** `users` chỉ có một cờ `is_active`; không có warn/mute/ban, không `banned_until`, không đếm vi phạm — dù quyền `User.Ban` và route `POST /users/{id}/ban` đã tồn tại.
- **Không có scheduler, queue, hay message broker.** `apps/api/package.json` không có `@nestjs/schedule`, `bull`, `bullmq`, `kafkajs`, `amqplib`.
- **Việc tạo review hiện KHÔNG nằm trong transaction.** `ReviewsService.create()` gọi tuần tự `save()` → `attachToReview()` → `recalculateRating()`, mỗi lệnh một transaction ngầm riêng. Đây là một lỗ hổng có sẵn mà O2 buộc phải đóng lại (xem D3).

### Phát hiện quyết định

**Mọi ảnh đã upload đều không thể hiển thị ở bất cứ đâu, và chưa bao giờ hiển thị được.**

Chuỗi lập luận, kiểm chứng trực tiếp trong mã nguồn:

1. `MediaRepository.createUploaded()` chèn mọi dòng với `status = 'pending'` (default của entity) và `url = NULL` (chủ ý — Media Upload Foundation, 2026-07-30).
2. `MediaRepository.attachToReview()` **chỉ** đặt `review_id`; **không** đụng tới `status`.
3. Đường đọc media duy nhất, `MediaRepository.listPublishedByPlace()`, lọc `status = 'published'`.
4. **Không một dòng mã nào trong `apps/api` ghi `MediaStatus.PUBLISHED`.** Lần xuất hiện duy nhất của hằng số đó ngoài file test chính là mệnh đề `WHERE` ở bước 3.

Vì vậy milestone Image Upload UI (2026-08-01) — dù đã được kiểm chứng end-to-end trên trình duyệt thật, kèm truy vấn DB trực tiếp chứng minh `attachToReview()` đã chạy — đưa ảnh vào một trạng thái mà không gì lấy ra được. Đây **không** phải lỗi do milestone nào gây ra; đó là hệ quả **đúng như thiết kế** của ADR-009 khi để `pending` làm mặc định và hoãn lại chủ thể phê duyệt. Moderation Foundation chính là chủ thể bị hoãn đó.

Điều này định khung lại toàn bộ milestone: đây không phải *"thêm tính năng kiểm duyệt"*, mà là **"hoàn tất đường ống media mà ba milestone đã ship đang phụ thuộc vào"**.

## Problem

Chọn một mô hình kiểm duyệt vừa (a) cấp cho `media.status` và `reviews.status` một chủ thể ghi hợp lệ, (b) phục vụ ba nguồn công việc thực sự khác nhau (báo cáo người dùng, nội dung mới, cờ AI) qua **một** hàng chờ, (c) **không** nhân bản trạng thái hiển thị vốn đã nằm trên từng thực thể, (d) không thêm hạ tầng mà repository chưa có, và (e) triển khai được theo từng milestone nhỏ mà không có quyết định Owner nào chặn milestone đầu tiên.

## Decision

### D1 — Hai bảng mới: `reports` và `moderation_cases`. Không gì khác.

**`reports`** — *khẳng định của một người dùng* rằng nội dung vi phạm. Mang `reporter_id`, `reason`, `description`.

**`moderation_cases`** — *một đơn vị công việc của moderator*. Mang trạng thái hàng chờ, người được giao, độ ưu tiên, và kết luận hiện hành.

Hai khái niệm này khác nhau và **không được gộp**:

- **Report** luôn có người báo cáo. Cờ AI và nội dung mới chưa ai duyệt thì **không có**. Ép chúng vào `reports` sẽ phải bịa ra dòng reporter giả — một lời nói dối nằm trong dữ liệu.
- **Case** phải gộp được. Quy tắc "nhiều report trên cùng một nội dung" đòi hỏi đếm N report cho 1 nội dung. Với một bảng, đó là `GROUP BY`; với bảng case, đó là `moderation_cases.report_count` — cũng chính là khóa sắp xếp hàng chờ.

### D2 — Trạng thái hiển thị nằm trên thực thể. Case tuyệt đối không nhân bản nó.

`media.status` và `reviews.status` là **nguồn sự thật duy nhất** cho việc nội dung có hiển thị công khai hay không (yêu cầu sửa đổi #1). `moderation_cases.status` **chỉ** mô tả *công việc*: có còn cần một quyết định của con người không?

Hai thứ trực giao; nhập nhằng giữa chúng là kiểu hỏng phổ biến nhất của thiết kế hàng chờ:

| | `media.status = 'hidden'` | `moderation_cases.status = 'resolved'` |
|---|---|---|
| Trả lời | "Công chúng có thấy được không?" | "Moderator còn nợ một quyết định không?" |
| Được đọc bởi | Mọi đường đọc công khai | Chỉ hàng chờ moderator |
| Sau một lần gỡ đúng | `hidden` | `resolved` |
| Sau khi bác một report vô căn cứ | `published` (đã khôi phục) | `resolved` |

Đây đúng là cách tách `verification_events` ↔ `places.verification_status` đã được phê duyệt tại [ADR-008](ADR-008-verification-model.md): bảng sự kiện/case ghi **quá trình**, cột trên thực thể ghi **kết quả**. Không phát minh mẫu mới.

### D3 — Media tự động published **chỉ** khi gắn thành công vào một review vừa được tạo (O2)

Đây là quyết định vận hành quan trọng nhất của bản sửa đổi này, và là điều biến §Context thành một tính năng chạy được.

**`POST /media` KHÔNG bao giờ tự publish.** Media đăng ký xong vẫn `pending`, đúng như hiện tại.

Việc chuyển `pending → published` xảy ra **bên trong chính transaction tạo review**, và chỉ khi **tất cả** điều kiện sau đồng thời đúng:

| # | Điều kiện | Cưỡng chế bằng |
|---|---|---|
| 1 | Upload đã được xác minh thành công | `media.object_key IS NOT NULL` — bất biến có thật: `createUploaded()` chỉ được `register()` gọi **sau khi** `verifyUploadedObject()` trả về `ok` |
| 2 | Người gọi chính là người upload gốc | `media.uploaded_by = :actorId` |
| 3 | Media đang mồ côi, chưa thuộc về ai | `review_id/place_id/post_id/business_id/event_id` đều `IS NULL` |
| 4 | Media đang `pending` | `media.status = 'pending'` |
| 5 | Media chưa bị xoá mềm | `media.deleted_at IS NULL` |
| 6 | Transaction tạo review **commit thành công** | Cùng transaction (xem D4) |

**Toàn bộ hoặc không có gì.** Nếu số dòng bị ảnh hưởng ≠ số `media_ids` được gửi (tối đa 10, theo `ArrayMaxSize(10)` đã có), transaction **rollback toàn bộ** và trả `422`. Không gắn một phần, không âm thầm bỏ qua ID sai — đúng tinh thần chỉ đạo *"require an explicit target state rather than silently guessing"*.

**Hệ quả trực tiếp:** media không bao giờ được gắn thì vĩnh viễn ở `pending` và cuối cùng bị `media:cleanup` dọn — hành vi hiện hành, không đổi. Media đã published theo đường này vẫn có thể bị `hide`/`reject` bởi kiểm duyệt về sau.

### D4 — Tạo review trở thành giao dịch nguyên tử

`ReviewsService.create()` hiện **không** có transaction (§Context). O2 yêu cầu *"the review creation transaction must succeed"* — nên transaction đó phải được tạo ra. Đây là **thay đổi hành vi có chủ đích** đối với mã đã ship, không phải hiệu ứng phụ:

```
BEGIN
  1. kiểm tra place tồn tại
  2. kiểm tra user chưa review place này
  3. INSERT reviews (status = 'published')          ← O1: giữ nguyên auto-publish
  4. nếu có media_ids:
       a. UPDATE media SET review_id, status='published'  (6 điều kiện D3)
       b. nếu affected_rows ≠ len(media_ids) → ROLLBACK + 422
  5. recalculateRating(place_id)                    ← D6, bắt buộc cùng transaction
COMMIT
→ sau commit: audit + domain event (không bao giờ trong transaction)
```

Nếu bất kỳ bước nào hỏng: **không** có review, **không** media nào đổi trạng thái, media giữ nguyên `pending` và mồ côi. Đây là câu trả lời trực tiếp cho *"whether all media remain pending when review creation fails"*: **có, toàn bộ.**

### D5 — Máy trạng thái đảo ngược được, dạng module thuần, có target rõ ràng

Hai module transition thuần, không phụ thuộc DB, theo đúng khuôn `booking-status.transition.ts`.

**Media** (dùng đủ 4 giá trị enum sẵn có, **không** đổi schema):

| Action | Từ | Đến | Quyền | `reason` | `target_status` |
|---|---|---|---|---|---|
| `approve` | `pending` | `published` | `Media.Moderate` | tuỳ chọn | — |
| `reject` | `pending` | `rejected` | `Media.Moderate` | **bắt buộc** | — |
| `hide` | `published` | `hidden` | `Media.Moderate` | **bắt buộc** | — |
| `restore` | `hidden` | `published` \| `pending` | `Media.Moderate` | tuỳ chọn | **bắt buộc** |
| `restore` | `rejected` | `published` \| `pending` | `Media.Moderate` | tuỳ chọn | **bắt buộc** |

`restore` **luôn** đòi `target_status` tường minh — không có ngoại lệ, không có giá trị mặc định (yêu cầu sửa đổi #2). Lý do: một media bị `rejected` được khôi phục có thể mang hai ý định hoàn toàn khác nhau — *"tôi sai, đăng nó lên"* (`published`) hoặc *"tôi sai, đưa lại vào hàng chờ để xét lại"* (`pending`). Đoán bất kỳ hướng nào cũng có xác suất sai 50%. Một quy tắc duy nhất, không trường hợp đặc biệt, dễ kiểm thử.

**`hidden` và `rejected` KHÔNG phải trạng thái cuối** — WF-07/13/18 đều đặc tả đường quay lui (*"quyết định sai → khôi phục"*); nếu là trạng thái cuối thì các workflow đó không triển khai được.

**Chuyển trạng thái không hợp lệ** (trả `422`), nêu tường minh vì đây là nơi dễ suy diễn sai nhất:

- `published → rejected` — **không hợp lệ.** `rejected` mang nghĩa *"bị từ chối ngay lần duyệt đầu, chưa từng công khai"*. Nội dung đã công khai thì phải `hide`.
- `hidden → rejected` — không hợp lệ, cùng lý do.
- `pending → hidden` — không hợp lệ; `pending` chưa công khai nên không có gì để ẩn (dùng `reject`).
- Mọi transition tới chính trạng thái hiện tại — không hợp lệ (`409` nếu case đã resolved, `422` nếu case còn mở).

**Review** (dùng đủ 3 giá trị enum sẵn có, **không** thêm `rejected`):

| Action | Từ | Đến | Quyền | `reason` | Recalc rating |
|---|---|---|---|---|---|
| `hide` | `published` | `hidden` | `Review.Moderate` | **bắt buộc** | **bắt buộc** |
| `restore` | `hidden` | `published` | `Review.Moderate` | tuỳ chọn | **bắt buộc** |
| `approve` | `pending` | `published` | `Review.Moderate` | tuỳ chọn | **bắt buộc** |

`approve` từ `pending` **không đến được qua API hiện tại** (O1 giữ auto-publish; `ReviewsRepository.create()` ghi thẳng `published`). Vẫn định nghĩa để bảo toàn tính đầy đủ dữ liệu cho dòng cũ/dòng chèn tay. Với review, `restore` chỉ có **một** đích hợp lệ là `published` — không có gì để đoán, nên `target_status` là tuỳ chọn; nếu gửi giá trị khác `published` thì trả `422` (đưa review về `pending` sẽ mâu thuẫn trực tiếp với O1).

**Không thêm giá trị nào vào `review_status`.** Một giá trị `rejected` sẽ không bao giờ tới được khi review vẫn auto-publish — và enum có giá trị chết là cách enum bắt đầu mục ruỗng.

### D6 — Mọi thay đổi `reviews.status` phải tính lại rating trong cùng transaction

`PlacesRepository.recalculateRating()` tổng hợp `WHERE status = 'published'`. Do đó **mọi** lần `hide`/`restore`/`approve` một review **bắt buộc** gọi nó trong **cùng** transaction với lệnh ghi status (yêu cầu sửa đổi #4).

Bỏ sót sẽ để `places.rating_avg`/`rating_count` tiếp tục tính cả những review không ai đọc được — một lỗi toàn vẹn dữ liệu **không có triệu chứng nhìn thấy** cho tới khi có người kiểm tra lại số học. Đây là ràng buộc cứng của thiết kế, không phải tối ưu hoá.

Kiểm duyệt media **không** có ràng buộc tương ứng.

### D7 — Report tạo/nâng công việc, **không** đổi hiển thị (O3)

Report **không bao giờ** tự thay đổi trạng thái hiển thị trong nền tảng này (yêu cầu sửa đổi #5). Chúng chỉ:

1. Tạo một case mới (nếu chưa có case mở cho target đó), hoặc gắn vào case mở sẵn có;
2. Tăng `report_count`;
3. Nâng `severity` và `priority` → đẩy case lên cao trong hàng chờ.

Ngưỡng **≥ 3 report hợp lệ** nâng `severity` lên tối thiểu `high`. Không có `auto_hide`, không có cột nào cho nó, và không có nhánh mã nào có thể bật nó — sự vắng mặt này là *có chủ đích* và được ghi lại như một bất biến (INV-6), để một milestone sau không vô tình "khôi phục" nó như thể đó là thiếu sót.

### D8 — Một case mở duy nhất cho mỗi target, cưỡng chế ở tầng CSDL

    CREATE UNIQUE INDEX uq_moderation_cases_open_target
      ON moderation_cases (target_type, target_id)
      WHERE status IN ('open', 'claimed');

Partial unique index — đúng cơ chế `idx_places_status_active` đã dùng (PLACE-003, đã được diễn tập revert/reapply ở PLACE-042). Việc gộp report và chống trùng hàng chờ trở thành **bất khả thi về mặt cấu trúc**, thay vì một quy ước ở tầng service; đồng thời cho các reporter đồng thời một xung đột xác định để xử lý.

### D9 — Đa hình cho target, theo đúng ngoại lệ ADR-016

Cả hai bảng trỏ tới nội dung bằng `target_type` + `target_id`, **không FK cứng, không cascade**; chỉ FK mềm trên cột tác nhân (`reporter_id`, `assigned_to`, `resolved_by` → `users`).

[ADR-003](ADR-003-no-polymorphic.md) cấm đa hình *theo mặc định* và [ADR-009](ADR-009-media-model.md) chọn exclusive arc cho `media` chính vì cần giữ FK. Lập luận đó **không** chuyển sang được ở đây, đúng những lý do ADR-016 đã chấp nhận cho `audit_logs`:

- Kiểm duyệt phải trỏ tới **mọi** loại nội dung (`review`, `media`, `place`, sau này `comment`, `post`, `user`). Exclusive arc sẽ cần thêm một cột FK nullable **và** sửa `CHECK` cho mỗi loại mới — chính cái giá mà ADR-009 tự ghi nhận, trong khi kiểm duyệt có nhiều loại target hơn hẳn media có loại chủ sở hữu.
- Case **phải sống sót khi target bị xoá**. Cascade sẽ xoá bằng chứng của một lần gỡ nội dung đúng vào lúc việc gỡ thành công — phá huỷ chính chuỗi audit mà case sinh ra để phục vụ.

`media` giữ nguyên exclusive arc (quyết định đó nói về **quyền sở hữu**, cần toàn vẹn). Kiểm duyệt dùng tham chiếu lỏng (nói về **quá trình**, cần trường tồn). Cả hai vẫn đúng.

### D10 — Không thêm role. Sáu quyền mới, cấp cho `moderator` sẵn có

| Quyền | Cấp cho | Mục đích |
|---|---|---|
| `Report.Create` | `member` | WF-12 — gửi báo cáo |
| `Moderation.Queue.View` | `moderator` | Đọc hàng chờ |
| `Media.Moderate` | `moderator` | WF-07/18 — quyết định media (tên đã được WF-07 và `/media/{id}/moderate` dùng sẵn) |
| `Review.Moderate` | `moderator` | Quyết định review (đối xứng `Media.Moderate`; chọn thay cho `Review.Hide` của WF-13 vì một quyền bao cả hide lẫn restore mới khớp FSM đảo ngược được — quyền chỉ-`Hide` không diễn đạt được việc khôi phục) |
| `Report.Resolve` | `moderator` | WF-13 — đóng case |
| `AI.ModerateMedia` | `ai_agent` | WF-18 — **chỉ** gắn cờ |

Scope dùng **`Any`** (O6). **Không** thiết kế scope `Managed` cho tới khi Business Claims/`business_members` ([ADR-015](ADR-015-business-ownership-model.md)) thực sự được migrate — hiện chúng Accepted trên giấy nhưng **chưa từng migrate**, nên `Managed` sẽ không có gì để phân giải.

`administrator`/`super_administrator` **kế thừa** qua DAG `role_parents` sẵn có; **không** seed tường minh cho hai role này (làm vậy tạo nguồn sự thật thứ hai cho thứ PDP đã tự tính).

Then chốt: `ai_agent` nhận `AI.ModerateMedia` và **không** nhận `Media.Moderate`. Ràng buộc *"AI không tự duyệt"* (WF-09) và *"AI không xoá cứng"* (WF-18) do đó được cưỡng chế bởi **chính mô hình phân quyền**, không phải bởi một câu `if` ở tầng service.

### D11 — Tái dùng `AuditService`. Không có bảng `moderation_decisions`

Dòng case giữ kết luận **hiện hành** (`status`, `decision`, `reason`, `resolved_by`, `resolved_at`). **Lịch sử** bất biến — kể cả các lần đảo ngược và mở lại — là `audit_logs`, nơi ADR-016 đã chỉ định sẵn cho đúng các mã sự kiện này. Giống hệt `bookings` (status hiện hành trên dòng, các lần chuyển trong audit log), và tránh được bảng thứ ba.

Mã phát ra, tất cả đều đã được WF-07/12/13/18 đặt tên: `report.created`, `moderation.decided`, `moderation.report_resolved`, `ai.media_checked`, cộng thêm `media.auto_published` cho đường D3.

### D12 — Chỉ trừu tượng hoá sự kiện. Không broker, không scheduler, không notification

Một DI token `MODERATION_EVENT_PUBLISHER` với implementation mặc định chỉ ghi log, sao chép nguyên hình dạng `BOOKING_EVENT_PUBLISHER`.

**Notification nằm ngoài phạm vi (O5).** Bảng `notifications` chưa được phê duyệt trong `database.md §11` và thư mục module rỗng. Mọi dòng "Notification:" của WF-07/11/12/13/18 trở thành một domain event được ghi log và **không gì hơn**. Đây là khoảng trống chức năng được **công bố**, không phải bị âm thầm bỏ qua: **người dùng bị ẩn nội dung sẽ không được thông báo.** Đóng khoảng trống này cần ADR `notifications` riêng.

Kiểm duyệt AI (WF-18) chạy như **runner thủ công** (`npm run media:moderate`), theo tiền lệ `media:cleanup`, vì không có scheduler. Kiểm duyệt AI thời gian thực khi upload được hoãn.

### D13 — Chế tài người dùng nằm ngoài phạm vi (O4)

WF-13 đặc tả chế tài leo thang. `users` chỉ có `is_active`. Thiết kế mô hình chế tài đồng nghĩa với thiết kế tích luỹ vi phạm, hết hạn, khiếu nại, và chống lách — một miền ít nhất cũng lớn bằng miền này. Moderation Foundation gỡ **nội dung**; nó không kỷ luật **con người**.

### D14 — Backfill media cũ: chỉ media đã gắn review, đưa vào hàng chờ, không publish (O7)

Media tạo **trước** M3 không được D3 phủ (D3 chỉ áp cho review **vừa được tạo**). O7 chốt cách xử lý.

**Tập điều kiện (phải đúng đồng thời):**

```sql
media.status      = 'pending'
AND media.review_id IS NOT NULL      -- CHỈ media đã gắn review
AND media.deleted_at IS NULL
AND NOT EXISTS (case đang mở cho media này)
```

**Hành động:** mỗi dòng thoả điều kiện → **một** `moderation_cases` với `source = 'new_content'`, `status = 'open'`, `severity = 'normal'` (⇒ `priority = 10`). **Tuyệt đối không** ghi vào `media.status`.

**Vì sao `review_id IS NOT NULL` là ranh giới đúng.** Media mồ côi (`review_id IS NULL`) **không** được backfill, và đó là chủ đích: chúng đã có một chủ thể xử lý — `media:cleanup` dọn media mồ côi quá 24 giờ. Đưa chúng vào hàng chờ sẽ bắt moderator quyết định về những tệp mà hệ thống vốn đã tự dọn, tức là tạo ra công việc rác. Media đã gắn review thì ngược lại: chúng thuộc về một review thật, người dùng thật đã chủ ý đính kèm, và hiện **không ai nhìn thấy được** — đúng đối tượng cần một quyết định của con người.

**Vì sao `source = 'new_content'` chứ không phải một giá trị enum mới.** Owner nêu `new_content` / `migration_backfill` "theo schema đã chấp thuận"; schema đã chấp thuận có `new_content` và **không** có `migration_backfill`. Chọn `new_content` vì:

1. `source` trả lời *"vì sao case này tồn tại"* (nội dung chưa từng được kiểm duyệt) — chứ không phải *"cơ chế nào đã tạo ra dòng này"*. Cơ chế thuộc về audit.
2. Đây **đúng là** nội dung mới chưa từng qua kiểm duyệt; ngữ nghĩa trùng khít.
3. Một giá trị enum chỉ dùng được **đúng một lần** (một migration chạy một lần) sẽ vĩnh viễn là giá trị chết sau đó — chính lập luận đã dùng để từ chối thêm `rejected` vào `review_status` (D5). Không tự mâu thuẫn.

**Vì sao `severity = 'normal'` chứ không phải `low`.** Quy tắc mặc định (thiết kế §4.1) gán `new_content` → `low`. Backfill là **ngoại lệ tường minh** theo chỉ đạo O7: đây là ảnh thật, gắn với review thật, hiện đang vô hình với mọi người — cấp thiết hơn hẳn một tệp mồ côi. `normal` ⇒ `priority = 10`, xếp trên nền `low` nhưng dưới mọi case do report/AI sinh ra.

**Tính idempotent** đến từ chính partial unique index D8, không phải từ một cờ riêng: `INSERT ... ON CONFLICT DO NOTHING`. Chạy migration hai lần cho kết quả y hệt chạy một lần, và điều kiện thứ tư ("chưa có case mở") **chính là** ràng buộc mà index cưỡng chế — nên bất biến INV-3 được bảo toàn theo cấu trúc, không phải theo quy ước.

**Ghi nhận:** migration ghi **một** dòng audit tổng hợp (`moderation.backfilled`, `entity_type='media'`, `context = { candidate_count, created_count }`) qua `queryRunner` — đủ để truy vết nguồn gốc mà không cần thêm giá trị enum. Số lượng ứng viên phải được **đếm và báo cáo trước khi chạy** (MR-1), không phải sau.

**Hệ quả cần biết:** sau khi backfill chạy, `new_content` **không còn nguồn sinh tự nhiên nào** trong thiết kế hiện tại — media mồ côi mới không tạo case (được `media:cleanup` dọn), còn media mới gắn review thì tự publish qua D3. Đây là kết quả **đúng như thiết kế**, không phải thiếu sót; giá trị enum vẫn được giữ vì một loại nội dung tương lai có thể sinh ra nội dung chưa kiểm duyệt.

## Alternatives Considered

- **A — Suy ra hàng chờ bằng `UNION` trên `media`/`reviews`/`reports`; không có bảng `moderation_cases`.** Không có rủi ro lệch dữ liệu, vì status trên từng thực thể là sự thật duy nhất. → **Loại:** không diễn đạt được việc giao việc, độ ưu tiên, "claim" chống làm trùng, hay gộp report mà không phải bịa thêm cột lên **mọi** bảng nội dung — và phải viết lại cho mỗi loại nội dung mới. `UNION` N nhánh cũng đúng là anti-pattern mà ADR-016 đã loại (Alternative C) khi chọn một `audit_logs` thống nhất.
- **B — Một bảng: mở rộng `reports` bằng các cột hàng chờ.** Đơn giản nhất. → **Loại:** phải bịa reporter cho nội dung do AI gắn cờ và nội dung mới; "3 report trên 1 review" thành 3 mục hàng chờ.
- **C — Sao chép trạng thái hiển thị lên case (`moderation_cases.content_status`).** Tiện render hàng chờ. → **Loại:** hai nguồn ghi cho cùng một sự thật, chắc chắn lệch, và các đường đọc công khai sẽ phải chọn tin cái nào. Mâu thuẫn trực tiếp yêu cầu sửa đổi #1.
- **D — Exclusive arc (một FK nullable cho mỗi loại nội dung), theo ADR-009.** FK thật, toàn vẹn thật. → **Loại** vì cascade (D9): case phải sống lâu hơn target. `ON DELETE SET NULL` giữ được dòng nhưng mất **thông tin nội dung nào đã bị xử lý** — triệt tiêu mục đích tồn tại của nó.
- **E — Thêm `rejected` vào `review_status` cho đối xứng với `media_status`.** → **Loại:** không tới được khi review auto-publish (O1).
- **F — Auto-hide theo ngưỡng số report** (bản đầu đề xuất ngưỡng 3). → **Loại theo O3.** Cho phép một nhóm nhỏ phối hợp bóp nghẹt nội dung hợp lệ, và làm việc gỡ nội dung xảy ra **không có** một con người nào chịu trách nhiệm — trong khi toàn bộ phần còn lại của thiết kế đều buộc phải có. Report nâng độ ưu tiên, không đổi hiển thị.
- **G — Auto-publish media ngay sau `POST /media`.** Đơn giản hơn D3 nhiều. → **Loại theo O2:** sẽ công khai media chưa từng gắn với ngữ cảnh nào, biến endpoint upload thành một kênh xuất bản mở cho bất kỳ `member` nào. Gắn việc publish vào chính hành vi tạo review giữ cho mỗi ảnh công khai luôn có một nội dung mẹ quy trách nhiệm được.
- **I — Backfill publish hàng loạt media cũ đã gắn review** (chúng đã qua xác minh upload và đã gắn với review thật). → **Loại theo O7:** sẽ công khai hàng loạt nội dung **chưa từng** qua bất kỳ khâu kiểm duyệt nào, bằng một migration, không một con người nào xem qua — đúng kiểu quyết định âm thầm mà O2 và O3 đang loại bỏ. Đưa vào hàng chờ chậm hơn nhưng mỗi ảnh công khai đều có một người chịu trách nhiệm.
- **J — Backfill cả media mồ côi** (`review_id IS NULL`) cho "đầy đủ". → **Loại theo O7:** media mồ côi đã có chủ thể xử lý là `media:cleanup` (dọn sau 24 giờ). Backfill chúng sẽ bắt moderator ra quyết định về những tệp mà hệ thống vốn tự dọn — sinh công việc rác và làm ngập hàng chờ ngay ngày đầu.
- **K — Thêm giá trị enum `migration_backfill` vào `moderation_case_source`.** Phân biệt được case backfill với case tự nhiên. → **Loại:** `source` mô tả *vì sao case tồn tại*, không phải *cơ chế tạo dòng*; và một giá trị chỉ dùng được đúng một lần sẽ vĩnh viễn chết sau đó — cùng lập luận đã dùng để từ chối `rejected` trong `review_status` (D5). Truy vết nguồn gốc dùng một dòng audit `moderation.backfilled` (D14).
- **H — Triển khai notification cùng lúc, để người bị gỡ nội dung biết.** Thực sự đáng làm và là khoảng trống chức năng lớn nhất mà ADR này để lại. → **Loại theo O5:** `notifications` là thực thể chưa phê duyệt, cần ADR riêng (kênh, tuỳ chọn, thiết bị, digest, huỷ đăng ký). Gộp vào sẽ gần như nhân đôi milestone và trói hai quyết định phê duyệt độc lập vào nhau.

## Consequences

### Positive

- **Ảnh đã upload lần đầu tiên hiển thị được** — đóng lỗ hổng đang âm thầm vô hiệu hoá một phần của ba milestone đã ship.
- `media.ai_moderation_score`/`ai_labels` (ngủ đông từ ADR-009) có chủ thể ghi như thiết kế ban đầu.
- WF-07/12/13/18 trở nên triển khai được; các mã sự kiện kiểm duyệt của ADR-016 có nơi phát.
- `reports` chuyển từ "được tham chiếu nhưng chưa phê duyệt" sang đã thiết kế.
- `ReviewsService.create()` trở thành nguyên tử — sửa một lỗ hổng có sẵn (D4) mà O2 buộc phải chạm tới.
- Không role mới, không hạ tầng mới, không dependency mới; tái dùng nguyên vẹn 4 mẫu đã có (module FSM, DI token event, audit service, partial unique index).
- Thêm loại nội dung kiểm duyệt mới về sau tốn đúng một giá trị `target_type` và một FSM.

### Negative / đánh đổi

- **Hai bảng đa hình**, không toàn vẹn tham chiếu trên `target_id`; đúng đắn do tầng ứng dụng giữ. Cùng nhóm nợ với `audit_logs`/`source_attributions`/`wiki_revisions` — không sinh ra **loại** nợ mới, nhưng làm tăng lượng nợ hiện có.
- **Người dùng không được thông báo khi nội dung bị xử lý** (D12). Là khiếm khuyết sản phẩm thật, tồn tại đến khi notification được xây.
- **Media đã gắn vào review có sẵn trước khi M3 ship** không được D3 phủ — chúng được đưa vào hàng chờ bằng backfill D14 (O7), **không** được publish hàng loạt, nên vẫn vô hình cho tới khi có moderator xử lý từng case. Đây là đánh đổi có chủ đích: đúng đắn hơn nhanh chóng.
- `reviews.status` giờ luôn đi kèm một lần tính lại rating (D6) — một ràng buộc phải được **kiểm thử**, không được giả định.
- **Kiểm duyệt trở thành phụ thuộc nhân sự.** O2 làm dịu đáng kể rủi ro này (ảnh hiện ngay khi gắn vào review, không chờ ai duyệt), nhưng hàng chờ vẫn cần người xử lý các case do report/AI sinh ra.
- Role `moderator` hiện **chưa gán cho người nào**. RBAC hỗ trợ; câu hỏi vận hành thì chưa có lời đáp.

## Quyết định & Ràng buộc

*(Mục này đáp ứng yêu cầu sửa đổi #9 — nguồn tra cứu chốt cho phạm vi và ràng buộc.)*

### 1. Quyết định đã được Owner phê duyệt

| # | Quyết định | Nội dung chốt |
|---|---|---|
| **O1** | Hiển thị review | **Giữ auto-publish.** Không đưa review mới vào hàng chờ tiền kiểm duyệt. Review chỉ vào kiểm duyệt khi bị **report**, bị **AI gắn cờ**, hoặc được **mở case thủ công**. |
| **O2** | Hiển thị media | **Chỉ auto-publish khi media mồ côi được gắn thành công vào một review VỪA ĐƯỢC TẠO** — kèm 6 điều kiện D3. **Không** auto-publish sau `POST /media`. Media chưa gắn giữ `pending`. Media đã published vẫn có thể bị hide/reject sau. |
| **O3** | Ngưỡng report | **Không auto-hide theo số report** trong nền tảng đầu tiên. ≥3 report hợp lệ chỉ nâng `priority`/`severity`/vị trí hàng chờ. Số report **không** đổi hiển thị công khai. |
| **O4** | Chế tài người dùng | **Hoãn.** |
| **O5** | Thông báo người dùng | **Hoãn.** |
| **O6** | Scope `Media.Moderate` | Dùng **`Any`**. Không thiết kế kiểm duyệt `Managed` cho tới khi Business Claims + business membership hoạt động thật. |
| **O7** | Backfill media cũ đã gắn review | **Chỉ** backfill media thoả **đồng thời**: `status='pending'` **AND** `review_id IS NOT NULL` **AND** `deleted_at IS NULL` **AND** chưa có case mở. Mỗi dòng → **một** `moderation_cases` với `source='new_content'`, `status='open'`, `severity='normal'`. **Không** đổi `media.status`. **Không** publish hàng loạt. Backfill **idempotent**. Giữ nguyên bất biến một-case-mở-mỗi-target. Xem D14. |

Ngoài ra, các quyết định đã có hiệu lực từ ADR/mã nguồn trước, được **nhắc lại chứ không mở lại**: enum status của media/review (ADR-009 + mã đã ship); audit append-only/đa hình/không cascade/có redact (ADR-016); RBAC hướng dữ liệu, `Any ⊃ Managed ⊃ Own`, deny thắng (ADR-007); AI không tự duyệt và không xoá cứng (WF-09/18); reject bắt buộc có lý do (WF-07); tên route `/reviews/{id}/report` và `/media/{id}/moderate` (`openapi.yaml`); không ai được kiểm duyệt nội dung của chính mình (WF-07/13).

### 2. Quyết định đã hoãn

| Hạng mục | Lý do hoãn | Cần gì để mở lại |
|---|---|---|
| Chế tài người dùng (warn/mute/ban) — **O4** | `users` chỉ có `is_active`; miền lớn ngang miền này | ADR riêng |
| Thông báo người dùng — **O5** | `notifications` chưa phê duyệt, module rỗng | ADR riêng |
| Scope `Managed` cho kiểm duyệt — **O6** | ADR-015 Accepted nhưng **chưa migrate**, `Managed` không có gì để phân giải | Migrate `business_claims`/`business_members` |
| Auto-hide theo ngưỡng report — **O3** | Rủi ro brigading; gỡ nội dung không có người chịu trách nhiệm | Quyết định Owner mới + dữ liệu vận hành thật |
| Tiền kiểm duyệt review — **O1** | Hàng chờ chưa có người xử lý | Có nhân sự moderator + quyết định Owner mới (kèm thêm `rejected` vào `review_status`) |
| Kiểm duyệt AI thời gian thực | Không có scheduler/queue trong repo | Dữ liệu shadow mode (M7) + quyết định hạ tầng |
| Quy trình khiếu nại | WF-13 nhắc *"đường khiếu nại"* nhưng không có thiết kế nào đứng sau | Thiết kế riêng |
| Chính sách lưu giữ `moderation_cases` | `audit_logs` đã có, `moderation_cases` thì chưa | Quyết định vận hành |

### 3. Bất biến triển khai (Implementation Invariants)

Đây là các ràng buộc **không được vi phạm** ở bất kỳ milestone nào. Vi phạm bất kỳ dòng nào dưới đây là lỗi thiết kế, không phải lựa chọn triển khai.

| # | Bất biến |
|---|---|
| **INV-1** | `media.status` và `reviews.status` là nguồn sự thật **duy nhất** cho hiển thị công khai. **Không** đường đọc công khai nào được join `moderation_cases`. |
| **INV-2** | `moderation_cases` **không bao giờ** lưu trạng thái hiển thị của nội dung. |
| **INV-3** | Tối đa **một** case `open`/`claimed` cho mỗi `(target_type, target_id)` — cưỡng chế bằng partial unique index, **không** bằng logic ứng dụng. |
| **INV-4** | **Mọi** thay đổi `reviews.status` làm đổi tập `published` phải gọi `recalculateRating()` trong **cùng** transaction. |
| **INV-5** | Media chỉ auto-publish **bên trong** transaction tạo review, và chỉ khi đủ **cả 6** điều kiện D3. |
| **INV-6** | `report_count` **không bao giờ** làm đổi trạng thái hiển thị (O3). Không có cột, cờ, hay nhánh mã nào cho auto-hide. |
| **INV-7** | AI **không bao giờ** resolve case và **không bao giờ** xoá cứng — cưỡng chế bằng việc **không cấp** `Media.Moderate` cho `ai_agent`, không phải bằng câu `if`. |
| **INV-8** | Kiểm duyệt **không bao giờ** xoá cứng nội dung; chỉ đổi `status`. Xoá object vẫn thuộc đường `media:cleanup` riêng. |
| **INV-9** | Audit và domain event ghi **sau** commit; việc chúng lỗi **không bao giờ** làm rollback một quyết định kiểm duyệt. |
| **INV-10** | `restore` **luôn** đòi `target_status` tường minh với media; không đoán, không mặc định. |
| **INV-11** | `reject` và `hide` **luôn** đòi `reason` khác rỗng. |
| **INV-12** | Moderator **không** được quyết định case trên nội dung do chính mình tạo. |
| **INV-13** | `published → rejected` và `hidden → rejected` **luôn** không hợp lệ. |
| **INV-14** | Gắn media là **toàn bộ-hoặc-không-gì**: `affected_rows` phải bằng số ID được gửi, nếu không thì rollback. |
| **INV-15** | Media chưa gắn vào review nào **luôn** giữ `pending`. |

### 4. Ngoài phạm vi (Out of Scope)

Được nêu tên tường minh để một milestone sau **không** hiểu nhầm là thiếu sót:

- Chế tài người dùng: warn, mute, ban, đếm vi phạm, hết hạn, lách luật (O4).
- Thông báo dưới mọi hình thức: in-app, email, push, digest (O5).
- Scope `Managed`/kiểm duyệt theo quyền sở hữu doanh nghiệp (O6).
- Auto-hide theo ngưỡng report (O3).
- Tiền kiểm duyệt review (O1).
- Quy trình khiếu nại và kháng nghị.
- Kiểm duyệt AI thời gian thực; mọi hình thức AI tự ra quyết định.
- Kiểm duyệt `contributions`, `community posts`, `comments` — các miền đó chưa tồn tại.
- Kiểm duyệt `place`/`user` như target — enum đã dự trù `place` nhưng M1–M7 **không** triển khai FSM cho nó.
- Chỉ số hiệu suất/năng suất moderator.
- Chính sách lưu giữ và lưu trữ lạnh cho `moderation_cases`.
- Xoá cứng nội dung dưới mọi hình thức.

### 5. Rủi ro tương thích khi migration

| # | Rủi ro | Giảm thiểu |
|---|---|---|
| **MR-1** | `BackfillModerationCases` có thể đổ một lượng lớn media `pending` vào hàng chờ ngay ngày đầu | **Đếm và báo cáo `SELECT count(*) FROM media WHERE status='pending'` TRƯỚC khi chạy, không phải sau.** Sắp xếp theo `priority` giữ việc gấp lên trên bất kể độ sâu. |
| **MR-2** | Media đã gắn vào review **có sẵn** (tạo trước M3) không được D3 phủ | **Đã giải quyết bằng D14/O7**: backfill tạo case `open`/`normal` cho đúng tập `status='pending' AND review_id IS NOT NULL AND deleted_at IS NULL`. Media **mồ côi** cố ý **không** backfill (đã có `media:cleanup` xử lý). Lượng nhiều khả năng rất nhỏ (Image Upload UI ship 2026-08-01), nhưng phải **đếm chứ không đoán** (MR-1). |
| **MR-3** | Nếu O1 đảo chiều về sau, thêm `rejected` vào `review_status` cần `ALTER TYPE ... ADD VALUE` — PostgreSQL **không** cho dùng giá trị mới trong cùng transaction đã thêm nó | Tách thành migration riêng, chạy độc lập trước migration dùng tới giá trị đó |
| **MR-4** | Thêm loại target mới cần DDL trên enum `moderation_target_type` | **Có chủ đích** (xem thiết kế): target chưa đăng ký FSM là một lỗi, và enum bắt lỗi đó ngay lúc INSERT |
| **MR-5** | `down()` xoá bảng sẽ huỷ lịch sử quyết định | `down()` **phải từ chối** (throw) nếu tồn tại case đã `resolved` — đúng tiền lệ tự bảo vệ của `AddMediaUploadFoundation` |
| **MR-6** | Backfill có thể tạo case trùng nếu chạy hai lần | `INSERT ... ON CONFLICT DO NOTHING` dựa trên chính partial unique index D8 → backfill idempotent |
| **MR-7** | D4 biến việc tạo review thành nguyên tử — **thay đổi hành vi** trên mã đã ship | Race tạo review trùng trước đây có thể lọt sẽ bị chặn bởi transaction + unique constraint. Là **sửa lỗi**, nhưng vẫn là thay đổi hành vi và phải được ghi vào báo cáo milestone, không được lặng lẽ |
| **MR-8** | Ba migration phải chạy đúng thứ tự (`InitModeration` → `SeedModerationPermissions` → `BackfillModerationCases`) | Dãy timestamp `1720003200000+` cưỡng chế thứ tự; backfill phụ thuộc bảng do migration đầu tạo |

### 6. Giới hạn của rollback

| # | Giới hạn |
|---|---|
| **RL-1** | Media đã auto-published qua đường D3 **giữ nguyên `published`** nếu tính năng bị rollback về sau — rollback mã **không** hoàn nguyên trạng thái dữ liệu. Muốn thu hồi phải chạy một thao tác dữ liệu riêng, có chủ đích. |
| **RL-2** | Sau quyết định đầu tiên, rollback schema là **một chiều**: `down()` từ chối khi có case `resolved` (MR-5). Đây là lựa chọn có chủ đích — mất lịch sử quyết định tệ hơn là kẹt schema. |
| **RL-3** | Dòng `audit_logs` **không bao giờ** được rollback (append-only, ADR-016). Audit của một quyết định đã bị đảo ngược vẫn tồn tại vĩnh viễn — đúng như thiết kế. |
| **RL-4** | Rollback M3 sau khi đã backfill để lại các dòng `moderation_cases` mồ côi — vô hại (không đường đọc công khai nào chạm tới) nhưng **không** tự dọn. |
| **RL-5** | Một quyết định kiểm duyệt sai **đảo ngược được về mặt vận hành** (`reopen` + quyết định lại), nhưng **không** đảo ngược được việc nội dung đã từng hiển thị: thứ đã công khai là đã công khai. |
| **RL-6** | `ReviewsService.create()` sau D4 là nguyên tử; **quay lại** bản không-transaction sẽ khôi phục lỗ hổng có sẵn. Rollback M3/M4 phải giữ lại transaction, chỉ gỡ phần auto-publish. |

### 7. Quyết định còn mở (cần Owner)

**Không còn quyết định nào.**

O1–O7 đã chốt toàn bộ (mục 1). Mọi hạng mục còn lại đều đã được phân loại tường minh thành **đã hoãn** (mục 2, kèm điều kiện mở lại) hoặc **ngoài phạm vi** (mục 4) — không hạng mục nào chặn M1–M7.

Rà soát lần cuối xác nhận không còn câu hỏi treo: quyết định vận hành duy nhất trước đây (**O7**) nay đã chốt và trở thành **D14**; các khoảng trống đã biết còn lại (thông báo cho người dùng — O5; chế tài — O4; scope `Managed` — O6) đều là **hoãn có chủ đích kèm điều kiện mở lại rõ ràng**, không phải câu hỏi chưa trả lời.

## Migration

**Chưa thực hiện** (chỉ kiến trúc). Khi được phê duyệt, ba migration theo đúng quy ước đặt tên và dãy timestamp `1720003200000+`:

| Migration | Nội dung |
|---|---|
| `InitModeration` | Các enum `report_reason`, `report_status`, `moderation_case_status`, `moderation_case_source`, `moderation_case_severity`, `moderation_decision`, `moderation_target_type`; hai bảng `reports`, `moderation_cases`; các index kể cả partial unique index D8 |
| `SeedModerationPermissions` | Sáu quyền D10, `ON CONFLICT DO NOTHING`; cấp cho `member`, `moderator`, `ai_agent` |
| `BackfillModerationCases` | **D14/O7** — một case `open`, `source='new_content'`, `severity='normal'` cho mỗi `media` thoả `status='pending' AND review_id IS NOT NULL AND deleted_at IS NULL`; `ON CONFLICT DO NOTHING` trên partial unique index D8 (idempotent, giữ INV-3); **không** ghi `media.status`; một dòng audit `moderation.backfilled` kèm `candidate_count`/`created_count` |

Cả ba đều cộng thêm (additive) và đảo ngược được; `down()` chỉ xoá đúng những gì `up()` tạo, **trừ** ràng buộc tự bảo vệ MR-5. Theo tiền lệ PLACE-042, phải chạy diễn tập revert → verify → reapply trên database dev thật trước khi coi là hoàn tất.

`BackfillModerationCases.down()` chỉ được xoá **đúng** các case do chính nó tạo — nhận diện bằng `source='new_content' AND status='open' AND report_count=0`; case đã `resolved` chặn revert theo MR-5. Đếm ứng viên (`SELECT count(*)`) và báo cáo **trước** khi chạy `up()`, không phải sau (MR-1).

## Related Documents

- [moderation-design.md](../data/modules/moderation-design.md) — tài liệu thiết kế đồng hành: schema đầy đủ, máy trạng thái, sequence diagram, ranh giới transaction, đặc tả API, phân tích rủi ro, lộ trình M1–M7
- [moderation.md](../workflow/moderation.md) — WF-07/09/11/12/13/18, nguồn chuẩn về hành vi
- [database.md §11](../data/database.md) — `reports` hiện xếp nhóm chưa phê duyệt
- [openapi.yaml](../api/openapi.yaml) — stub `/reviews/{id}/report`, `/media/{id}/moderate` đã có
- [rbac.md](../security/rbac.md) — quy ước đặt tên quyền và scope

## Related ADR

- [ADR-003](ADR-003-no-polymorphic.md) — mặc định mà ADR này lấy ngoại lệ có ghi chép
- [ADR-007](ADR-007-rbac-model.md) — mô hình role/permission tái dùng nguyên trạng
- [ADR-008](ADR-008-verification-model.md) — mẫu tách bảng-quá-trình ↔ cột-kết-quả, tái dùng ở D2
- [ADR-009](ADR-009-media-model.md) — `media.status` và các cột AI mà ADR này lần đầu ghi vào
- [ADR-015](ADR-015-business-ownership-model.md) — Accepted nhưng chưa migrate; là lý do O6 chọn `Any`
- [ADR-016](ADR-016-audit-log-model.md) — audit tái dùng toàn bộ; nguồn của ngoại lệ đa hình D9

## Notes

- Đề xuất 2026-08-02 trong phiên chỉ-kiến-trúc. **Không** một artifact triển khai nào được tạo (không code, không migration, không entity, không file React, không test).
- Bản sửa đổi 1 (cùng ngày) áp dụng O1–O6 và 10 yêu cầu sửa đổi của Owner; dịch sang tiếng Việt cho khớp ADR-001…017. Owner chốt **O7** ngay sau đó → ADR chuyển **Accepted** cùng ngày.
- Phát hiện "media không hiển thị được" ở §Context được kiểm chứng **trực tiếp trong mã nguồn** trong phiên này, không suy ra từ tài liệu.
- **Không còn quyết định Owner nào chưa giải quyết.** Các hạng mục đã hoãn (mục 2) và ngoài phạm vi (mục 4) là lựa chọn có chủ đích kèm điều kiện mở lại, không phải câu hỏi treo.
- Điều kiện để ADR này cần được xem lại: (1) `notifications` được phê duyệt → mở lại O5 và §D12; (2) `business_claims`/`business_members` được migrate → mở lại O6; (3) có nhân sự moderator ổn định → mở lại O1/O3; (4) dữ liệu shadow mode M7 đủ để đặt ngưỡng AI → mở giai đoạn Assist.

## Addendum — M7 (AI Shadow Mode), 2026-08-04

**Không supersede, không mở lại quyết định nào ở trên.** Ghi lại MỘT tinh chỉnh triển khai phát
sinh khi M7 thực sự được xây (D1/§13 gốc chỉ là phác thảo kiến trúc chưa triển khai — §Notes dòng
1 xác nhận ADR gốc "không một artifact triển khai nào được tạo").

**Tinh chỉnh:** thay vì Shadow ghi điểm/label thẳng vào `media.ai_moderation_score`/`ai_labels`
(phác thảo gốc, moderation-design.md §13 bản đầu), M7 triển khai thêm **một bảng mới**,
`ai_recommendations`, migration `AddAiRecommendations` (1720003500000).

**Vì sao đây là một điều chỉnh cần ghi nhận, không phải một lựa chọn triển khai tự do:** D1 phát
biểu "Hai bảng mới: `reports` và `moderation_cases`. **Không gì khác.**" — một khẳng định mạnh về
phạm vi schema. `ai_recommendations` là bảng THỨ BA, nên addendum này tồn tại để khẳng định tường
minh: ranh giới đó áp cho phạm vi M1–M6 (nền tảng report/case), và không được đọc là cấm vĩnh viễn
mọi bảng mới ở M7 — bảng thứ ba này giải quyết một nhu cầu mà cột đơn `media.ai_moderation_score`
không thể đáp ứng, không phải một lựa chọn thay thế ngang hàng bị bỏ qua.

**Lý do cụ thể (tại sao cột đơn trên `media` không đủ):**

1. **Một cột chỉ giữ được MỘT giá trị.** M7 spec yêu cầu so sánh gợi ý AI với quyết định moderator
   VÀ giữ lại `matched`/`moderator_decision`/`evaluated_at` cho từng lần chạy — `media` chỉ có
   đúng 1 slot `ai_moderation_score`/`ai_labels`, lần chạy AI thứ hai (re-run, đổi model/provider)
   sẽ ghi đè lần đầu, xoá mất dữ liệu cần để đo "AI đoán đúng bao nhiêu %" (chính mục tiêu §13 nêu
   ra: *"đo độ chính xác so với các quyết định con người đã có"*).
2. **`media` không có khái niệm "case".** Recommendation phải gắn với MỘT `moderation_case` cụ thể
   (so sánh 1-1 với quyết định của case đó) — không có cột nào trên `media` biểu diễn quan hệ đó,
   và review/place không có cột `ai_*` nào cả (chỉ media có, theo ADR-009), nên cách tiếp cận gốc
   không mở rộng được sang target_type khác dù `AiModerationProvider` (kế thừa `AiModerationPort`)
   vẫn provider-agnostic cho MỌI target_type.
3. **Thống kê tổng hợp** (agreement rate, false positive/negative, breakdown theo decision/
   target_type — yêu cầu #6 của M7) cần quét MỘT bảng đồng nhất; qua các cột rải trên `media` sẽ
   phải suy luận lại `moderator_decision` từ `moderation_cases.decision` mỗi lần truy vấn, không
   lưu được `matched`/`evaluated_at` ở đâu cả.

**Điều KHÔNG đổi (bất biến Shadow mode giữ nguyên tuyệt đối):** INV-1/INV-2 không vi phạm — bảng
mới không phải trạng thái hiển thị, không đường đọc công khai nào join nó. Service KHÔNG BAO GIỜ
UPDATE `moderation_cases`/`media`/`reviews`, KHÔNG BAO GIỜ gọi FSM (cùng ràng buộc INV-7 nguyên
văn — chỉ khác nơi lưu trữ, không khác ai được phép quyết định). `AI.ModerateMedia` vẫn là quyền
DUY NHẤT cho `ai_agent`, KHÔNG quyền mới nào được thêm (D10 giữ nguyên).

Xem chi tiết đầy đủ: [moderation-design.md](../data/modules/moderation-design.md) §13 và
[MODERATION-M7-AI-SHADOW-MODE-2026-08-04.md](../delivery/reports/MODERATION-M7-AI-SHADOW-MODE-2026-08-04.md).
