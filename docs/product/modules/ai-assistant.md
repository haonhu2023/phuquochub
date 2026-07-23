# Module 10 — AI Assistant (Trợ lý AI)

> **Product Spec** — AI Assistant là **service principal (phi con người)** hỗ trợ xuyên suốt: sinh nội dung nháp (tóm tắt, FAQ, dịch), hỗ trợ kiểm duyệt (phát hiện spam/ảnh xấu/review giả), và gợi ý (phân loại, địa điểm mới). Nguyên tắc tối thượng: **con người kiểm soát AI — mọi đầu ra AI đều `pending` chờ người duyệt** ([rbac.md §4.10](../../security/rbac.md), [vision.md §6](../../overview/vision.md)).

---

## 1. Mục tiêu

- **Tăng tốc bồi đắp tri thức:** tự sinh tóm tắt, FAQ, bản dịch song ngữ để làm giàu trang Place nhanh hơn sức người.
- **Hỗ trợ kiểm duyệt ở quy mô:** phát hiện spam, ảnh không phù hợp, review giả — giảm tải cho Moderator.
- **Gợi ý thông minh:** phân loại địa điểm, gợi ý địa điểm mới từ tín hiệu tìm kiếm 0-kết-quả.
- **An toàn & minh bạch:** AI không bao giờ tự công khai/duyệt/xóa; mọi nội dung AI **có nhãn** và **chờ người duyệt** (human-in-the-loop).

## 2. Người sử dụng

| Vai trò | Cách dùng |
|---|---|
| **AI Agent (service principal)** | Chủ thể thực thi tác vụ (token hẹp, rate-limited, audited); tạo bản nháp `pending`. |
| **Moderator** | Người **duyệt** đầu ra AI (summary/FAQ/dịch), xử lý cảnh báo AI (spam/ảnh/review giả). |
| **Contributor** | Kích hoạt sinh nội dung AI cho Place (`AI.Assist`), biên tập bản nháp. |
| **Administrator** | Cấu hình model, prompt version, ngưỡng chi phí (`AI.Model.Configure`). |
| **Super Administrator** | Quản lý AI principal & vòng đời token (`AI.Agent.Manage`). |
| **Người dùng cuối (gián tiếp)** | Nhận giá trị: đọc AI summary đã duyệt, dịch, FAQ; (tương lai) chatbot hỏi đáp. |

## 3. Tính năng chính

1. **Sinh tóm tắt (summary)** — tạo `place_ai_summary` (tóm tắt + highlights) từ nội dung Place.
2. **Sinh FAQ** — gợi ý câu hỏi–đáp cho Place (`is_ai_generated=true`, pending).
3. **Dịch (translate)** — song ngữ vi/en cho nội dung (Place, menu, mô tả).
4. **Phát hiện spam & nội dung độc hại** — cho review/bình luận/bài viết (đề xuất gắn cờ).
5. **Kiểm tra ảnh (media check)** — phát hiện ảnh không phù hợp/không liên quan ([WF-18](../../workflow/moderation.md)).
6. **Gợi ý phân loại (suggest category)** — đề xuất danh mục cho địa điểm mới.
7. **Gợi ý địa điểm mới** — từ tín hiệu 0-kết-quả/trending của Search ([WF-19](../../workflow/contribution.md)).
8. **Quản lý provenance AI** — model, prompt_version, source_hash, trạng thái stale/ready.
9. **(Tương lai)** — chatbot hỏi đáp, tìm kiếm ngữ nghĩa, gợi ý cá nhân hóa (namespace `AI.Chat/Recommend` đã dự trữ).

## 4. Use case

