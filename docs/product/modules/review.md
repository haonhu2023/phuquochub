# Module 8 — Review (Đánh giá)

> **Product Spec** — Review là cơ chế **đánh giá có sao + nội dung + ảnh** gắn với một [Place](place.md) (và các Place chuyên biệt: Hotel/Restaurant/Tour). Là nguồn niềm tin cốt lõi của trụ cột *Reddit*, kèm cơ chế **chống review giả** và **phản hồi từ chủ cơ sở**.

---

## 1. Mục tiêu

- Cung cấp **đánh giá thật, có kiểm chứng** để du khách ra quyết định — thay cho review giả/PR trên nền tảng lớn ([vision.md §2](../../overview/vision.md)).
- Tổng hợp **điểm đánh giá & phân bố sao** cho mỗi cơ sở (đầu vào xếp hạng & tin cậy).
- Cho **chủ cơ sở phản hồi** minh bạch, không được xóa/thao túng.
- **Chống lạm dụng:** chặn tự đánh giá, review trùng, spam, và review giả.

## 2. Người sử dụng

| Vai trò | Cách dùng |
|---|---|
| **Guest** | Đọc review & phân bố sao (không viết). |
| **Member** | Viết/sửa/xóa review của mình, đính ảnh, vote review hữu ích, báo cáo. |
| **Local Guide** | Review được tin cậy nhanh (auto-publish), trọng số uy tín cao. |
| **Business Owner/Manager** | Phản hồi review (`Review.Reply.Managed`); **không** xóa. |
| **Moderator** | Ẩn/xóa review vi phạm (`Review.Delete.Any/Hide`), xử lý report. |
| **AI Agent** | Phát hiện review giả/spam (đề xuất gắn cờ, pending). |

## 3. Tính năng chính

1. **Viết đánh giá** — rating 1–5 sao + nội dung + ảnh (media).
2. **Phân bố & tổng hợp** — `rating_avg`, `rating_count`, biểu đồ phân bố sao (denormalize lên Place).
3. **Phản hồi của chủ cơ sở** — trả lời công khai dưới review.
4. **Vote hữu ích** — đánh dấu review hữu ích (nổi review chất lượng).
5. **Báo cáo & kiểm duyệt** — report review; hàng chờ Moderator ([WF-12/13](../../workflow/moderation.md)).
6. **Chống review giả** — quy tắc 1 review/người/cơ sở, chặn tự review, phát hiện bất thường (AI).
7. **Lọc & sắp xếp** — theo sao, mới nhất, hữu ích nhất, có ảnh.

## 4. Use case

| UC | Tên | Actor | Mô tả |
|---|---|---|---|
| UC-RV1 | Viết đánh giá | Member | Rating + nội dung + ảnh cho một cơ sở ([WF-11](../../workflow/moderation.md)). |
| UC-RV2 | Sửa/xóa review của mình | Member | `Review.Edit.Own`/`Delete.Own`. |
| UC-RV3 | Đọc & lọc review | Guest/Member | Xem phân bố sao, lọc theo sao/ảnh/hữu ích. |
| UC-RV4 | Chủ phản hồi review | Owner/Manager | Trả lời công khai. |
| UC-RV5 | Vote review hữu ích | Member | Đánh dấu hữu ích. |
| UC-RV6 | Báo cáo review | Member | Report → hàng chờ. |
| UC-RV7 | Kiểm duyệt review | Moderator | Ẩn/xóa vi phạm, xử lý report. |
| UC-RV8 | Phát hiện review giả | AI | Gắn cờ nghi ngờ → Moderator xem. |

## 5. Luồng người dùng

**Viết đánh giá (happy path — UC-RV1):**
```
Member ở trang Place → "Viết đánh giá" → chọn sao (1–5) + nội dung + (ảnh)
   → validation: đăng nhập, rating 1–5, UNIQUE(place_id,user_id), không phải chủ cơ sở, nội dung không rỗng
   → lưu review (published với Member tin cậy; pending nếu anti-spam bật cho tài khoản mới — WF-11)
   → cập nhật rating_avg/count của Place; thông báo chủ cơ sở (review mới cần phản hồi)
```

**Chủ phản hồi (UC-RV4):**
```
Owner nhận thông báo review mới → mở Dashboard → "Trả lời"
   → nội dung phản hồi (không xóa được review) → hiển thị công khai dưới review
```

**Báo cáo & xử lý (UC-RV6/RV7):**
```
Report review (lý do) → hàng chờ moderation → Moderator xem
   → giữ / ẩn (Review.Hide) / xóa (Review.Delete.Any) + cảnh cáo tác giả nếu vi phạm
   → cập nhật lại rating tổng hợp nếu review bị gỡ + audit
```

## 6. Điều kiện nghiệp vụ

