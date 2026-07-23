# PhuQuocHub — Kiến trúc AI (AI Architecture)

> **Mục đích:** thiết kế **kiến trúc kỹ thuật** cho toàn bộ năng lực AI của PhuQuocHub. Tài liệu **chỉ thiết kế** (không code; đoạn hợp đồng/pseudo chỉ để minh họa). Bổ sung cho đặc tả **sản phẩm** ở [ai-assistant.md](../product/modules/ai-assistant.md); tuân **RBAC AI Agent** ([rbac.md §4.10](../security/rbac.md)) và hợp đồng [api.md §21](../api/api.md).

---

## 1. Mục tiêu & phạm vi

Cung cấp một **nền tảng AI thống nhất** phục vụ ba trụ cột (tri thức · cộng đồng · bản đồ):

- **Làm giàu tri thức:** tóm tắt, FAQ, dịch song ngữ cho địa điểm.
- **Trợ giúp khám phá:** gợi ý (recommendation), trợ lý hội thoại (chat), tìm kiếm ngữ nghĩa (RAG).
- **Bảo vệ chất lượng:** kiểm duyệt hỗ trợ (spam, ảnh, review giả).

**9 dịch vụ AI** (mục 4) + **6 hạ tầng** (mục 5), vận hành dưới nguyên tắc **human-in-the-loop** và **kiểm soát chi phí**.

**Ngoài phạm vi:** AI tự động ra quyết định cuối (publish/verify/delete); huấn luyện/fine-tune model riêng (giai đoạn sau); cá nhân hóa nặng bằng ML.

## 2. Nguyên tắc thiết kế

1. **Con người kiểm soát AI.** Mọi đầu ra AI là **`pending`/nháp**; người duyệt trước khi công khai. AI **KHÔNG** `Publish/Approve/Verify/Delete` ([rbac.md §4.10](../security/rbac.md)).
2. **Provenance đầy đủ.** Mọi kết quả gắn `source=ai`, `model`, `prompt_version`, `source_hash`, thời điểm — truy vết & tái tạo được ([source.md](../data/modules/source.md), [places.md §9](../data/modules/places.md)).
3. **Model-agnostic.** Dịch vụ định nghĩa theo **năng lực** (capability), không khóa cứng một model — đổi model/provider không đổi hợp đồng.
4. **Cost-aware.** Bất đồng bộ (`202 + job_id`), rate-limit theo **ngân sách**, tái dùng theo `source_hash`, chọn model rẻ nhất đủ dùng.
5. **Grounded (chống bịa).** Chat/RAG **chỉ** dựa nội dung `published` + có nguồn; luôn **trích dẫn**; không đủ dữ liệu → nói không biết / gợi ý đóng góp.
6. **Privacy-first.** Không đưa PII vào prompt/log; chỉ dùng dữ liệu công khai/tổng hợp; token AI hẹp, audited.
7. **Idempotent & resilient.** Job nền idempotent; có **fallback** khi model lỗi/quá tải/vượt ngân sách.
8. **Deny-by-default.** Mọi endpoint AI kiểm permission (`AI.*`) + rate limit chặt; AI principal tách khỏi nhánh quyền con người.

## 3. Kiến trúc tổng thể

```
        Người dùng / Contributor / Moderator / Hệ thống (trigger)
                              │ (đồng bộ cho Chat; 202+job cho tác vụ nền)
                              ▼
                 ┌──────────────────────────┐
                 │   AI GATEWAY / ORCHESTRATOR│  authN·permission(AI.*)·rate/budget·idempotency(source_hash)
                 └─────────────┬────────────┘
          ┌───────────────────┼─────────────────────┐
          ▼                   ▼                       ▼
   ┌────────────┐     ┌────────────────┐      ┌────────────────┐
   │ PROMPT LIB │────►│ MODEL ROUTER    │◄────►│ COST CONTROL   │ budget·quota·kill-switch
   │ (template+ │     │ (Model Select)  │      └────────────────┘
   │  version)  │     └───────┬─────────┘
   └────────────┘             ▼
                     ┌──────────────────┐   fallback   ┌──────────────────┐
                     │ MODEL PROVIDERS  │─────────────►│ FALLBACK CHAIN    │ model rẻ hơn·cache·suy biến an toàn
                     │ Claude · embed…  │              └──────────────────┘
                     └───────┬──────────┘
        (RAG)                ▼
  ┌───────────────┐   truy hồi ngữ cảnh   ┌──────────────────────────────┐
  │ KNOWLEDGE BASE│◄────────────────────►│ RETRIEVER (Semantic+Keyword) │──► [search.md §4.8]
  │ published data│                      └───────────────┬──────────────┘
  └──────┬────────┘                                      ▼
         │ embedding (source_hash)                ┌──────────────┐
         └──────────────────────────────────────►│ VECTOR DB     │ pgvector → vector store
                                                  └──────────────┘
                              │ đầu ra
                              ▼
              ┌──────────────────────────────┐
              │  POST-PROCESS + PROVENANCE    │ gắn source=ai·model·prompt_version
              └───────────────┬──────────────┘
                              ▼
              ┌──────────────────────────────┐   audit + metrics + cost log
              │  PENDING  → MODERATION (người) │──► publish (WF-08/09/18)
              └──────────────────────────────┘
```

