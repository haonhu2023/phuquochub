# Nền tảng Kiểm duyệt — Tài liệu thiết kế

> **Trạng thái: ACCEPTED — 2026-08-02** — tài liệu đồng hành của [ADR-018](../../99-decisions/ADR-018-moderation-foundation.md) (đã Accepted), theo tiền lệ [ADR-017](../../99-decisions/ADR-017-transport-domain-foundation.md) → [transport.md](./transport.md) (ADR giữ quyết định và lý do; tài liệu này giữ chi tiết đủ để xây).
>
> Toàn bộ 7 quyết định Owner (O1–O7) đã chốt; **không còn quyết định nào chưa giải quyết**. M1 và M2 bắt đầu được ngay.
>
> **M1 — Moderation Schema Foundation: ĐÃ TRIỂN KHAI (2026-08-02).** Schema, enum, entity, hai FSM
> thuần, repository nền tảng, seed permission — sống trên database dev thật, đã diễn tập
> revert→verify→reapply. Xem [MODERATION-M1-SCHEMA-FOUNDATION-2026-08-02.md](../../delivery/reports/MODERATION-M1-SCHEMA-FOUNDATION-2026-08-02.md).
>
> **M2 — Moderation Queue Read API: ĐÃ TRIỂN KHAI (2026-08-02).** `GET /moderation/cases`,
> `GET /moderation/cases/{id}` — chỉ đọc, không action nào đổi trạng thái. Xem
> [MODERATION-M2-QUEUE-READ-API-2026-08-02.md](../../delivery/reports/MODERATION-M2-QUEUE-READ-API-2026-08-02.md).
>
> **M3 — Media Decision Workflow + auto-publish khi gắn review: ĐÃ TRIỂN KHAI (2026-08-02).**
> `POST /moderation/cases/{id}/decide` cho target media (approve/reject/hide/restore/dismiss qua
> FSM thuần); transaction T1 (tạo review + gắn/publish media nguyên tử, D3/D4); transaction T2
> (quyết định kiểm duyệt nguyên tử); migration `BackfillModerationCases` (T4/D14/O7, đếm-rồi-báo-cáo
> trước khi ghi, đã diễn tập apply→revert→reapply trên dữ liệu thật); audit + domain event sau khi
> commit. **Không có `claim`/`release`/`reopen`** (chưa cần — `decide()` tự chấp nhận case ở cả
> `open` lẫn `claimed`) **và không có `POST /media/{id}/moderate`** (route đã dự phòng nhưng M3 chỉ
> xây qua `/moderation/cases/{id}/decide`, đúng như M2 đã định tuyến). Xem
> [MODERATION-M3-MEDIA-WORKFLOW-2026-08-02.md](../../delivery/reports/MODERATION-M3-MEDIA-WORKFLOW-2026-08-02.md).
>
> **M4 — Review Decision Workflow + tính lại rating trong transaction: ĐÃ TRIỂN KHAI (2026-08-03).**
> `POST /moderation/cases/{id}/decide` mở rộng cho target review (hide/restore/approve qua FSM
> thuần `assertValidReviewTransition`, không thêm `rejected` vào `review_status`); quyền CHỌN theo
> target_type CỦA CHÍNH CASE (`Review.Moderate` cho review, `Media.Moderate` cho media, không dùng
> lẫn — xác nhận sống bằng một role tuỳ biến chỉ có `Media.Moderate` bị từ chối 403 khi quyết định
> review); transaction T2 mở rộng gọi `recalculateRating()` của place sở hữu TRONG CÙNG transaction
> (INV-4, diễn tập rollback sống: buộc transaction thất bại sau khi cả hai UPDATE đã chạy, xác nhận
> cả `reviews.status` lẫn `places.rating_avg/rating_count` hoàn nguyên chính xác). Xem
> [MODERATION-M4-REVIEW-WORKFLOW-2026-08-03.md](../../delivery/reports/MODERATION-M4-REVIEW-WORKFLOW-2026-08-03.md).
>
> **M5 — User Reporting (transaction T3): ĐÃ TRIỂN KHAI (2026-08-03).** `POST /reviews/{id}/report`,
> `POST /media/{id}/report` — target phải `published` (404 CHUNG cho "không tồn tại" lẫn "chưa/
> không còn published", không rò rỉ trạng thái kiểm duyệt nội bộ); T3 tạo case `open` mới
> (source=report) hoặc gắn vào case mở sẵn có cho target đó (INV-3, không tạo trùng — khoá case
> bằng `SELECT ... FOR UPDATE` trước khi đọc/ghi report_count, chốt chặn concurrency duy nhất của
> bước tăng report_count); `report_count`/`severity`/`priority` tính lại trong CÙNG transaction
> (≥3 report ⇒ severity tối thiểu `high`, §4.1 — xác nhận sống: report thứ 3 nâng severity
> normal→high, priority 10→40); chống report trùng qua `uq_reports_one_per_reporter` (409, không
> mutation). **KHÔNG BAO GIỜ đổi `reviews.status`/`media.status`** (O3/INV-6 — report chỉ nâng độ
> ưu tiên hàng chờ, không tự ẩn nội dung). `ModerationCasesRepository`/`ReportsRepository`/domain
> event token được TÁCH sang `ModerationCoreModule` (module lá, không phụ thuộc chéo) để
> `MediaModule` gọi được `ModerationReportsService` mà không tạo circular dependency với
> `ModerationModule` (vốn đã import `MediaModule` từ M3). Xem
> [MODERATION-M5-REPORTING-2026-08-03.md](../../delivery/reports/MODERATION-M5-REPORTING-2026-08-03.md).
>
> **M6 — Moderator UI: ĐÃ TRIỂN KHAI VÀ XÁC MINH TRỰC TIẾP (2026-08-04). HOÀN THÀNH.** Giao diện
> moderator tại `/dashboard/moderation` (hàng chờ + lọc theo URL status/target_type/source/severity/
> assigned_to + phân trang dùng chung) và `/dashboard/moderation/{id}` (chi tiết case + reports + ảnh
> chụp target + form quyết định). CHỈ tiêu thụ hợp đồng M2/M3/M4 đã có (`GET /moderation/cases`,
> `GET /moderation/cases/{id}`, `POST /moderation/cases/{id}/decide`) — KHÔNG endpoint mới, KHÔNG đổi
> schema/contract/BE. Quyết định suy từ `target_type` + trạng thái nội dung hiện tại (KHÔNG render
> hành động không hợp lệ); `reason` bắt buộc cho reject|hide; `target_status` tường minh cho restore
> media; `409` = case đã bị người khác xử lý (thông báo an toàn), KHÔNG mutation lạc quan. Media chờ
> duyệt KHÔNG có URL xem trước (hoãn signed-URL) → hiển thị "Không có ảnh xem trước" trung thực.
> **Điều hướng:** FE session CHƯA lộ permission (và không có field permission ở `/users/me`) nên link
> kiểm duyệt bị ẩn khỏi nav dashboard — route vẫn tới được qua URL trực tiếp; chốt chặn quyền là
> `403` của BE (`Moderation.Queue.View`) → forbidden state rõ ràng.
>
> **Kiểm thử trực tiếp trên stack thật (2026-08-04, Docker + Postgres/Redis/MinIO thật):** ma trận
> phân quyền xác nhận sống — anonymous 401, member 403, moderator 200, **administrator/
> super_administrator kế thừa qua DAG role_parents (200, không seed quyền tường minh)**; hàng chờ
> (phân trang 2 trang/38 case, mọi filter + kết hợp filter đúng khớp API, empty state, error+retry
> state qua việc dừng/khởi động lại API thật, forbidden state qua session member thật); chi tiết
> case (metadata, reports không lộ danh tính người báo cáo, media preview "Không có ảnh xem trước"
> trung thực, review preview đủ rating/nội dung); **cả 4 transition media** (approve, reject, hide,
> restore — cả hai đích `published`/`pending` đều test tường minh); **cả 3 transition review** (hide,
> restore, legacy approve) với **rating tính lại xác nhận đúng số học qua từng bước** (4.0/1 → ẩn →
> NULL/0 → khôi phục → 5.0/1 → duyệt thêm review 3★ → 4.0/2); transition không hợp lệ → 422 đúng
> thông điệp; restore thiếu target_status → 422 (INV-10); reason thiếu cho reject/hide → 422
> (INV-11) và bị chặn phía UI trước khi gửi; **409 stale-conflict dàn dựng thật** (case bị một
> "moderator khác" xử lý ngoài band trong lúc form đang mở) → thông điệp an toàn, không mutation
> kép; **rollback giao dịch** xác minh qua injection lỗi (Nest DI spy, không sửa code sản phẩm) SAU
> khi mutate status NHƯNG TRƯỚC commit → toàn bộ rollback (media/case giữ nguyên), thêm vào bộ hồi
> quy vĩnh viễn tại `apps/api/test/moderation-decide-rollback.e2e-spec.ts`; dọn sạch mọi fixture
> disposable (xác nhận zero residue). Hồi quy đầy đủ: BE unit 1115/1115, BE e2e **19/19 suite —
> 163/163 test** (thật, chạy trên Postgres/Redis thật), FE 234/234, typecheck 6/6, lint sạch, build
> 4/4 (routes `/dashboard/moderation` + `[id]` xác nhận trong output build). Xem
> [MODERATION-M6-MODERATOR-UI-2026-08-04.md](../../delivery/reports/MODERATION-M6-MODERATOR-UI-2026-08-04.md).
>
> **M7 — AI Shadow Mode: ĐÃ TRIỂN KHAI VÀ XÁC MINH TRỰC TIẾP (2026-08-04). HOÀN THÀNH.** Bảng MỚI
> DUY NHẤT `ai_recommendations` (migration `AddAiRecommendations`, KHÔNG đụng `moderation_cases`/
> `reports`/`media`/`reviews`) — mỗi dòng là MỘT gợi ý của AI cho MỘT case, KHÔNG BAO GIỜ là quyết
> định. Đây là một tinh chỉnh có chủ đích so với phác thảo §13 gốc (ghi thẳng vào
> `media.ai_moderation_score`/`ai_labels`) — xem phụ lục ADR-018 bên dưới để biết lý do và phạm vi
> tinh chỉnh này.
>
> `AiRecommendationsService.generateRecommendation(case)` gọi `AiModerationProvider` (DI token
> `AI_MODERATION_PROVIDER`, implementation mặc định `LoggingAiModerationProvider` — gợi ý GIẢ, XÁC
> ĐỊNH suy từ `targetId`, KHÔNG OpenAI/Anthropic/HTTP ngoài nào), persist MỘT dòng, KHÔNG BAO GIỜ
> UPDATE `moderation_cases`/`media`/`reviews`, KHÔNG BAO GIỜ gọi FSM. Route MỚI:
> `POST /moderation/cases/{id}/ai-recommendation` (quyền **tái dùng** `AI.ModerateMedia` — KHÔNG
> quyền mới) và `GET /moderation/cases/{id}/ai-recommendation` (quyền `Moderation.Queue.View`).
>
> Khi moderator hoàn tất `decide()` (T2), `ModerationService.emitPostCommit()` gọi
> `AiRecommendationsService.evaluateModeratorDecision(caseId, decision)` — try/catch RIÊNG, hoàn
> toàn độc lập với audit/event, SAU KHI transaction đã commit (cùng INV-9): so sánh recommendation
> mới nhất của case với quyết định thật, ghi `matched`/`moderator_decision`/`evaluated_at`. Lỗi ở
> đây KHÔNG BAO GIỜ ảnh hưởng quyết định thật — xác nhận sống bằng Nest DI spy (giống tiền lệ M6
> `moderation-decide-rollback.e2e-spec.ts`, nhưng NGƯỢC hướng: ở đây decide() vẫn `200`, media/case
> vẫn resolve đúng, chỉ phía AI bị bỏ dở và ghi log).
>
> `AiRecommendationsRepository.getStatistics()` — agreement rate, confidence trung bình, false
> positive/negative (positive = `reject`/`hide`; negative = `approve`/`restore`/`dismiss`),
> breakdown theo decision và theo `target_type` (JOIN CHỈ-ĐỌC sang `moderation_cases`). **Repository +
> service ONLY — không endpoint, không dashboard** (đúng phạm vi M7).
>
> Sự kiện MỚI (tái dùng `MODERATION_EVENT_PUBLISHER` đã có, KHÔNG token thứ hai):
> `ai.recommendation.created`, `ai.recommendation.evaluated`.
>
> **Kiểm thử trực tiếp trên stack thật (2026-08-04, Docker + Postgres/Redis/MinIO thật):** migration
> diễn tập apply→revert→verify(bảng biến mất)→reapply; ma trận quyền xác nhận sống qua HTTP thật
> (anonymous 401, moderator không có `AI.ModerateMedia` 403, `ai_agent` 201); recommendation tạo
> xong → `media.status`/`moderation_cases.status` xác nhận KHÔNG đổi (query DB trực tiếp); moderator
> `decide()` xong → `evaluated_at`/`moderator_decision`/`matched` ghi đúng cho CẢ hai nhánh (khớp:
> AI đề nghị `reject`, moderator `reject` → `matched=true`; lệch: AI đề nghị `hide` — không hợp lệ
> trên `pending` — moderator `reject` → `matched=false`); thống kê xác nhận đúng số học tuyệt đối
> qua SQL trực tiếp (2 recommendation, 2 evaluated, 1 matched, avg confidence 0.855); dọn sạch mọi
> fixture disposable (xác nhận zero residue, hàng chờ về đúng baseline 11 case đã biết từ M6). Hồi
> quy đầy đủ: BE unit **103 suite/1155 test PASS**, BE e2e **20 suite/172 test PASS** (bao gồm suite
> mới `moderation-ai-shadow.e2e-spec.ts`, 9 test), build/lint/typecheck sạch. Xem
> [MODERATION-M7-AI-SHADOW-MODE-2026-08-04.md](../../delivery/reports/MODERATION-M7-AI-SHADOW-MODE-2026-08-04.md).
>
> **Chỉ kiến trúc.** Chưa có code, entity, migration, file React, hay test nào cho bất cứ nội dung nào ở đây. SQL bên dưới là **đặc tả thiết kế**, không phải migration.
>
> Giữ nguyên tiếng Anh: tên bảng/cột, giá trị enum, mã quyền, route API, mã sự kiện, tên class/file.

---

## 1. Mô hình miền

Ba khái niệm, cố ý tách bạch:

| Khái niệm | Trả lời câu hỏi | Sống ở đâu | Vòng đời |
|---|---|---|---|
| **Trạng thái nội dung** | Công chúng có thấy được không? | `media.status`, `reviews.status` (**cột đã có**) | Bằng vòng đời nội dung |
| **Case** | Moderator còn nợ một quyết định không? | `moderation_cases` (mới) | Sống lâu hơn target |
| **Report** | Ai khẳng định nội dung này vi phạm, và vì sao? | `reports` (mới) | Sống lâu hơn target |

```
                 ┌──────────────────────────────────┐
                 │  NỘI DUNG (đã có, không đổi)     │
                 │  media.status  reviews.status    │  ← nguồn sự thật DUY NHẤT
                 └──────────────┬───────────────────┘  ← cho HIỂN THỊ (INV-1)
                                │ target_type + target_id
                                │ (tham chiếu lỏng, không FK, không cascade)
                 ┌──────────────┴───────────────────┐
                 │       moderation_cases           │  ← nguồn sự thật
                 │  status · source · severity      │  ← cho CÔNG VIỆC
                 │  priority · assigned_to          │
                 │  decision · reason               │
                 └──────────────┬───────────────────┘
                                │ case_id (FK thật, CASCADE)
                 ┌──────────────┴───────────────────┐
                 │            reports               │  ← bằng chứng
                 │  reporter_id · reason · desc     │
                 └──────────────────────────────────┘

     ghi   ──▶  audit_logs  (đã có, ADR-016, append-only)
     phát  ──▶  MODERATION_EVENT_PUBLISHER (chỉ ghi log)
```

**Quy tắc đọc (INV-1).** Đường đọc công khai **chỉ** tra cột trạng thái nội dung, **không bao giờ** join `moderation_cases`. Case vô hình với người dùng cuối theo đúng cấu trúc.

### 1.1 Nguồn sinh case

| `source` | Tạo bởi | Có report? | Ví dụ |
|---|---|---|---|
| `new_content` | Backfill / nội dung chưa từng duyệt | Không | Ảnh `pending` chưa gắn review nào |
| `report` | Report đầu tiên trên target | Có (1..N) | Người dùng báo cáo một review là spam |
| `ai_flag` | Runner kiểm duyệt AI | Không | Điểm NSFW vượt ngưỡng |
| `manual` | Moderator mở case trực tiếp | Không | Kiểm tra chủ động |

Một case `new_content` sau đó nhận report vẫn là **một** case; `report_count` tăng, `severity`/`priority` tính lại. Đó chính là lý do tồn tại của partial unique index (INV-3).

---

## 2. Vòng đời media

```
   POST /media  →  status = pending, url = NULL     ← KHÔNG BAO GIỜ auto-publish ở đây (O2)
        │
        │  POST /places/{id}/reviews  kèm media_ids
        │  (trong CÙNG transaction tạo review, đủ 6 điều kiện D3)
        ▼
   ┌─────────┐ ──── auto-publish ────▶ ┌───────────┐
   │ pending │                         │ published │
   └────┬────┘                         └─────┬─────┘
        │                                    │
        │ approve (moderator)                │ hide (moderator, reason bắt buộc)
        ├────────────────────────────────────┤
        │                                    ▼
        │                              ┌────────┐
        │                              │ hidden │
        │                              └────┬───┘
        │                                   │ restore + target_status TƯỜNG MINH
        │ reject (reason bắt buộc)          │  → published  hoặc  → pending
        ▼                                   │
   ┌──────────┐                             │
   │ rejected │ ── restore + target_status ─┘
   └──────────┘     TƯỜNG MINH (INV-10)

   KHÔNG HỢP LỆ (INV-13):  published → rejected ·  hidden → rejected ·  pending → hidden
```

**Hôm nay** mọi bước sau `pending` đều không tồn tại — không mã nào ghi `published` (ADR-018 §Context). Vòng đời này là thứ lần đầu tiên làm ảnh đã upload trở nên nhìn thấy được.

`url` giữ `NULL` suốt vòng đời; nó được sinh lúc đọc từ `object_key` (Media Upload Foundation, 2026-07-30). **Publish không ghi `url`.**

### 2.1 Bảng transition media (đặc tả chính xác)

| Action | Từ | Đến | Quyền | `reason` | `reason_code` | `target_status` | Audit | Recalc rating |
|---|---|---|---|---|---|---|---|---|
| *(auto)* | `pending` | `published` | — (hệ thống, trong transaction tạo review) | — | — | — | `media.auto_published` | không |
| `approve` | `pending` | `published` | `Media.Moderate` | tuỳ chọn | **cấm** (422) | — | `moderation.decided` | không |
| `reject` | `pending` | `rejected` | `Media.Moderate` | **bắt buộc** | **bắt buộc** | — | `moderation.decided` | không |
| `hide` | `published` | `hidden` | `Media.Moderate` | **bắt buộc** | **cấm** (422) | — | `moderation.decided` | không |
| `restore` | `hidden` | `published` \| `pending` | `Media.Moderate` | tuỳ chọn | **cấm** (422) | **bắt buộc** | `moderation.decided` | không |
| `restore` | `rejected` | `published` \| `pending` | `Media.Moderate` | tuỳ chọn | **cấm** (422) | **bắt buộc** | `moderation.decided` | không |
| `dismiss` | *(không đổi status)* | — | `Report.Resolve` | tuỳ chọn | **cấm** (422) | — | `moderation.report_resolved` | không |

`reason_code` **cấm** ở mọi hàng trừ `reject` (và cấm ở MỌI quyết định trên target `review` —
taxonomy chỉ mô tả ảnh). Từ chối tường minh thay vì âm thầm bỏ qua: một mã ghi nhầm lên case
`approve`/`restore` sẽ nằm sẵn trong CSDL chờ một đường đọc tương lai hiểu sai nó. Quan trọng hơn,
case `restore` luôn ghi `reason_code = NULL`, nên **không mã nào sống sót qua một lần khôi phục**.

### 2.2 Lỗi khi transition không hợp lệ

| Tình huống | Mã | Thông điệp (ý) |
|---|---|---|
| Transition không có trong bảng §2.1 | `422` | `Không thể {action}: media đang ở trạng thái {status}` |
| `reject`/`hide` thiếu `reason` | `422` | `Quyết định {action} bắt buộc có lý do` |
| `reject` thiếu `reason_code` | `422` | `Quyết định "reject" bắt buộc có reason_code (mã lý do hiển thị cho chủ nội dung)` |
| `reason_code` gửi kèm quyết định khác `reject` | `422` | `reason_code chỉ dùng cho quyết định "reject"` |
| `reason_code` gửi kèm case target `review` | `422` | `reason_code chỉ áp dụng cho kiểm duyệt media` |
| `reason_code` không thuộc `media_moderation_reason_code` | `400` | (chuẩn `ValidationPipe`/`@IsEnum`) |
| `restore` thiếu `target_status` | `422` | `Khôi phục phải chỉ định rõ target_status (published hoặc pending)` |
| `restore` với `target_status` không thuộc {`published`,`pending`} | `422` | `target_status không hợp lệ` |
| Case đã `resolved`/`dismissed` | `409` | `Case đã được xử lý bởi moderator khác` |
| Moderator là tác giả nội dung | `403` | `Không thể tự kiểm duyệt nội dung của chính mình` |
| Thiếu quyền | `403` | (chuẩn `PermissionsGuard`) |
| Case/target không tồn tại | `404` / `422` | case → `404`; target đã bị xoá → `422` |

---

## 3. Vòng đời review (O1 — giữ auto-publish)

```
   POST /places/{id}/reviews  →  status = published     ← hành vi đã ship, KHÔNG đổi (O1)
        │
        ▼
   ┌───────────┐ ── hide (reason bắt buộc) ──▶ ┌────────┐
   │ published │                               │ hidden │
   └───────────┘ ◀────── restore ───────────── └────────┘
        ▲
        │ approve   (chỉ cho dòng cũ/chèn tay — KHÔNG tới được qua API, O1)
   ┌────┴────┐
   │ pending │
   └─────────┘

   Review KHÔNG có trạng thái `rejected`  (không thêm giá trị enum — ADR-018 D5)
```

| Action | Từ | Đến | Quyền | `reason` | Recalc rating |
|---|---|---|---|---|---|
| `hide` | `published` | `hidden` | `Review.Moderate` | **bắt buộc** | **BẮT BUỘC** |
| `restore` | `hidden` | `published` | `Review.Moderate` | tuỳ chọn | **BẮT BUỘC** |
| `approve` | `pending` | `published` | `Review.Moderate` | tuỳ chọn | **BẮT BUỘC** |

Với review, `restore` chỉ có **một** đích hợp lệ (`published`), nên không có gì để đoán: `target_status` là tuỳ chọn, và mọi giá trị khác `published` trả `422` (đưa review về `pending` mâu thuẫn trực tiếp với O1).

**Mọi transition trên sơ đồ này bắt buộc gọi `PlacesRepository.recalculateRating(placeId)` trong cùng transaction** (INV-4), vì hàm đó tổng hợp `WHERE status='published'`. Bỏ sót sẽ để `rating_avg`/`rating_count` tính cả review không ai đọc được — sai lệch **không có triệu chứng nhìn thấy**.

---

## 4. Thiết kế hàng chờ

Hàng chờ là `moderation_cases` lọc `status IN ('open','claimed')`, sắp xếp:

```sql
ORDER BY priority DESC, report_count DESC, created_at ASC
```

### 4.1 `severity` và `priority`

Owner yêu cầu report nâng **cả** `priority` lẫn `severity`. Để tránh hai cột trôi lệch nhau, quan hệ được định nghĩa một chiều, xác định:

- **`severity`** (enum, lưu trữ): phân loại ngữ nghĩa cho con người đọc — `low` \| `normal` \| `high` \| `critical`.
- **`priority`** (`smallint`, lưu trữ): khoá sắp xếp, **suy ra xác định** từ `severity` lúc ghi, không bao giờ nhập tay.

```
priority = base(severity) + min(5 × max(report_count − 1, 0), 25)

base:  low = 0 · normal = 10 · high = 30 · critical = 60
```

Quy tắc nâng `severity` (áp lúc ghi):

| Điều kiện | `severity` tối thiểu |
|---|---|
| `source = 'new_content'` | `low` |
| `source = 'new_content'` **do backfill D14/O7** | **`normal`** ← ngoại lệ tường minh: ảnh thật, gắn review thật, đang vô hình |
| `source = 'manual'` | `normal` |
| `source = 'report'` | `normal` |
| **`report_count ≥ 3`** | **`high`** ← ngưỡng O3, **chỉ** đổi thứ tự hàng chờ |
| `source = 'ai_flag'` và `ai_score ≥` ngưỡng cứng | `critical` |

`priority` là số nguyên **lưu sẵn**, không phải biểu thức tính lúc truy vấn — để hàng chờ luôn là một lần quét index duy nhất khi dữ liệu lớn lên.

**Không có cột `auto_hide`, không có cờ, không có nhánh mã nào cho nó** (INV-6). Sự vắng mặt này là chủ đích và được ghi lại để một milestone sau không "khôi phục" nó như thể đó là thiếu sót.

### 4.2 Claim và chống làm trùng

Moderator chuyển `open → claimed` (đặt `assigned_to`, `claimed_at`) trước khi quyết định. Đây là **cơ chế tư vấn, không phải khoá**: endpoint quyết định luôn kiểm tra lại case còn xử lý được và trả `409` nếu moderator khác đã resolve trước (WF-07 *"chống xử lý trùng — optimistic lock"*). Claim cũ có thể được nhận lại sau một khoảng TTL; **không cần scheduler** vì việc kiểm tra diễn ra lúc đọc.

### 4.3 Xung đột lợi ích (INV-12)

Endpoint quyết định trả `403` khi moderator chính là tác giả nội dung — tra qua `media.uploaded_by` / `reviews.user_id`. Một truy vấn phụ cho mỗi quyết định: chọn đúng đắn thay vì tối ưu vi mô.

---

## 5. Máy trạng thái — case và report

### 5.1 `moderation_cases`

```
              ┌──────┐
   tạo ──────▶│ open │◀─────── reopen ────────┐
              └───┬──┘                        │
        claim     │      resolve / dismiss    │
     ┌────────────┼──────────────┐            │
     ▼            │              ▼            │
 ┌─────────┐      │        ┌──────────┐  ┌───────────┐
 │ claimed │──────┴───────▶│ resolved │  │ dismissed │
 └────┬────┘   resolve     └──────────┘  └───────────┘
      │ release                  │              │
      └──────▶ open              └── reopen ────┘
```

| Action | Từ | Đến | Quyền | Ghi chú |
|---|---|---|---|---|
| `claim` | `open` | `claimed` | `Report.Resolve` | Đặt `assigned_to` |
| `release` | `claimed` | `open` | `Report.Resolve` | Xoá `assigned_to` |
| `resolve` | `open`, `claimed` | `resolved` | `Media.Moderate` / `Review.Moderate` | Bắt buộc có `decision`; `reason` bắt buộc khi `reject`/`hide` |
| `dismiss` | `open`, `claimed` | `dismissed` | `Report.Resolve` | Report vô căn cứ; **không** đổi trạng thái nội dung (O3 nghĩa là nội dung chưa từng bị auto-hide) |
| `reopen` | `resolved`, `dismissed` | `open` | `Report.Resolve` | Đường quay lui bắt buộc của WF-07/13/18 |

`decision ∈ {approve, reject, hide, restore, dismiss}` — ghi trên case, **và** ghi riêng vào `audit_logs` để mọi lần đảo ngược đều còn nguyên lịch sử.

### 5.2 `reports`

Report không có vòng đời độc lập; chúng là bằng chứng, kết quả được đặt khi case đóng.

```
   open ──▶ upheld     (case resolved bằng một quyết định gỡ nội dung: reject | hide)
        └─▶ dismissed  (case dismissed, hoặc resolved bằng approve | restore)
```

---

## 6. Mô hình cơ sở dữ liệu

> Đặc tả thiết kế. Tên cột theo quy ước `snake_case` ở DB / `camelCase` ở entity.

### 6.1 Enum mới

```sql
report_reason           : spam | misinformation | offensive | irrelevant |
                          copyright | personal_info | other
report_status           : open | upheld | dismissed
moderation_case_status  : open | claimed | resolved | dismissed
moderation_case_source  : new_content | report | ai_flag | manual
moderation_case_severity: low | normal | high | critical
moderation_decision     : approve | reject | hide | restore | dismiss
moderation_target_type  : review | media | place

-- Controlled Media Rejection Reason (2026-08-12, migration AddModerationReasonCode)
media_moderation_reason_code
                        : inappropriate_content | low_quality |
                          unrelated_to_place | copyright | other
```

`media_moderation_reason_code` là taxonomy **riêng**, KHÔNG tái dùng `report_reason` (lý do NGƯỜI
DÙNG *báo cáo* — một cáo buộc chưa xác minh, không phải kết luận của moderator) và cũng không tái
dùng `business_claim_reason_code` (nói về hồ sơ yêu cầu quyền quản lý, không nói gì được về một bức
ảnh). Chỉ 5 giá trị, mỗi giá trị mô tả **thuộc tính của chính bức ảnh** — không mã nào phản ánh tín
hiệu nội bộ (nghi ngờ gian lận, trùng tài khoản); những trường hợp đó dùng `other` + ghi chú nội bộ
ở `reason`, để chủ nội dung không bao giờ đọc được rằng hệ thống đang nghi ngờ họ.

`moderation_target_type` là **enum** (không phải text tự do) — khác có chủ đích với `audit_logs.entity_type`: audit phải nhận **mọi** thực thể tương lai mà không cần DDL, còn target kiểm duyệt **bắt buộc** phải có một FSM đã đăng ký. Một target chưa đăng ký là lỗi, và enum bắt lỗi đó ngay lúc INSERT (MR-4).

`place` có mặt trong enum nhưng **M1–M7 không triển khai FSM cho nó** (§Ngoài phạm vi, ADR-018).

### 6.2 `moderation_cases`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | `uuid` PK | |
| `target_type` | `moderation_target_type` NOT NULL | |
| `target_id` | `uuid` NOT NULL | Không FK — ADR-018 D9 |
| `status` | `moderation_case_status` NOT NULL DEFAULT `open` | |
| `source` | `moderation_case_source` NOT NULL | |
| `severity` | `moderation_case_severity` NOT NULL DEFAULT `low` | §4.1 |
| `priority` | `smallint` NOT NULL DEFAULT 0 | Suy ra từ `severity` + `report_count` lúc ghi |
| `report_count` | `int` NOT NULL DEFAULT 0 | Denormalize từ `reports` |
| `assigned_to` | `uuid` NULL → `users` ON DELETE SET NULL | |
| `claimed_at` | `timestamptz` NULL | |
| `decision` | `moderation_decision` NULL | Đặt khi resolve |
| `reason` | `text` NULL | Bắt buộc khi `reject`/`hide` (INV-11). **NỘI BỘ — không bao giờ lộ cho chủ nội dung** ([media.md §16](./media.md)) |
| `reason_code` | `media_moderation_reason_code` NULL | **Controlled Media Rejection Reason (2026-08-12)** — mã CÓ KIỂM SOÁT, owner-safe. Bắt buộc khi `reject` trên target **media**; cấm ở mọi quyết định/target khác (422). Nullable, KHÔNG CHECK: case lịch sử có `reason != null` + `reason_code = null` là **hợp lệ**, không backfill/suy đoán. Xem [media.md §17](./media.md) |
| `resolved_by` | `uuid` NULL → `users` ON DELETE SET NULL | |
| `resolved_at` | `timestamptz` NULL | |
| `ai_score` | `numeric(4,3)` NULL | Ảnh chụp `media.ai_moderation_score` lúc gắn cờ |
| `ai_labels` | `jsonb` NULL | |
| `created_at` / `updated_at` | `timestamptz` | |

**Không có cột nào cho trạng thái hiển thị** (INV-2) — đây là điều quan trọng nhất của bảng này.

```sql
CREATE UNIQUE INDEX uq_moderation_cases_open_target
  ON moderation_cases (target_type, target_id)
  WHERE status IN ('open','claimed');                    -- INV-3

CREATE INDEX idx_moderation_cases_queue
  ON moderation_cases (priority DESC, report_count DESC, created_at ASC)
  WHERE status IN ('open','claimed');                    -- đường đọc hàng chờ

CREATE INDEX idx_moderation_cases_target
  ON moderation_cases (target_type, target_id);          -- lịch sử của một nội dung

CREATE INDEX idx_moderation_cases_assigned
  ON moderation_cases (assigned_to) WHERE status = 'claimed';
```

### 6.3 `reports`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | `uuid` PK | |
| `case_id` | `uuid` NOT NULL → `moderation_cases` ON DELETE CASCADE | FK **thật** — report không có case thì vô nghĩa |
| `target_type` | `moderation_target_type` NOT NULL | Denormalize để truy vấn không cần join |
| `target_id` | `uuid` NOT NULL | Không FK |
| `reporter_id` | `uuid` NOT NULL → `users` ON DELETE CASCADE | |
| `reason` | `report_reason` NOT NULL | |
| `description` | `varchar(1000)` NULL | Trim (quy ước Booking) |
| `status` | `report_status` NOT NULL DEFAULT `open` | §5.2 |
| `created_at` | `timestamptz` | |

```sql
CREATE UNIQUE INDEX uq_reports_one_per_reporter
  ON reports (target_type, target_id, reporter_id);   -- WF-12 "chống report trùng"

CREATE INDEX idx_reports_case ON reports (case_id);
```

### 6.4 Không đổi

`media`, `reviews`, `users`, `audit_logs`, và toàn bộ bảng RBAC **không đổi schema**. `review_status` **không** thêm giá trị (ADR-018 D5).

---

## 7. Ranh giới transaction

Mục này là đặc tả chuẩn cho yêu cầu sửa đổi #3 và #4.

### T1 — Tạo review kèm media (M3 + M4)

**Điểm khởi đầu quan trọng:** `ReviewsService.create()` **hiện không có transaction**. T1 tạo ra nó — thay đổi hành vi có chủ đích (MR-7).

```
BEGIN
 1. kiểm tra place tồn tại                             → 404 nếu không
 2. kiểm tra user chưa review place này                → 409 nếu đã có
 3. INSERT reviews (status = 'published')              ← O1
 4. NẾU media_ids không rỗng (tối đa 10 — ArrayMaxSize):
      a. UPDATE media
            SET review_id = :reviewId, status = 'published'
          WHERE id = ANY(:mediaIds)
            AND uploaded_by  = :actorId          ← đk 2: đúng người upload
            AND object_key IS NOT NULL           ← đk 1: upload đã xác minh
            AND status       = 'pending'         ← đk 4
            AND deleted_at  IS NULL              ← đk 5
            AND review_id   IS NULL              ← đk 3: còn mồ côi
            AND place_id    IS NULL
            AND post_id     IS NULL
            AND business_id IS NULL
            AND event_id    IS NULL
      b. NẾU affected_rows ≠ len(media_ids) → ROLLBACK → 422   ← INV-14
 5. recalculateRating(place_id)                        ← INV-4
COMMIT
────────────────────────────────────────────────────────────
sau commit (không bao giờ trong transaction — INV-9):
  · audit: review.created
  · audit: media.auto_published   (một bản ghi cho mỗi media, kèm before/after)
  · event: ReviewCreated, MediaAutoPublished
```

**Vì sao `object_key IS NOT NULL` chứng minh được "upload đã xác minh":** `createUploaded()` **chỉ** được `MediaService.register()` gọi, và chỉ **sau khi** `verifyUploadedObject()` trả `ok` (kiểm checksum/kích thước/content-type với object thật trong storage). Không đường nào khác ghi `object_key`. Đây là bất biến có thật trong mã đã ship, không phải giả định.

**Câu trả lời cho các câu hỏi Owner nêu:**

| Câu hỏi | Trả lời |
|---|---|
| Có nằm trong cùng transaction tạo review không? | **Có** — bước 4 nằm giữa `BEGIN`/`COMMIT` của bước 3. |
| Lỗi thì rollback thế nào? | Toàn bộ transaction rollback: **không** review, **không** media nào đổi trạng thái. |
| Ghi event và audit gì? | Sau commit: `review.created`, `media.auto_published` (mỗi media một dòng); event `ReviewCreated`, `MediaAutoPublished`. |
| Một trong nhiều `media_ids` không hợp lệ thì sao? | **Toàn bộ-hoặc-không-gì** — `affected_rows ≠ len(ids)` → rollback + `422`. Không gắn một phần, không âm thầm bỏ qua. |
| Nếu tạo review thất bại, media có giữ `pending` không? | **Có, toàn bộ** — và vẫn mồ côi, nên cuối cùng sẽ được `media:cleanup` dọn (hành vi hiện hành). |

### T2 — Quyết định kiểm duyệt (M3 + M4)

```
BEGIN
 1. SELECT case ... FOR UPDATE
 2. assert case ∈ {open, claimed}                       → 409 nếu không
 3. nạp target; assert tồn tại                          → 422 nếu đã xoá
 4. assert actor KHÔNG phải tác giả target              → 403   (INV-12)
 5. assert transition hợp lệ theo §2.1 / §3             → 422   (INV-10, INV-11, INV-13)
 6. UPDATE <media|reviews> SET status = :targetStatus
 7. NẾU target_type = 'review' → recalculateRating()    ← INV-4, BẮT BUỘC
 8. UPDATE moderation_cases
       SET status='resolved', decision, reason, resolved_by, resolved_at
 9. UPDATE reports SET status = 'upheld' | 'dismissed' WHERE case_id = :id
COMMIT
────────────────────────────────────────────────────────────
sau commit:  audit: moderation.decided  ·  event: ContentHidden|ContentApproved|CaseResolved
```

### T3 — Tạo report (M5)

```
BEGIN
 1. assert target tồn tại và ở trạng thái báo cáo được
 2. INSERT moderation_cases (source='report', severity='normal')
      ON CONFLICT (partial unique index INV-3) DO NOTHING
    → nếu không chèn được, SELECT case đang mở của target đó
 3. INSERT reports (case_id, ...)
      → 409 nếu vi phạm uq_reports_one_per_reporter
 4. UPDATE moderation_cases
       SET report_count = report_count + 1,
           severity     = recompute(...),     ← ≥3 report ⇒ tối thiểu 'high'
           priority     = recompute(severity, report_count)
    ★ KHÔNG đổi trạng thái hiển thị của nội dung — INV-6 / O3
COMMIT
────────────────────────────────────────────────────────────
sau commit:  audit: report.created  ·  event: ReportCreated, CaseOpened (nếu case mới)
```

`INSERT ... ON CONFLICT` dựa trên partial unique index chính là thứ làm cho các report **đồng thời đầu tiên** an toàn: một lệnh thắng và tạo case, phần còn lại gắn vào chính case đó. Không cần khoá ở tầng ứng dụng.

### T4 — Backfill media cũ đã gắn review (M3, migration `BackfillModerationCases` — D14/O7)

Chạy **một lần** trong migration, **không** trong runtime service. Idempotent theo cấu trúc.

```
-- BƯỚC 0 (BẮT BUỘC, chạy và BÁO CÁO TRƯỚC khi chạy up() — MR-1)
SELECT count(*) FROM media
 WHERE status = 'pending' AND review_id IS NOT NULL AND deleted_at IS NULL;

-- BƯỚC 1: tạo case
INSERT INTO moderation_cases
       (target_type, target_id, status, source, severity, priority, report_count)
SELECT 'media', m.id, 'open', 'new_content', 'normal', 10, 0
  FROM media m
 WHERE m.status      = 'pending'        -- đk 1
   AND m.review_id  IS NOT NULL         -- đk 2: CHỈ media đã gắn review
   AND m.deleted_at IS NULL             -- đk 3
ON CONFLICT DO NOTHING;                 -- đk 4: partial unique index D8 ⇒ idempotent + INV-3

-- ★ KHÔNG có lệnh UPDATE media nào. media.status giữ nguyên 'pending'.  (O7)

-- BƯỚC 2: một dòng audit tổng hợp
INSERT INTO audit_logs (event, entity_type, is_service_account, result, context, ...)
VALUES ('moderation.backfilled', 'media', true, 'success',
        '{"candidate_count": <n>, "created_count": <k>}'::jsonb, ...);
```

| Thuộc tính | Đảm bảo bởi |
|---|---|
| **Idempotent** | `ON CONFLICT DO NOTHING` trên `uq_moderation_cases_open_target`. Chạy lần hai → `created_count = 0`, không dòng trùng. |
| **Giữ INV-3** (một case mở mỗi target) | Cùng index đó — điều kiện "chưa có case mở" của O7 **chính là** thứ index cưỡng chế, không phải một `NOT EXISTS` viết tay có thể sai. |
| **Không đổi hiển thị** | Không tồn tại lệnh `UPDATE media` nào trong migration này. |
| **Không publish hàng loạt** | Cùng lý do trên; `media.status` giữ `'pending'` cho tới khi có moderator quyết định từng case qua T2. |
| **Media mồ côi không bị đụng tới** | `review_id IS NOT NULL` loại chúng ra — chúng đã thuộc phạm vi `media:cleanup`. |

`down()` chỉ xoá đúng các case do chính nó tạo (`source='new_content' AND status='open' AND report_count=0`); nếu tồn tại case đã `resolved` thì **từ chối** (MR-5) thay vì huỷ lịch sử quyết định.

**Sau backfill:** những media này xuất hiện trong hàng chờ ở `priority = 10` và trở nên hiển thị **chỉ khi** moderator `approve` từng case qua T2 — đúng đường FSM §2.1, không có lối tắt.

---

## 8. Sequence diagram

### 8.1 O2 — auto-publish khi gắn vào review vừa tạo (đường chính của M3)

```
User        API                     DB                      Audit  Events
 │ POST /places/{id}/reviews {rating, content, media_ids:[m1,m2]}
 ├─────────▶│ RequirePermissions(Review.Create)                │     │
 │          ├─ BEGIN ──────────────────────────▶│              │     │
 │          ├─ place tồn tại? ─────────────────▶│              │     │
 │          ├─ user đã review? ────────────────▶│              │     │
 │          ├─ INSERT reviews (published) ─────▶│              │     │
 │          ├─ UPDATE media SET review_id, status='published'  │     │
 │          │     WHERE ... 6 điều kiện D3 ────▶│              │     │
 │          │     affected = 2, requested = 2  ✓ (nếu ≠ → ROLLBACK 422)
 │          ├─ recalculateRating(place) ───────▶│              │     │
 │          ├─ COMMIT ─────────────────────────▶│              │     │
 │          ├─ record('review.created') ──────────────────────▶│     │
 │          ├─ record('media.auto_published') ×2 ─────────────▶│     │
 │          ├─ publish(ReviewCreated, MediaAutoPublished) ───────────▶│
 │◀─ 201 ───┤                                                        │
 │                                                                    │
 │  → Ảnh giờ nằm trong listPublishedByPlace() và HIỂN THỊ ĐƯỢC
 │    (lần đầu tiên trong lịch sử dự án)
```

### 8.2 WF-12 — người dùng báo cáo review (report đầu tiên) — **không** đổi hiển thị

```
User        API                     DB                      Audit  Events
 │ POST /reviews/{id}/report {reason, description}
 ├─────────▶│ RequirePermissions(Report.Create) · Throttle 5/min     │
 │          ├─ BEGIN ──────────────────────────▶│              │     │
 │          ├─ review tồn tại & published? ────▶│              │     │
 │          ├─ INSERT moderation_cases ON CONFLICT DO NOTHING ─▶│    │
 │          │     └─ đã có case mở → dùng lại  │              │     │
 │          ├─ INSERT reports ─────────────────▶│ (409 nếu trùng reporter)
 │          ├─ UPDATE case SET report_count+1, severity, priority ▶│ │
 │          │                                                        │
 │          │   ★ KHÔNG UPDATE reviews.status  ← O3 / INV-6         │
 │          │   ★ Review vẫn hiển thị bình thường                    │
 │          │                                                        │
 │          ├─ COMMIT ─────────────────────────▶│              │     │
 │          ├─ record('report.created') ──────────────────────▶│     │
 │          ├─ publish(ReportCreated) ───────────────────────────────▶│
 │◀─ 201 ───┤                                                        │
```

### 8.3 WF-07 — moderator ẩn một review (kèm tính lại rating)

```
Mod         API                     DB                      Audit  Events
 │ POST /moderation/cases/{id}/decide {decision:"hide", reason:"..."}
 ├─────────▶│ RequirePermissions(Review.Moderate)                    │
 │          ├─ BEGIN ──────────────────────────▶│              │     │
 │          ├─ SELECT case FOR UPDATE ─────────▶│ (409 nếu đã resolved)
 │          ├─ nạp review; assert tác giả ≠ mod ▶│ (403 nếu trùng)
 │          ├─ assertValidReviewTransition(published, hide) → hidden │
 │          ├─ assert reason khác rỗng ─────────│ (422 nếu thiếu)
 │          ├─ UPDATE reviews SET status='hidden' ▶│            │     │
 │          ├─ recalculateRating(place_id) ────▶│ ★ BẮT BUỘC — INV-4 │
 │          ├─ UPDATE case (resolved, decision, reason, by, at) ▶│   │
 │          ├─ UPDATE reports SET status='upheld' ▶│            │     │
 │          ├─ COMMIT ─────────────────────────▶│              │     │
 │          ├─ record('moderation.decided') ──────────────────▶│     │
 │          ├─ publish(ContentHidden, CaseResolved) ─────────────────▶│
 │◀─ 200 ───┤                          (KHÔNG có notification — O5/D12)
```

### 8.4 WF-18 — kiểm duyệt AI (runner thủ công, **shadow mode** ở M7)

```
CLI: npm run media:moderate [-- --dry-run]
 │
 ├─ NestFactory.createApplicationContext()      ← tiền lệ clean-orphan-media.ts
 ├─ SELECT media WHERE status='pending' AND ai_moderation_score IS NULL
 │     ORDER BY created_at ASC, id ASC LIMIT :batch
 │     (keyset cursor — bắt buộc, theo đúng bản vá phân trang của Media Orphan Cleanup)
 │
 └─ với mỗi dòng:
      ├─ score ← AiModerationPort.classify(objectKey)
      ├─ BEGIN
      ├─ UPDATE media SET ai_moderation_score, ai_labels   ← lần đầu có người ghi 2 cột ADR-009
      │
      │   ★ M7 = SHADOW MODE: KHÔNG đổi media.status, KHÔNG mở case
      │   ★ Giai đoạn sau (chưa phê duyệt): mở case source='ai_flag'
      │
      ├─ COMMIT
      └─ record('ai.media_checked')

 Idempotent: điều kiện `ai_moderation_score IS NULL` chính là chốt chặn (WF-18 "job chưa chạy").
 AI không bao giờ resolve case, không bao giờ xoá — cưỡng chế bằng quyền (INV-7).
```

---

## 9. Đặc tả API

Tôn trọng hai tên route đã đặt trước trong `openapi.yaml`, và thêm hàng chờ dưới tiền tố `/moderation`.

| Method | Path | Quyền | Mục đích | Milestone |
|---|---|---|---|---|
| `GET` | `/moderation/cases` | `Moderation.Queue.View` | Hàng chờ; lọc `status`/`target_type`/`source`/`severity`/`assigned_to`; phân trang | M2 |
| `GET` | `/moderation/cases/{id}` | `Moderation.Queue.View` | Case + các report + ảnh chụp target | M2 |
| `POST` | `/moderation/cases/{id}/claim` | `Report.Resolve` | `open → claimed` | M3 |
| `POST` | `/moderation/cases/{id}/release` | `Report.Resolve` | `claimed → open` | M3 |
| `POST` | `/moderation/cases/{id}/decide` | `Media.Moderate` / `Review.Moderate` | Resolve kèm quyết định | M3/M4 |
| `POST` | `/moderation/cases/{id}/reopen` | `Report.Resolve` | Đường quay lui | M3 |
| `POST` | `/media/{id}/moderate` | `Media.Moderate` | Quyết định trực tiếp không cần case sẵn *(stub đã có)* — tạo rồi resolve ngay một case, để **mọi** hành động đều để lại vết case | M3 |
| `POST` | `/reviews/{id}/report` | `Report.Create` | WF-12 *(stub đã có)* | M5 |
| `POST` | `/media/{id}/report` | `Report.Create` | Tương tự cho media | M5 |

### 9.1 `POST /moderation/cases/{id}/decide`

```jsonc
{
  "decision": "approve" | "reject" | "hide" | "restore" | "dismiss",
  "target_status": "published" | "pending",  // BẮT BUỘC khi decision = "restore" trên media (INV-10)
  "reason": "string",                         // BẮT BUỘC khi decision = "reject" | "hide" (INV-11)
                                              // NỘI BỘ — chỉ moderator đọc được
  "reason_code": "low_quality"                // BẮT BUỘC khi decision = "reject" trên media;
                                              // CẤM ở mọi trường hợp khác (422).
                                              // OWNER-SAFE — chủ nội dung đọc được mã này
}
```

**Hai trường lý do, hai mục đích — không thay thế nhau:**

| | `reason_code` | `reason` |
|---|---|---|
| Kiểu | enum có kiểm soát (5 giá trị) | text tự do ≤ 2000 ký tự |
| Ai đọc được | moderator **và chủ nội dung** | **chỉ moderator** (`Moderation.Queue.View`) |
| Mục đích | phân loại để chủ nội dung hiểu và sửa | ghi lại ngữ cảnh/phán đoán nội bộ |
| Lộ qua | `GET /places/{id}/media` (`PlaceOwnerMedia.rejection_reason_code`) | `GET /moderation/cases/{id}` |

**Phản hồi:** `200` EmptySuccess · `400` `reason_code` không thuộc enum · `403` tự kiểm duyệt hoặc thiếu quyền · `404` case không tồn tại · `409` case đã xử lý (moderator khác) · `422` transition không hợp lệ, thiếu `reason`, thiếu `reason_code` khi reject, `reason_code` dùng sai chỗ, hoặc thiếu/sai `target_status`.

### 9.2 `POST /reviews/{id}/report` · `POST /media/{id}/report`

```jsonc
{
  "reason": "spam" | "misinformation" | "offensive" | "irrelevant" |
            "copyright" | "personal_info" | "other",
  "description": "string"   // tuỳ chọn, tối đa 1000 ký tự, trim
}
```

**Phản hồi:** `201` · `403` thiếu quyền · `404` target không tồn tại · `409` đã báo cáo nội dung này rồi · `422` reason không hợp lệ.

> Đáp ứng thành công **không bao giờ** cho biết nội dung có bị ẩn hay không — vì theo O3 nó không bị ẩn. Không rò rỉ ngưỡng, không rò rỉ trạng thái hàng chờ.

Phân trang, phong bì lỗi, và `IdPath` tái dùng component chung sẵn có — **không** thêm quy ước phản hồi mới.

**Rate limit** (theo khuôn `MediaController`): endpoint report `5/min`; endpoint quyết định `60/min`; đọc hàng chờ `120/min`.

---

## 10. Luồng sự kiện và audit

DI token `MODERATION_EVENT_PUBLISHER`, implementation mặc định `LoggingModerationEventPublisher` (ADR-018 D12).

| Event | Phát khi | Consumer tương lai |
|---|---|---|
| `ReportCreated` | Một report được gửi | Cảnh báo moderator |
| `CaseOpened` | Bất kỳ case nào được tạo | Đo độ sâu hàng chờ |
| `MediaAutoPublished` | Media published qua đường T1 | Vô hiệu hoá cache |
| `ContentHidden` | Nội dung chuyển `hidden` | **Báo cho tác giả** (chờ ADR notifications) |
| `ContentApproved` | Nội dung chuyển `published` | Báo cho tác giả; vô hiệu hoá cache |
| `CaseResolved` | Case đóng | Đo năng suất moderator |
| `AiMediaChecked` | AI chấm điểm một item | Theo dõi độ chính xác AI |

Tất cả đều fire-and-forget và phát **sau** commit — **không bao giờ** bên trong transaction, để một lỗi ghi log không thể làm rollback một quyết định kiểm duyệt (INV-9).

**Mã audit** (`AuditService.record()`, ADR-016): `report.created`, `moderation.decided`, `moderation.report_resolved`, `ai.media_checked`, `media.auto_published`. Mỗi bản ghi mang `actor_id`, `permission`, `entity_type`, `entity_id`, `before`, `after` — đi qua `redact()` sẵn có.

---

## 11. Xử lý lỗi

| Tình huống | Hành vi |
|---|---|
| Hai moderator quyết định cùng một case | Người đầu commit; người sau nhận `409` từ bước kiểm tra lại trạng thái. Không mất cập nhật. |
| Hai người report đồng thời (chưa có case) | Partial unique index → một `INSERT` thắng, phần còn lại gắn vào case sẵn có. |
| Tính lại rating lỗi sau khi ẩn review | Cùng transaction → cả hai rollback. **Không bao giờ** có review bị ẩn mà vẫn được tính trong `rating_avg`. |
| Một `media_id` không hợp lệ trong lô | Toàn bộ transaction rollback, `422`. Không gắn một phần (INV-14). |
| Ghi audit lỗi | Ghi log và nuốt, **sau** commit; quyết định kiểm duyệt vẫn có hiệu lực. Lý do: mất một dòng audit thì tệ, nhưng âm thầm hoàn tác một lần gỡ nội dung còn tệ hơn. Đây là chỗ lệch có chủ đích so với lý tưởng của ADR-016, và được công bố. |
| Phát event lỗi | Ghi log và nuốt. Cùng lập luận. |
| AI provider không truy cập được | Runner bỏ qua dòng đó (điểm giữ `NULL`), tiếp tục lô; lần chạy sau tự nhiên thử lại — đúng chính sách "không retry trong tiến trình" của `media:cleanup`. |
| AI trả điểm sai định dạng | Bỏ qua dòng, ghi log. **Không bao giờ** hành động dựa trên phản hồi không parse được. |
| Target bị xoá trước khi case được quyết định | Case sống sót (không cascade, D9). Endpoint quyết định trả `422`; case có thể được `dismiss`. |
| Backfill làm ngập hàng chờ | Đếm và báo cáo **trước** khi chạy (MR-1); `priority` giữ việc thật sự gấp lên trên bất kể độ sâu. |

---

## 12. Mô hình bảo mật

- **Deny mặc định.** Mọi endpoint mang `@RequirePermissions`; PDP là deny-thắng (ADR-007). Không route kiểm duyệt nào công khai.
- **AI không được quyết định** (INV-7). `ai_agent` chỉ có `AI.ModerateMedia`, không bao giờ có `Media.Moderate` — ràng buộc của WF-09/WF-18 được cưỡng chế bởi mô hình phân quyền, không phải bởi kiểm tra ở tầng service.
- **Không xoá cứng ở bất kỳ đâu** (INV-8). Kiểm duyệt chỉ đổi `status`. Xoá object vẫn là đường `media:cleanup` riêng, đã có audit.
- **Xung đột lợi ích.** Chặn tự kiểm duyệt tại endpoint quyết định (§4.3, INV-12).
- **Quyền riêng tư của người báo cáo.** `reporter_id` **không bao giờ** lộ ra bề mặt mà chủ nội dung nhìn thấy được. Hàng chờ chỉ hiện danh tính người báo cáo cho người có `Moderation.Queue.View`.
- **Chống lạm dụng report.** Một report cho mỗi người trên mỗi nội dung (unique index) cộng throttle `5/min`. Báo cáo sai có hệ thống là vấn đề **chế tài** — đã hoãn (O4).
- **Chống brigading.** O3 loại bỏ hoàn toàn vector này ở nền tảng đầu: số report **không thể** đổi hiển thị, nên một nhóm phối hợp không bóp nghẹt được nội dung hợp lệ. Đây là lợi ích bảo mật trực tiếp của O3.
- **Redact.** Ảnh chụp `before`/`after` trong audit đi qua `AuditService.redact()` sẵn có.
- **Signed URL** không bao giờ được lưu, ghi log, hay đưa vào context audit (quy tắc Media Upload Foundation, không đổi).
- **Đường auto-publish (T1) không phải kênh xuất bản mở:** phải là người upload gốc, media phải còn mồ côi, và phải đi kèm việc tạo một review thật — nên mọi ảnh công khai luôn có một nội dung mẹ quy trách nhiệm được.

---

## 13. Tích hợp AI — M7 ĐÃ TRIỂN KHAI (Shadow), Assist/Auto-hide vẫn chưa xây

**M7 (Shadow) ĐÃ XONG — 2026-08-04.** Bản phác thảo gốc bên dưới (giữ nguyên cho lịch sử) hình dung
Shadow ghi thẳng vào `media.ai_moderation_score`/`ai_labels` (ADR-009). Khi xây thật, thiết kế đó
được tinh chỉnh sang MỘT bảng riêng `ai_recommendations` — xem phụ lục ADR-018 (Addendum M7) để biết
lý do đầy đủ; tóm tắt: hai cột trên `media` chỉ giữ được MỘT điểm số mỗi media (ghi đè lần chạy sau),
không có chỗ cho `moderator_decision`/`matched`/`evaluated_at` mà so sánh Shadow-vs-người-thật (mục
tiêu chính của M7) cần, và không tách được recommendation theo `case_id`/nhiều lần chạy/nhiều
provider. Bảng riêng giữ nguyên MỌI bất biến Shadow (không đổi status, không mở case, không gọi FSM)
— chỉ đổi NƠI lưu, không đổi Ý NGHĨA "chỉ quan sát, không bao giờ quyết định".

**Port đã xây** (`AiModerationProvider`, `apps/api/src/modules/moderation/ai/ai-moderation-provider.ts`) —
`recommend(input) → { provider, model, decision, confidence, labels, reasoning, promptVersion,
latencyMs, metadata }`, DI token `AI_MODERATION_PROVIDER`, implementation MẶC ĐỊNH DUY NHẤT
`LoggingAiModerationProvider` — gợi ý GIẢ, XÁC ĐỊNH (suy từ hash `targetType:targetId`), KHÔNG
OpenAI/Anthropic/HTTP ngoài nào (cùng khuôn provider-agnostic của `StorageService` mà bản phác thảo
gốc đã hình dung, chỉ khác object trả về giàu hơn `{ score, labels }` ban đầu).

`AiRecommendationsService.generateRecommendation(case)` — nhận MỘT `ModerationCase` đã tồn tại, gọi
provider, persist MỘT dòng `ai_recommendations`, KHÔNG BAO GIỜ đổi `moderation_cases`/`media`/
`reviews`, KHÔNG BAO GIỜ gọi `assertValidMediaTransition`/`assertValidReviewTransition`. Route
`POST /moderation/cases/{id}/ai-recommendation` (`AI.ModerateMedia` — quyền TÁI DÙNG, không quyền
mới, đúng D10) là nơi duy nhất kích hoạt nó (không scheduler, không auto-trigger khi case mở — thủ
công, cùng triết lý runner `npm run media:cleanup`/WF-18 gốc).

`AiRecommendationsService.evaluateModeratorDecision(caseId, decision)` — gọi từ
`ModerationService.emitPostCommit()` SAU KHI T2 commit (INV-9), try/catch RIÊNG độc lập với
audit/event: so sánh recommendation MỚI NHẤT của case với quyết định thật, ghi `matched`/
`moderator_decision`/`evaluated_at`. Đo độ chính xác so với quyết định con người đã có trong
`moderation_cases` — đúng mục tiêu Shadow ban đầu, chỉ khác cơ chế lưu.

**Lộ trình từng giai đoạn, mỗi giai đoạn đảo ngược được độc lập:**

1. **Shadow (M7) ✅ ĐÃ XONG** — chỉ ghi gợi ý + so sánh; **không** đổi status, **không** mở case. Đo độ chính xác so với các quyết định con người đã có trong `moderation_cases`. Giai đoạn này chính là thứ làm cho ngưỡng dựa trên bằng chứng thay vì phỏng đoán.
2. **Assist** *(chưa phê duyệt)* — vi phạm rõ ràng mở case ưu tiên cao; con người vẫn quyết định mọi thứ.
3. **Auto-hide** *(chưa phê duyệt)* — chỉ trên ngưỡng được biện minh bằng dữ liệu giai đoạn 1, và chỉ cho nhóm nhãn có tỉ lệ dương tính giả gần bằng 0. Luôn đảo ngược được.

**Không bao giờ tự động hoá:** xoá vĩnh viễn, chế tài người dùng, và mọi quyết định trên nội dung đang bị khiếu nại.

M7 đặt **sau cùng** theo đúng chỉ đạo Owner: shadow mode chỉ có ý nghĩa khi đã tích luỹ đủ quyết định của con người để so sánh — M6 (Moderator UI) ship trước chính vì lý do này.

*(Lựa chọn model và ngân sách thuộc [ai-architecture.md](../../ai/ai-architecture.md); [ADR-012](../../99-decisions/ADR-012-ai-architecture.md) đã Superseded.)*

---

## 14. Khả năng mở rộng

| Mối quan tâm | Đáp ứng của thiết kế |
|---|---|
| Đọc hàng chờ | Một partial index duy nhất; case đã resolve **rơi hẳn khỏi index**, nên index luôn có kích thước bằng lượng việc **đang mở**, không phải toàn bộ lịch sử |
| `priority` | Cột lưu sẵn, tính lúc ghi — **không bao giờ** là biểu thức lúc truy vấn |
| Gộp report | N report → 1 dòng hàng chờ, nên độ sâu hàng chờ bám theo số **nội dung riêng biệt**, không phải số lượt báo cáo |
| Tăng trưởng lịch sử case | Cần chính sách lưu giữ (§Còn mở) — `audit_logs` đã có, `moderation_cases` thì chưa |
| Tính lại rating | Hai subquery tổng hợp cho mỗi transition review; chấp nhận được ở khối lượng hiện tại. Nếu số review lớn lên, chuyển sang bộ đếm tăng dần — một tối ưu riêng, có lập luận đúng đắn riêng |
| Lô AI | Giới hạn bởi `batchSize`/`maxBatches`/`maxExecutionMs` + keyset cursor — đúng hình dạng `media:cleanup`, mà lỗi phân trang của nó **đã được sửa và không được tái phạm** |
| Năng suất moderator | Nút thắt thật sự. O2 giảm mạnh áp lực (ảnh hiện ngay khi gắn review, không chờ duyệt), nhưng case từ report/AI vẫn cần người |

---

## 15. Chiến lược rollback

**Vận hành** (một quyết định sai): `reopen` → quyết định lại. Mọi trạng thái FSM đều đảo ngược được theo thiết kế; `audit_logs` giữ nguyên chuỗi, kể cả lần đảo ngược.

**Triển khai** (tính năng chạy sai): các đường **đọc** không bị công việc này thay đổi, nên tắt các **endpoint** kiểm duyệt sẽ để sản phẩm đúng như hiện tại — nội dung giữ nguyên status, không có gì 500.

**Ngoại lệ quan trọng:** T1 (auto-publish) nằm trong đường tạo review, không phải một endpoint tách rời. Rollback M3 phải **giữ lại transaction** (D4) và chỉ gỡ phần `status = 'published'` trong lệnh UPDATE — quay về bản không-transaction sẽ khôi phục lỗ hổng có sẵn (RL-6).

**Schema** (`down()`): các migration đều cộng thêm và đảo ngược được — **nhưng** `down()` phải **từ chối** nếu tồn tại case đã `resolved`, thay vì âm thầm xoá lịch sử quyết định (MR-5, tiền lệ `AddMediaUploadFoundation`).

Danh sách giới hạn đầy đủ: [ADR-018 §Quyết định & Ràng buộc mục 6](../../99-decisions/ADR-018-moderation-foundation.md) (RL-1…RL-6).

---

## 16. Phân tích rủi ro

| # | Rủi ro | Khả năng | Tác động | Giảm thiểu |
|---|---|---|---|---|
| R1 | Hàng chờ không có người xử lý | Trung bình | Trung bình | **O2 đã giảm mạnh rủi ro này** — ảnh hiện ngay khi gắn vào review, không chờ ai duyệt. Còn lại chỉ là case từ report/AI, vốn ít khẩn cấp hơn nhiều |
| R2 | Backfill làm ngập hàng chờ ngày đầu | **Thấp** | Trung bình | **O7 thu hẹp mạnh phạm vi**: chỉ media đã gắn review, media mồ côi bị loại hoàn toàn. Vẫn phải đếm và báo cáo trước khi chạy (MR-1); `priority` giữ việc gấp lên trên |
| R3 | Người dùng không được báo khi nội dung bị xử lý | **Chắc chắn** | Trung bình | Chấp nhận và công bố (O5). Event đã phát, sẵn sàng cho consumer notification |
| R4 | Rating lệch nếu bỏ sót tính lại (INV-4) | Trung bình | **Cao** (âm thầm) | Ràng buộc cùng-transaction; **bắt buộc** có test hồi quy tường minh, không được giả định |
| R5 | `target_id` đa hình trỏ tới dòng không tồn tại | Trung bình | Thấp | Nợ đã chấp nhận (nhóm ADR-016); endpoint quyết định kiểm tra tồn tại và trả `422` |
| R6 | Brigading bóp nghẹt nội dung hợp lệ | **Đã loại bỏ** | — | **O3 triệt tiêu vector này**: số report không đổi được hiển thị |
| R7 | Moderator lạm quyền (tự duyệt, trả đũa) | Thấp | Cao | Chặn tự kiểm duyệt (INV-12); mọi quyết định đều audit kèm actor và permission; `System.Audit.View` đã tồn tại |
| R8 | AI dương tính giả làm ẩn nội dung tốt | **Đã loại bỏ ở M7** | — | Shadow mode **không** đổi status; giai đoạn sau chưa được phê duyệt |
| R9 | Quyết định đồng thời gây mất cập nhật | Trung bình | Trung bình | `SELECT ... FOR UPDATE` + kiểm tra lại trạng thái → `409`; partial unique index cho đua tạo case |
| R10 | Phình phạm vi sang chế tài/notification/khiếu nại | **Cao** | Trung bình | Loại trừ tường minh (O4/O5) + §Ngoài phạm vi liệt kê từng mục theo tên |
| R11 | `down()` huỷ lịch sử quyết định | Thấp | Cao | `down()` tự từ chối (MR-5) |
| R12 | T1 thay đổi hành vi của mã đã ship | **Chắc chắn** | Thấp | Là **sửa lỗi** (tạo review vốn không nguyên tử), nhưng phải ghi vào báo cáo milestone chứ không lặng lẽ (MR-7) |
| R13 | Media gắn vào review **cũ** vẫn `pending` cho tới khi có người duyệt | Chắc chắn | Thấp | **Đã giải quyết bằng D14/O7**: backfill đưa chúng vào hàng chờ ở `severity='normal'`. Vẫn vô hình tới khi moderator xử lý — đánh đổi có chủ đích (đúng đắn hơn nhanh). Lượng phải **đếm trước** khi chạy (MR-1) |
| R14 | Backfill chạy hai lần tạo case trùng | Thấp | Thấp | `ON CONFLICT DO NOTHING` trên partial unique index → idempotent theo cấu trúc (T4) |

---

## 17. Tiêu chí nghiệm thu

**Chức năng**

1. `POST /media` **không bao giờ** đặt `status = 'published'` (kiểm chứng trực tiếp trên DB sau khi gọi).
2. Tạo review kèm media hợp lệ → media chuyển `published` **và** xuất hiện trong `listPublishedByPlace()` — **ảnh thật sự hiển thị**, kiểm chứng end-to-end với một lần upload thật.
3. Tạo review kèm một `media_id` không hợp lệ (sai chủ, đã gắn, không tồn tại, hoặc `object_key IS NULL`) → `422`, **không** review nào được tạo, **toàn bộ** media giữ `pending`.
4. Tạo review thất bại ở bước kiểm tra trùng → media giữ `pending` và mồ côi.
5. Media không bao giờ được gắn → giữ `pending` và cuối cùng đủ điều kiện cho `media:cleanup`.
6. `moderator` liệt kê, claim, release, quyết định, và reopen được case.
7. `restore` media **không kèm** `target_status` → `422`.
8. `restore` media kèm `target_status='pending'` → media về `pending`, xuất hiện lại trong hàng chờ.
9. `published → rejected` → `422` (INV-13).
10. `reject`/`hide` không kèm `reason` → `422`.
11. Ẩn một review → biến mất khỏi danh sách review **và** `rating_avg`/`rating_count` đổi trong cùng transaction. Khôi phục → cả hai trở lại.
12. **N report trên cùng một nội dung tạo đúng MỘT case mở** với `report_count = N`.
13. **≥3 report nâng `severity` lên `high` và đẩy case lên cao trong hàng chờ, NHƯNG `reviews.status`/`media.status` KHÔNG đổi** (INV-6 — tiêu chí quan trọng nhất của O3).
14. Report thứ hai từ cùng một người trên cùng nội dung → `409`.
15. Moderator không quyết định được case trên nội dung của chính mình → `403`.
16. Quyết định một case đã resolved → `409`.
17. `ai_agent` không resolve được case → `403`; runner AI idempotent qua nhiều lần chạy liên tiếp.
18. Mỗi quyết định ghi đúng **một** dòng `audit_logs` kèm actor, permission, before/after.

**Backfill (T4 / D14 / O7)**

19. Backfill tạo đúng **một** case `open`/`new_content`/`normal` cho mỗi media thoả `status='pending' AND review_id IS NOT NULL AND deleted_at IS NULL`.
20. Backfill **không đổi một dòng `media.status` nào** — kiểm chứng bằng cách so `count(*) WHERE status='pending'` trước và sau: **bằng nhau**.
21. Media **mồ côi** (`review_id IS NULL`) **không** sinh case nào.
22. Media đã có case mở sẵn **không** sinh case thứ hai (INV-3 giữ nguyên).
23. Chạy backfill **hai lần liên tiếp** cho kết quả y hệt chạy một lần (`created_count = 0` ở lần hai) — kiểm chứng thật, không suy luận.
24. Backfill ghi đúng **một** dòng `audit_logs` `moderation.backfilled` kèm `candidate_count` và `created_count`.
25. Số ứng viên được **đếm và báo cáo trước** khi chạy `up()`, và có mặt trong báo cáo milestone M3.

**Phi chức năng**

26. Đọc hàng chờ dùng đúng partial index (kiểm chứng bằng `EXPLAIN`, không giả định).
27. **Không** đường đọc công khai nào join `moderation_cases` (kiểm chứng bằng grep/review, INV-1).
28. Không thêm dependency nào vào `apps/api/package.json`.
29. Migration qua được diễn tập revert → verify → reapply trên DB dev thật (tiền lệ PLACE-042).
30. Build/typecheck/lint toàn monorepo xanh; unit + e2e backend xanh, **không hồi quy**.

---

## 18. Lộ trình triển khai

Thứ tự theo đúng chỉ đạo Owner (yêu cầu sửa đổi #6). Mỗi milestone ship được độc lập, kiểm chứng được độc lập, và chạm vào một mối quan tâm.

| # | Milestone | Phạm vi | Phụ thuộc | Cỡ |
|---|---|---|---|---|
| **M1** | **Moderation Schema Foundation** ✅ **ĐÃ XONG — 2026-08-02** | Migration `InitModeration` + `SeedModerationPermissions`; entity; enum; **hai module FSM thuần** (media + review) kèm unit test đầy đủ cho mọi transition hợp lệ/không hợp lệ. **Không endpoint.** | — | S |
| **M2** | **Moderation Queue Read API** ✅ **ĐÃ XONG — 2026-08-02** | `GET /moderation/cases`, `GET /moderation/cases/{id}`; repository + phân trang + lọc; đấu nối quyền. **Chỉ đọc — không đổi được nội dung.** | M1 | S |
| **M3** | **Media Decision Workflow + auto-publish khi gắn review** ✅ **ĐÃ XONG — 2026-08-02** | `decide` cho target media (`POST /moderation/cases/{id}/decide`, không `claim`/`release`/`reopen`, không `POST /media/{id}/moderate`); **transaction T1** (D4 + auto-publish O2); **transaction T2** (quyết định kiểm duyệt); **`BackfillModerationCases` theo T4/D14** (đếm-rồi-báo-cáo trước khi chạy, diễn tập apply/revert/reapply trên dữ liệu thật); audit + event. **Đây là milestone làm ảnh hiển thị được.** | M2 | M |
| **M4** | **Review Decision Workflow + tính lại rating trong transaction** ✅ **ĐÃ XONG — 2026-08-03** | `decide` cho target review (hide/restore/approve qua `assertValidReviewTransition`, không thêm `rejected`); quyền `Review.Moderate` chọn theo target_type, không dùng lẫn với `Media.Moderate`; **cộng ràng buộc INV-4** (recalculateRating trong cùng transaction, rollback sống đã diễn tập) **và test hồi quy cho nó**. | M3 | M |
| **M5** | **User Reporting** ✅ **ĐÃ XONG — 2026-08-03** | `POST /reviews/{id}/report`, `POST /media/{id}/report`; gộp case; chống trùng; nâng `severity`/`priority`. **Không** đổi hiển thị (O3). | M4 | M |
| **M6** | **Moderator UI** ✅ **ĐÃ XONG — 2026-08-04** | Frontend hàng chờ tại `/dashboard/moderation`; danh sách, chi tiết, quyết định. Tái dùng mẫu card/filter/pagination sẵn có và baseline accessibility. | M3 | M |
| **M7** | **AI Shadow Mode** ✅ **ĐÃ XONG — 2026-08-04** | Bảng mới `ai_recommendations` (tinh chỉnh so với phác thảo §13 gốc — xem ADR-018 Addendum M7); `AiModerationProvider`/`AI_MODERATION_PROVIDER`/`LoggingAiModerationProvider`; `POST`/`GET /moderation/cases/{id}/ai-recommendation` (tái dùng `AI.ModerateMedia`/`Moderation.Queue.View`, không quyền mới); `evaluateModeratorDecision()` sau commit T2; thống kê agreement/confidence/false-positive/negative (repository + service only). **Chỉ shadow** — **không** đổi status, **không** mở case, **không** gọi FSM. | M4, M6 (đủ lượng quyết định của con người để so sánh) | M |

**Lý do thứ tự.** M3 trước M4 vì media là lỗ hổng **đang chặn** (ảnh vô hình) trong khi review đã hoạt động bình thường. M5 sau cả hai vì báo cáo vô nghĩa khi chưa quyết định được. M6 trước M7 vì UI tạo ra chính khối lượng quyết định-của-con-người mà M7 cần để đo độ chính xác — đảo ngược thứ tự sẽ khiến shadow mode không có gì để so sánh, đúng điều Owner chỉ ra.

**M1 và M2 bắt đầu được ngay**, không cần thêm quyết định Owner nào. **O7** chỉ chặn bước backfill của M3, không chặn phần thân M3.

---

*Liên quan: [ADR-018](../../99-decisions/ADR-018-moderation-foundation.md) · [moderation.md](../../workflow/moderation.md) · [ADR-009](../../99-decisions/ADR-009-media-model.md) · [ADR-016](../../99-decisions/ADR-016-audit-log-model.md) · [media.md](./media.md)*