- **BR-RV1 — Một review/người/cơ sở:** `UNIQUE(place_id, user_id)` — muốn đổi thì sửa review cũ, không tạo mới.
- **BR-RV2 — Không tự review:** Business Owner/Manager **không** được đánh giá cơ sở mình quản lý.
- **BR-RV3 — Rating hợp lệ:** sao ∈ {1,2,3,4,5}; nội dung không rỗng (tránh rating trần trụi vô nghĩa — có thể cho phép rating-only tùy chính sách).
- **BR-RV4 — Chủ chỉ phản hồi:** Owner/Manager chỉ `Reply`, **không** `Delete/Hide` review (chỉ Moderator).
- **BR-RV5 — Chống spam/giả:** rate limit (vd 5–10 review/giờ/user); AI phát hiện mẫu bất thường (burst, nội dung sao chép, tài khoản mới) → gắn cờ `pending`.
- **BR-RV6 — Ảnh kiểm duyệt:** ảnh trong review `pending` tới khi qua kiểm duyệt/AI ([WF-18](../../workflow/moderation.md)).
- **BR-RV7 — Tổng hợp đúng:** khi review bị ẩn/xóa → tính lại `rating_avg/count`; review `pending`/`hidden` không tính vào điểm công khai.
- **BR-RV8 — Vote hữu ích không phải rating:** vote "hữu ích" chỉ sắp xếp, không đổi điểm sao.

## 7. Quy tắc dữ liệu

- **Thực thể:** `reviews` (place_id, user_id, rating 1–5, content, status ∈ {pending, published, hidden, deleted}, helpful_count, created_at, updated_at) + ảnh review qua `media` (`review_id`, exclusive arc) + `review_replies` (review_id, author_id, content) + `review_reports`.
- **Ràng buộc:** `UNIQUE(place_id, user_id)`; `rating` CHECK 1–5.
- **Denormalize:** cập nhật `places.rating_avg`, `places.rating_count` mỗi khi review published/ẩn/xóa (trigger/job); giữ **phân bố sao** (đếm theo mức) để hiển thị biểu đồ.
- **Provenance & trust:** review gắn tác giả + uy tín; trọng số hiển thị có thể tính theo karma (không thay điểm thô).
- **Moderation:** trạng thái + lý do ẩn/xóa; audit.
- **Riêng tư:** không lộ email/PII người viết; chỉ tên hiển thị + badge.
- **Vote hữu ích:** `helpful_count` denormalize; `UNIQUE(review_id, user_id)` cho vote.

## 8. Quan hệ với module khác

| Module | Quan hệ |
|---|---|
| **Place / Hotel / Restaurant / Tour** | Review gắn `place_id`; cập nhật `rating_avg/count`. |
| **Business** | Chủ cơ sở phản hồi review; số review là KPI dashboard. |
| **Community** | Bổ trợ: Review = đánh giá có sao; Community = thảo luận mở; **chia sẻ cơ chế vote & report**. |
| **AI Assistant** | Phát hiện review giả/spam; tóm tắt "khách nói gì" (pending). |
| **Analytics** | Rating là tín hiệu chất lượng cho `popular_places` (§6 công thức). |
| **Moderation** | Report → [WF-12/13](../../workflow/moderation.md); ảnh → [WF-18](../../workflow/moderation.md). |
| **Notification** | Thông báo chủ cơ sở khi có review; thông báo tác giả khi bị xử lý/được phản hồi. |

## 9. KPI của module

| Nhóm | KPI | Định nghĩa / Mục tiêu |
|---|---|---|
| Độ phủ | % Place `published` có ≥1 review | Cơ sở có đánh giá — mục tiêu tăng đều. |
| Tương tác | Số review mới/tháng & số review có ảnh | Sức sống đánh giá. |
| Tin cậy | Tỷ lệ review giả bị phát hiện/gỡ | Hiệu quả chống review giả (North Star niềm tin). |
| Chất lượng | Độ dài/chất lượng trung bình & tỷ lệ có nội dung (không rating trần) | Review hữu ích. |
| Phản hồi | Tỷ lệ review được chủ cơ sở phản hồi | Mức tương tác doanh nghiệp. |
| An toàn | Thời gian xử lý report review trung vị | Kiểm duyệt kịp thời. |
| Hữu ích | Tỷ lệ review được vote hữu ích | Cộng đồng lọc chất lượng. |

---

*Tài liệu liên quan: [place.md](place.md), [business.md](business.md), [community.md](community.md), [ai-assistant.md](ai-assistant.md), [moderation.md](../../workflow/moderation.md) (WF-11/12/13/18), [rbac.md](../../security/rbac.md) (Review.*), [api.md](../../api/api.md) §16, [discovery.md](../discovery.md) (P2 khối đánh giá).*