**Thành phần logic:**

| Thành phần | Vai trò |
|---|---|
| **AI Gateway/Orchestrator** | Điểm vào: xác thực, kiểm `AI.*`, rate/budget, **idempotency theo `source_hash`**, điều phối job (BullMQ). |
| **Prompt Library** | Kho **template prompt có phiên bản** theo tác vụ/ngôn ngữ. |
| **Model Router (Model Selection)** | Chọn model theo tác vụ/độ khó/chi phí; áp fallback. |
| **Model Providers** | Nhà cung cấp LLM & embedding (mặc định họ **Claude**). |
| **Retriever** | Truy hồi ngữ cảnh (Semantic + Keyword) từ Knowledge Base — dùng chung engine [search.md](../architecture/search.md). |
| **Knowledge Base** | Nội dung `published` + nguồn làm ngữ cảnh cho RAG/Chat. |
| **Vector DB** | Lưu embedding cho tìm ngữ nghĩa (extension point — [database.md §13](../data/database.md)). |
| **Cost Control** | Ngân sách, quota, kill-switch, đo chi phí/tác vụ. |
| **Fallback Chain** | Suy biến an toàn khi lỗi/quá tải/vượt ngân sách. |
| **Post-process + Provenance** | Chuẩn hóa đầu ra, gắn provenance, tạo bản ghi `pending`. |
| **Moderation** | Người duyệt đầu ra AI trước khi công khai ([moderation.md](../workflow/moderation.md)). |

## 4. Các dịch vụ AI

> Mỗi dịch vụ mô tả theo: **Mục tiêu · Đầu vào/ra · Luồng · Model gợi ý · Provenance/Trạng thái · Ràng buộc.**

### 4.1 AI Summary
- **Mục tiêu:** sinh **tóm tắt + highlights** cho địa điểm từ nội dung đã có.
- **Đầu vào/ra:** vào = nội dung Place (`name/description/faq…`), `language`; ra = `summary` + `highlights[]`.
- **Luồng:** trigger (`AI.Assist`) → `202+job` → prompt(summary\@version) → model → post-process → `place_ai_summary(status=ready, is_approved=false)` → Moderator duyệt ([WF-08/09](../workflow/moderation.md)).
- **Model gợi ý:** tầng cân bằng (Sonnet) cho chất lượng/chi phí.
- **Provenance/Trạng thái:** `model`, `prompt_version`, `source_hash`, `status ∈ {generating, ready, stale, rejected}`, `is_approved`.
- **Ràng buộc:** chỉ hiển thị sau duyệt (nhãn "AI tóm tắt"); `stale` khi `source_hash` đổi → sinh lại.

### 4.2 AI Translation
- **Mục tiêu:** dịch **song ngữ vi/en** cho nội dung (mô tả Place, menu, FAQ, bài viết).
- **Đầu vào/ra:** vào = `text | entity_ref`, `target_lang`; ra = bản dịch (+ giữ định dạng/thuật ngữ riêng).
- **Luồng:** trigger (`AI.Translate`) → prompt(translate\@version) → model → bản dịch `pending` (gắn ngôn ngữ).
- **Model gợi ý:** tầng rẻ/nhanh (Haiku) cho câu ngắn; Sonnet cho nội dung dài/nhạy ngữ cảnh.
- **Provenance/Trạng thái:** như Summary; lưu theo khóa `(entity, language)`.
- **Ràng buộc:** không dịch sai địa danh/tên riêng Phú Quốc (glossary thuật ngữ trong prompt); bản dịch là **nội dung song song**, không ghi đè bản gốc.