| UC | Tên | Actor | Mô tả |
|---|---|---|---|
| UC-AI1 | Sinh tóm tắt Place | Contributor → AI | Kích hoạt → AI tạo summary `pending` → Moderator duyệt ([WF-08/09](../../workflow/moderation.md)). |
| UC-AI2 | Sinh FAQ | AI | Gợi ý Q&A cho Place (pending). |
| UC-AI3 | Dịch nội dung | Member/AI | Dịch mô tả/menu sang vi/en. |
| UC-AI4 | Phát hiện spam review | AI | Gắn cờ review nghi giả → Moderator. |
| UC-AI5 | Kiểm tra ảnh upload | AI | Ảnh mới → AI check → pass/gắn cờ ([WF-18](../../workflow/moderation.md)). |
| UC-AI6 | Gợi ý danh mục | AI | Đề xuất category cho Place mới. |
| UC-AI7 | Gợi ý địa điểm mới | AI | Từ zero-result/trending → đề xuất tạo Place ([WF-19](../../workflow/contribution.md)). |
| UC-AI8 | Duyệt đầu ra AI | Moderator | Chấp nhận/sửa/từ chối nội dung AI. |
| UC-AI9 | Sinh lại khi stale | AI/Job | Nội dung gốc đổi (source_hash) → summary `stale` → sinh lại. |

## 5. Luồng người dùng

**Sinh & duyệt tóm tắt (happy path — UC-AI1):**
```
Contributor mở Place → "Tạo tóm tắt AI" (AI.Assist)
   → API 202 Accepted {job_id, status: generating} (bất đồng bộ)
   → AI Agent đọc nội dung Place → sinh summary + highlights
   → lưu place_ai_summary (status=ready, is_approved=false, model, prompt_version, source_hash)
   → thông báo Moderator "nội dung AI sẵn sàng" (WF-09)
   → Moderator xem → sửa/duyệt (is_approved=true) hoặc từ chối (rejected)
   → chỉ khi duyệt mới hiển thị công khai (có nhãn "AI tóm tắt")
```

**Kiểm tra ảnh (UC-AI5):**
```
Upload ảnh → status=pending → AI media check (WF-18)
   → an toàn & liên quan → đề xuất pass (vẫn cần chính sách duyệt) 
   → nghi ngờ → gắn cờ → Moderator quyết định
```

**Gợi ý địa điểm (UC-AI7):**
```
Search zero-result/trending → AI đọc tín hiệu tổng hợp (không PII)
   → đề xuất Place mới {tên dự kiến, danh mục gợi ý, khu vực} status=pending
   → Moderator/Contributor xem → tạo thật hoặc bỏ
```

## 6. Điều kiện nghiệp vụ

- **BR-AI1 — Human-in-the-loop tuyệt đối:** **mọi** đầu ra AI ở trạng thái `pending`/nháp; **không** hiển thị công khai cho tới khi người duyệt.
- **BR-AI2 — AI không có quyền quyết định cuối:** AI Agent **KHÔNG BAO GIỜ** `Publish/Approve/Verify/Delete`; không ghi trực tiếp trường `Official`; không quản trị người dùng ([rbac.md §4.10](../../security/rbac.md)).
- **BR-AI3 — Nhãn minh bạch:** nội dung AI luôn hiển thị nhãn ("AI tóm tắt", "gợi ý AI"); phân biệt rõ với nội dung người viết.
- **BR-AI4 — Provenance đầy đủ:** lưu `model`, `prompt_version`, `source_hash`, thời điểm sinh; gắn `source=ai` ([source.md](../../data/modules/source.md)).
- **BR-AI5 — Idempotent & chống lãng phí:** job AI idempotent; tái dùng kết quả theo `source_hash`, chỉ sinh lại khi nguồn đổi (`stale`).
- **BR-AI6 — Kiểm soát chi phí:** rate limit rất chặt theo cost budget (per place/per phút); bất đồng bộ (202) — không chặn request người dùng.
- **BR-AI7 — Token hẹp & audited:** AI principal có scope hẹp, thời hạn ngắn, mọi hành động ghi audit; **không kế thừa** vai trò con người.
- **BR-AI8 — AI hỗ trợ, không thay thế kiểm duyệt:** cảnh báo AI (spam/ảnh/review giả) là **đề xuất**; quyết định cuối thuộc Moderator.
- **BR-AI9 — Riêng tư:** AI đọc dữ liệu tổng hợp/nội dung công khai cần thiết; không truy ngược cá nhân từ tín hiệu analytics.

