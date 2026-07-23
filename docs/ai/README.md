# PhuQuocHub — [05·AI] Kiến trúc AI (AI Architecture)

> **Mục đích:** điểm vào cho nhóm tài liệu **[05·AI]**. Thiết kế **kiến trúc AI** của PhuQuocHub — các dịch vụ AI và hạ tầng vận hành chúng. Tài liệu **chỉ thiết kế** (không code), tiếng Việt.

## 1. Tài liệu trong nhóm

| Tài liệu | Nội dung |
|---|---|
| [ai-architecture.md](ai-architecture.md) | **Tài liệu chính** — 9 dịch vụ AI + 6 hạ tầng, kiến trúc tổng thể, bảo mật, lộ trình |

## 2. Phạm vi

**9 dịch vụ AI:** AI Summary · AI Translation · AI Recommendation · AI Moderation · AI Chat · AI RAG · Embedding · Prompt Library · Model Selection.

**6 hạ tầng:** Vector Database · Knowledge Base · Prompt Version · Model Version · Cost Control · Fallback.

## 3. Nguyên tắc chủ đạo (tóm tắt)

- **Human-in-the-loop tuyệt đối** — mọi đầu ra AI ở trạng thái `pending`, người duyệt trước khi công khai ([rbac.md §4.10](../security/rbac.md)).
- **Provenance đầy đủ** — `source=ai`, `model`, `prompt_version`, `source_hash` ([places.md §9](../data/modules/places.md), [source.md](../data/modules/source.md)).
- **Model-agnostic** — đổi model/provider không đổi hợp đồng dịch vụ.
- **Cost-aware & idempotent** — bất đồng bộ (202 + job), rate-limit theo ngân sách, tái dùng theo `source_hash`.
- **Privacy-first** — không đưa PII vào prompt/log; chỉ dùng nội dung `published`.

## 4. Quan hệ tài liệu

- Đặc tả **sản phẩm** AI: [product/modules/ai-assistant.md](../product/modules/ai-assistant.md).
- **Semantic Search / RAG retrieval:** [architecture/search.md](../architecture/search.md) §4.8, §7, §12.
- **Điểm mở rộng dữ liệu** (vector, `place_ai_summary`): [data/database.md §13](../data/database.md), [places.md §9](../data/modules/places.md).
- **Hợp đồng API AI:** [api/api.md §21](../api/api.md).
- **Kiểm duyệt đầu ra AI:** [workflow/moderation.md](../workflow/moderation.md) (WF-08/09/18).

---

*Cập nhật index này khi thêm tài liệu vào `docs/ai/`.*