### 4.3 AI Recommendation
- **Mục tiêu:** gợi ý **địa điểm/lịch trình/nội dung liên quan** ("gần đây nên đi đâu", "1 ngày ở Bắc đảo").
- **Đầu vào/ra:** vào = ngữ cảnh (vị trí, danh mục đang xem, mùa/thời tiết); ra = danh sách thực thể + lý do gợi ý.
- **Luồng:** kết hợp **tín hiệu có sẵn** (popular_places, geo nearby, rating) + (tùy chọn) LLM diễn giải/lịch trình → thẻ Place.
- **Model gợi ý:** phần lớn **không cần LLM** (dùng ranking/geo); LLM chỉ để tổng hợp lịch trình/diễn giải.
- **Provenance/Trạng thái:** gợi ý thời gian thực (không lưu bền); nếu tạo nội dung (vd lịch trình lưu lại) → `pending`.
- **Ràng buộc:** chỉ gợi ý thực thể `published`; **không** thiên vị trả phí (công bằng — [vision.md §5](../overview/vision.md)); minh bạch lý do.

### 4.4 AI Moderation
- **Mục tiêu:** **hỗ trợ** kiểm duyệt — phát hiện spam/độc hại (text), ảnh không phù hợp, **review giả**.
- **Đầu vào/ra:** vào = review/comment/post/ảnh; ra = **điểm rủi ro + nhãn đề xuất** (không phải quyết định).
- **Luồng:** nội dung mới → AI check ([WF-18](../workflow/moderation.md)) → gắn cờ `pending`/đề xuất → **Moderator quyết định cuối**.
- **Model gợi ý:** tầng rẻ/nhanh (Haiku) + bộ phân loại chuyên biệt; ảnh dùng model thị giác/dịch vụ kiểm duyệt ảnh.
- **Provenance/Trạng thái:** ghi điểm/nhãn + model + thời điểm; **là đề xuất**, không tự ẩn/xóa.
- **Ràng buộc:** **không** tự động chế tài; giữ tỉ lệ false-positive thấp; con người là chốt chặn cuối.

### 4.5 AI Chat
- **Mục tiêu:** trợ lý **hội thoại** cho người dùng ("Hỏi PhuQuocHub AI") — trả lời tự nhiên, có dẫn nguồn (trang AI [P12](../product/discovery.md)).
- **Đầu vào/ra:** vào = câu hỏi tự nhiên (+ vị trí, lịch sử hội thoại); ra = câu trả lời + **thẻ Place + trích nguồn**.
- **Luồng:** câu hỏi → **RAG** (4.6) truy hồi ngữ cảnh → LLM tổng hợp → trả lời + nguồn (đồng bộ/streaming); thiếu dữ liệu → gợi ý đóng góp.
- **Model gợi ý:** tầng cao (Opus) cho suy luận/lịch trình phức; Sonnet cho hỏi đáp thường.
- **Provenance/Trạng thái:** trả lời **thời gian thực**, không lưu bền như nội dung Place; ghi log tổng hợp (không PII).
- **Ràng buộc:** **grounded** — chỉ trích nội dung có thật `published`; không tư vấn tài chính/pháp lý cá nhân hóa; nhãn "AI tạo — có thể chưa chính xác".

### 4.6 AI RAG (Retrieval-Augmented Generation)
- **Mục tiêu:** **khung nền** cho Chat & tìm kiếm ngữ nghĩa — truy hồi ngữ cảnh liên quan rồi mới sinh.
- **Đầu vào/ra:** vào = truy vấn/câu hỏi; ra = **top-K đoạn ngữ cảnh + nguồn** → đưa vào prompt.
- **Luồng:** `query → embed → Vector DB (ANN) ∪ Keyword FTS → hợp nhất (hybrid RRF) → lọc published → chèn ngữ cảnh + trích dẫn → LLM`.
- **Model gợi ý:** embedding model (4.7) cho truy hồi; LLM sinh tùy tác vụ.
- **Provenance/Trạng thái:** mỗi câu trả lời kèm **danh sách nguồn** (place_id/URL); cache ngữ cảnh cho câu hỏi phổ biến.
- **Ràng buộc:** dùng chung Retriever với [search.md §4.8/§7](../architecture/search.md); ngưỡng tương đồng tối thiểu; **không** đưa nội dung chưa duyệt vào ngữ cảnh.