## 7. Quy tắc dữ liệu

- **Đầu ra & provenance:** `place_ai_summary` (summary, highlights, model, prompt_version, source_hash, language, status ∈ {generating, ready, stale, rejected}, is_approved) — [places.md §9](../../data/modules/places.md); FAQ AI trong `place_faqs` (`is_ai_generated=true`, `status=pending`).
- **Revision AI:** khi AI đề xuất sửa nội dung → tạo `wiki_revision` (origin=`ai_generation`, status=`pending`) — [source.md](../../data/modules/source.md).
- **Vòng đời:** `generating → ready → (approved | rejected)`; `ready → stale` khi `source_hash` nguồn đổi → sinh lại.
- **Song ngữ:** nếu cần nhiều ngôn ngữ → khóa `(place_id, language)`.
- **Tín hiệu đầu vào:** đọc SearchAnalytics/TrendingKeyword (aggregate, không PII), nội dung Place/Review công khai.
- **Job bất đồng bộ:** trả `202 + job_id`; kết quả lấy qua job/notification; hàng đợi + retry idempotent.
- **Audit:** ghi mọi lần sinh/kiểm tra (loại tác vụ, model, chi phí, kết quả) — không log dữ liệu nhạy cảm.

## 8. Quan hệ với module khác

| Module | Quan hệ |
|---|---|
| **Place (+ chuyên biệt)** | Sinh summary/FAQ/dịch; gợi ý category; đề xuất revision (pending). |
| **Review** | Phát hiện review giả/spam; (tương lai) tóm tắt "khách nói gì". |
| **Community** | Phát hiện spam/độc hại; gợi ý tag; câu hỏi lặp → FAQ. |
| **Media** | Kiểm tra ảnh ([WF-18](../../workflow/moderation.md)). |
| **Search / Analytics** | Nhận tín hiệu zero-result/trending → gợi ý Place ([WF-19](../../workflow/contribution.md)). |
| **Moderation** | AI đề xuất → Moderator duyệt ([WF-08/09](../../workflow/moderation.md)); AI đứng ngoài nhánh quyền con người. |
| **RBAC / Auth** | AI Agent = service principal, scope `AI.*`, token hẹp/audited. |
| **Notification** | Báo Moderator khi nội dung AI sẵn sàng/cảnh báo. |

## 9. KPI của module

| Nhóm | KPI | Định nghĩa / Mục tiêu |
|---|---|---|
| Năng suất | Số nội dung AI (summary/FAQ/dịch) được **duyệt** | Giá trị thực (đã qua người), không phải số sinh ra. |
| Chất lượng | Tỷ lệ đầu ra AI được duyệt không cần sửa lớn | Độ chính xác nội dung nháp. |
| Hiệu quả kiểm duyệt | Tỷ lệ spam/ảnh xấu/review giả AI phát hiện đúng (precision/recall) | Hỗ trợ moderation hiệu quả. |
| An toàn | Tỷ lệ đầu ra AI công khai **không qua** duyệt (phải = 0) | Bảo đảm human-in-the-loop. |
| Chi phí | Chi phí AI / nội dung được duyệt | Hiệu quả kinh tế. |
| Độ tươi | Tỷ lệ summary `stale` được sinh lại kịp | Nội dung AI không lỗi thời. |
| Bồi đắp | Số Place/FAQ hình thành từ gợi ý AI | AI nuôi tri thức. |

---

*Tài liệu liên quan: [rbac.md](../../security/rbac.md) (AI Agent §4.10, `AI.*`), [source.md](../../data/modules/source.md), [places.md](../../data/modules/places.md) §9, [moderation.md](../../workflow/moderation.md) (WF-08/09/18), [contribution.md](../../workflow/contribution.md) (WF-19), [api.md](../../api/api.md) §21, [vision.md](../../overview/vision.md) §6.*