### 4.7 Embedding
- **Mục tiêu:** biến nội dung/truy vấn thành **vector** để tìm theo ý nghĩa.
- **Đầu vào/ra:** vào = văn bản (nội dung thực thể / câu hỏi); ra = vector embedding.
- **Luồng:** khi thực thể `published`/đổi → job nhúng (idempotent, gắn `source_hash`) → lưu Vector DB; truy vấn → nhúng tại chỗ (cache prompt phổ biến).
- **Model gợi ý:** embedding model chuyên dụng (provider-agnostic); cố định **một model + kích thước vector** trong một index.
- **Provenance/Trạng thái:** `embedding_model`, `dim`, `source_hash`; **chỉ nhúng lại khi nội dung đổi** (tiết kiệm chi phí).
- **Ràng buộc:** đổi embedding model = **reindex vector** (không trộn hai không gian vector); là **extension point** — chi tiết cột/bảng để giai đoạn bật Semantic ([database.md §13](../data/database.md)).

### 4.8 Prompt Library
- **Mục tiêu:** **kho template prompt** chuẩn hóa theo tác vụ, ngôn ngữ, có phiên bản — nguồn sự thật cho mọi lời gọi model.
- **Đầu vào/ra:** vào = tên tác vụ + biến ngữ cảnh; ra = prompt đã dựng (system + user + guardrails).
- **Luồng:** dịch vụ AI **không** nhúng prompt cứng — luôn lấy từ Library theo `task + version + language`.
- **Cấu trúc template:** `{system, instruction, input_slots, output_schema, guardrails, examples?, prompt_version}`.
- **Provenance/Trạng thái:** mỗi lời gọi ghi `prompt_version` đã dùng → tái tạo & so sánh A/B.
- **Ràng buộc:** guardrails cố định (chống bịa, chống lộ PII, giữ nhãn AI); thay đổi prompt = **tạo version mới** (mục 5.3), không sửa tại chỗ bản đang chạy.

### 4.9 Model Selection
- **Mục tiêu:** **định tuyến** mỗi tác vụ tới model phù hợp nhất về **chất lượng/chi phí/độ trễ**.
- **Đầu vào/ra:** vào = loại tác vụ, độ khó/độ dài, ngân sách, SLA; ra = model được chọn (+ fallback).
- **Luồng (chính sách tiering):**

| Tầng | Dùng cho | Định hướng model |
|---|---|---|
| **Rẻ/nhanh** | moderation, phân loại, dịch câu ngắn, autocomplete-hint | Claude **Haiku** |
| **Cân bằng** | summary, FAQ, dịch dài, chat thường | Claude **Sonnet** |
| **Cao cấp** | suy luận phức, lịch trình, chat khó | Claude **Opus** |
| **Embedding** | RAG/Semantic | embedding model chuyên dụng |

- **Provenance/Trạng thái:** ghi `model` thực dùng cho mọi kết quả; chính sách routing là **cấu hình** (không hardcode).
- **Ràng buộc:** mặc định **model Claude mới nhất & đủ mạnh** cho tác vụ; nâng/hạ tầng khi vượt ngân sách; ghép **Cost Control** + **Fallback**.

## 5. Hạ tầng

### 5.1 Vector Database
- **Vai trò:** lưu & truy vấn **ANN** trên embedding phục vụ RAG/Semantic.
- **Công nghệ:** **`pgvector`** giai đoạn đầu (HNSW/IVFFlat) → **vector store chuyên dụng** khi quy mô lớn — nhất quán [search.md §7/§12](../architecture/search.md).
- **Nguyên tắc:** một index = một embedding model + một `dim`; **extension point**, chưa khai báo schema chi tiết ([database.md §13](../data/database.md)); reindex được từ Knowledge Base (dẫn xuất).
- **Vận hành:** cập nhật khi nội dung `published`/đổi (theo `source_hash`); rút vector khi thực thể rời `published`.

### 5.2 Knowledge Base
- **Vai trò:** **nguồn sự thật** cho RAG/Chat — nội dung `published` + có nguồn (Place + chuyên biệt, FAQ, Event, Community chất lượng).
- **Nguyên tắc:** **chỉ** nội dung công khai đã duyệt; mỗi mẩu ngữ cảnh mang **nguồn** (provenance) để trích dẫn; không đưa `draft/pending` vào KB.
- **Đồng bộ:** pipeline chunk hóa → embedding → Vector DB; cập nhật near-real-time theo workflow duyệt; là **dẫn xuất** của Postgres (tái tạo được).
- **Chất lượng:** ưu tiên nội dung `verified/official`; gắn `updated_at` để ưu tiên độ tươi; câu hỏi lặp/0-kết-quả → tín hiệu **bổ sung KB** (biên tập/AI, [WF-19](../workflow/contribution.md)).

### 5.3 Prompt Version
- **Vai trò:** **quản lý phiên bản** cho template ở Prompt Library.
- **Nguyên tắc:** prompt **bất biến sau khi phát hành** — thay đổi = version mới (`prompt_version` tăng); bản ghi kết quả trỏ tới version đã dùng.
- **Vòng đời:** `draft → staged (A/B) → active → deprecated`; rollback = kích hoạt lại version cũ (không mất lịch sử).
- **Đánh giá:** so sánh version bằng eval offline (chất lượng, tỉ lệ bị Moderator sửa) + A/B; chỉ **active** một version mặc định/tác vụ.
- **Liên kết:** `prompt_version` xuất hiện trong provenance mọi đầu ra ([places.md §9](../data/modules/places.md)).

### 5.4 Model Version
- **Vai trò:** **ghim & quản lý phiên bản model** (LLM + embedding).
- **Nguyên tắc:** ghim model theo tác vụ (không "trôi" ngầm); nâng version qua quy trình có eval; ghi `model` (gồm version) vào mọi kết quả.
- **Di trú (migration):** khi đổi LLM → chạy eval hồi quy trước khi chuyển active; khi đổi **embedding model → bắt buộc reindex Vector DB** (5.1).
- **Tương thích:** giữ khả năng chạy song song (canary) model mới trên phần nhỏ lưu lượng trước khi chuyển toàn phần.
- **Ghi chú:** danh sách model & lý do chọn tham chiếu [tech-stack.md](../architecture/tech-stack.md) (bổ sung khi chốt).

### 5.5 Cost Control
- **Vai trò:** giữ chi phí AI trong **ngân sách**, chống lạm dụng.
- **Cơ chế:**
  - **Bất đồng bộ** (`202 + job`) + hàng đợi (BullMQ) → không chặn UX, dễ điều tiết.
  - **Rate-limit theo ngân sách** (per user / per place / per phút) — rất chặt cho endpoint AI ([api.md §21](../api/api.md)).
  - **Tái dùng theo `source_hash`** — không sinh lại khi nội dung không đổi.
  - **Model tiering** — chọn model rẻ nhất đủ dùng (5.6/4.9).
  - **Đo & hạn mức** — ghi token/chi phí mỗi tác vụ; **kill-switch**/degrade khi vượt ngưỡng.
- **KPI:** chi phí / nội dung **được duyệt** (không tính đầu ra bị loại), tỉ lệ cache/`source_hash` hit.

### 5.6 Fallback
- **Vai trò:** **suy biến an toàn** khi model lỗi/timeout/quá tải/vượt ngân sách.
- **Chuỗi fallback:**
  1. **Retry** có backoff (idempotent) trong ngưỡng ngắn.
  2. **Hạ tầng model** (Opus→Sonnet→Haiku) nếu tác vụ cho phép.
  3. **Cache/`source_hash`** — trả kết quả gần nhất còn hợp lệ.
  4. **Suy biến không-AI** — vd Chat trả **kết quả Search thường** + lời nhắc; Summary hiển thị mô tả gốc; Moderation chuyển **toàn bộ sang hàng chờ người**.
  5. **Thông báo & audit** — ghi sự cố; không "im lặng thất bại".
- **Nguyên tắc:** fallback **không** hạ chuẩn an toàn (không tự publish, không bỏ kiểm duyệt); ưu tiên "đúng & an toàn" hơn "có câu trả lời".

## 6. Bảo mật & phân quyền

- **AI Agent = service principal** (phi con người), scope hẹp `AI.*` (`GenerateSummary/GenerateFAQ/Translate/SuggestCategory/DetectSpam/Assist`), **KHÔNG** kế thừa vai trò con người, **KHÔNG** `Publish/Approve/Verify/Delete` ([rbac.md §4.10](../security/rbac.md)).
- **Ghi tạm chỉ nháp:** AI tạo `Revision(origin=ai_generation, status=pending)`, `place_ai_summary(is_approved=false)`, nguồn `ai` — chờ người duyệt.
- **Token:** phạm vi hẹp, thời hạn ngắn, rate-limited, **audited** (mọi lời gọi ghi: tác vụ, model, prompt_version, chi phí, kết quả).
- **Privacy:** không đưa PII vào prompt/log; chỉ dùng nội dung công khai/tổng hợp; tuân [security.md](../architecture/security.md) (PEP→PDP).

## 7. Vòng đời tác vụ & quan sát (observability)

- **Vòng đời:** `request → (permission+budget) → enqueue → prompt(build) → model(call+fallback) → post-process(provenance) → pending → moderation → published/rejected`.
- **Idempotency:** khóa theo `(task, entity, source_hash, prompt_version, model)` → chống chạy trùng; `stale` khi nội dung đổi.
- **Metrics:** độ trễ, tỉ lệ lỗi/fallback, token & chi phí, tỉ lệ đầu ra **được duyệt / bị sửa / bị loại**, tỉ lệ cache hit — feed dashboard vận hành ([admin P13](../product/admin.md)).
- **Audit:** hành động đặc quyền AI (đổi model active, prompt version, cấu hình routing) ghi audit; tách khỏi log nội dung.

## 8. Lộ trình tiến hóa

| Giai đoạn | Dịch vụ bật | Hạ tầng |
|---|---|---|
| **1 — MVP** | Summary, Translation, Moderation (hỗ trợ) | Prompt Library + Version; Model Selection (tiering); Cost Control; Fallback; **chưa** Vector DB |
| **2 — Tăng trưởng** | + Embedding, RAG, Chat, Recommendation | + **Vector DB (`pgvector`)** + Knowledge Base; Semantic Search bật ([search.md §12](../architecture/search.md)) |
| **3 — Quy mô lớn** | + Cá nhân hóa nhẹ, moderation tự động hóa cao hơn (vẫn có người) | Vector store chuyên dụng; canary model; tối ưu chi phí |

**Bất biến:** hợp đồng dịch vụ AI ([api.md §21](../api/api.md)) không đổi khi thay model/hạ tầng.

## 9. Quyết định cần chốt

1. **Thời điểm bật Vector DB/RAG** — từ MVP (pgvector) hay giai đoạn 2 (đánh đổi chi phí/độ phức tạp)?
2. **Danh sách model & tiering khởi tạo** — model cho từng tầng + embedding model + `dim`.
3. **Kho lưu Prompt Library** — trong DB (bảng `prompts`/`prompt_versions`) hay file cấu hình versioned? *(là thực thể mới — cần phê duyệt trước khi thêm vào [data/](../data/database.md).)*
4. **Ngân sách AI** — hạn mức per user/place/tháng, ngưỡng kill-switch.
5. **Chính sách chunk hóa Knowledge Base** — kích thước chunk, overlap, đơn vị trích dẫn.
6. **Ngưỡng moderation tự động** — điểm rủi ro nào auto gắn cờ vs chuyển thẳng người.

## 10. Ghi chú phạm vi dữ liệu

Tài liệu này **không tạo thực thể/schema mới**. Các cấu trúc dữ liệu liên quan đã/sẽ định nghĩa ở nơi khác:
- `place_ai_summary` (đã có) — [places.md §9](../data/modules/places.md).
- Vector embedding — **extension point** [database.md §13](../data/database.md) (chưa khai báo cột/bảng).
- `prompts`/`prompt_versions`, `ai_jobs`/`ai_usage` (nếu cần bền hóa Prompt Library & log chi phí) — **chưa phê duyệt**; nếu triển khai sẽ **hỏi trước** và bổ sung vào `docs/data/` theo đúng quy trình.

---

*Tài liệu liên quan: [ai-assistant.md](../product/modules/ai-assistant.md), [rbac.md](../security/rbac.md) §4.10, [api.md](../api/api.md) §21, [search.md](../architecture/search.md) §4.8/§7/§12, [database.md](../data/database.md) §13, [places.md](../data/modules/places.md) §9, [source.md](../data/modules/source.md), [moderation.md](../workflow/moderation.md) (WF-08/09/18), [security.md](../architecture/security.md), [tech-stack.md](../architecture/tech-stack.md), [vision.md](../overview/vision.md) §6.*
