# PhuQuocHub — Quy trình Kiểm duyệt & An toàn (Moderation Workflows)

> **Mục đích:** đặc tả các luồng **kiểm duyệt, review và an toàn nội dung**: moderator duyệt đóng góp, duyệt nội dung AI, vòng đời review, report và xử lý, AI kiểm tra ảnh. Khuôn 9 mục theo [workflow.md](./workflow.md) §1. Tài liệu **chỉ thiết kế**.

Nhóm này chứa: **WF-07, WF-09, WF-11, WF-12, WF-13, WF-18**. Các luồng tạo/đóng góp dữ liệu ở [contribution.md](./contribution.md).

---

## WF-07 — Moderator kiểm duyệt (Review Contribution)

- **Trigger:** có `contribution`/place/media/revision ở trạng thái `pending` trong hàng chờ.
- **Input:** id item, quyết định (approve/reject), ghi chú, chỉnh sửa tùy chọn trước khi duyệt.
- **Validation:** item còn `pending` (chống xử lý trùng — optimistic lock); moderator đủ quyền; **không tự duyệt** đóng góp của chính mình (xung đột lợi ích).
- **Permission:** `Place.Approve`, `Revision.Approve`, duyệt/từ chối `contribution`, `Media.Moderate` (Moderator+).
- **Business Rule:** approve → áp payload, tạo `wiki_revision`, đưa `places.status=published`, cập nhật provenance & có thể `verification`; reject → **bắt buộc lý do**; hàng chờ ưu tiên theo số báo cáo/độ tin người gửi.
- **Database Update:** `contributions.status`, `reviewed_by`; `places` / `wiki_revisions` / `source_attributions`; `media.status`.
- **Notification:** người đóng góp nhận kết quả (+lý do); cộng karma nếu approved.
- **Audit Log:** `moderation.decided` (item, decision, reason, moderator).
- **Rollback:** quyết định sai → revert qua revision; mở lại item; điều chỉnh karma.

## WF-09 — AI chờ Moderator duyệt (AI Content Awaits Moderation)

- **Trigger:** AI sinh nội dung xong (WF-08) → `ready` & `is_approved=false`.
- **Input:** id nội dung AI (summary/FAQ/revision), quyết định moderator.
- **Validation:** nội dung tồn tại & `pending`; nguồn gắn `type=ai`; moderator đủ quyền.
- **Permission:** `Verification.Verify`/`Revision.Approve`/`FAQ.Approve` (Moderator). **AI không tự duyệt.**
- **Business Rule:** bắt buộc **human-in-the-loop**; approve → công khai, vẫn ghi nhãn "AI-assisted"; reject → ẩn, có thể yêu cầu sinh lại; cho phép **sửa trước khi duyệt**.
- **Database Update:** `place_ai_summary.is_approved=true`/status; `place_faqs.status=published`; `wiki_revisions.status=approved`; `source_attributions.verified_by`.
- **Notification:** (tùy) người theo dõi Place; số liệu moderation nội bộ.
- **Audit Log:** `ai.content_reviewed` (decision, moderator, model).
- **Rollback:** revert nội dung AI đã công khai qua revision; đặt lại `is_approved=false`.

## WF-11 — Người dùng tạo Review

- **Trigger:** người dùng gửi review cho Place.
- **Input:** `place_id`, rating (1–5), nội dung, media tùy chọn.
- **Validation:** đã đăng nhập & email verified; **chưa review place này** (`UNIQUE(place_id,user_id)`); rating hợp lệ; nội dung không rỗng/không vi phạm cơ bản; rate limit.
- **Permission:** `Review.Create` (Member+). **Business Owner không được tự review cơ sở mình** (xung đột lợi ích — business rule).
- **Business Rule:** review mới có thể `pending` (người mới/anti-spam) hoặc `published` ngay (Local Guide/tin cậy); cập nhật `rating_avg`/`rating_count` (denormalize qua job); media đính kèm → WF-17/18.
- **Database Update:** insert `reviews` (status pending/published); cập nhật `places.rating_avg/count` (job); `media`.
- **Notification:** chủ cơ sở (nếu đã claim) có review mới → có thể `Review.Reply.Managed`.
- **Audit Log:** `review.created` (place, rating).
- **Rollback:** bị report & gỡ (WF-12/13) → `status=hidden`; tự xóa (`Review.Delete.Own`) → tính lại rating.

## WF-12 — Review bị Report

- **Trigger:** người dùng/chủ cơ sở bấm report một review.
- **Input:** `review_id`, lý do (spam, sai sự thật, xúc phạm…), mô tả.
- **Validation:** review tồn tại & đang `published`; lý do hợp lệ; chống report trùng/lạm dụng.
- **Permission:** `Report.Create` (Member+); Business Owner report review cơ sở mình.
- **Business Rule:** tạo `report` target=`review`; vượt **ngưỡng nhiều report** → **auto-hide tạm** chờ xử lý (giảm hại); đưa vào hàng chờ Moderator (WF-13).
- **Database Update:** insert `reports` (target=review, `open`); có thể `reviews.status=hidden` tạm nếu vượt ngưỡng.
- **Notification:** người report (đã nhận); tác giả review (nếu bị ẩn tạm); Moderator hàng chờ.
- **Audit Log:** `report.created` (review, reason).
- **Rollback:** report vô căn cứ → đóng `invalid`, khôi phục review (`published`).

## WF-13 — Moderator xử lý Report (Resolution)

- **Trigger:** report ở hàng chờ (place/review/media/user).
- **Input:** `report_id`, quyết định (giữ/gỡ/cảnh cáo/ban), ghi chú.
- **Validation:** report còn `open`; moderator đủ quyền; không xung đột lợi ích.
- **Permission:** `Report.Resolve`, `Review.Delete.Any`/`Hide`, `Comment.Delete.Any`, `User.Warn`/`Mute` (Moderator); `User.Ban` (Admin).
- **Business Rule:** hợp lệ → gỡ/ẩn nội dung + chế tài tác giả theo mức độ (cảnh cáo → mute → ban); vô căn cứ → đóng & khôi phục nội dung; **ban vĩnh viễn leo thang lên Admin**.
- **Database Update:** `reports.status=resolved` (resolution, `resolved_by`); `reviews`/`media.status`; `users` (trạng thái warn/mute/ban).
- **Notification:** người report kết quả; tác giả bị chế tài (lý do + đường khiếu nại).
- **Audit Log:** `moderation.report_resolved` (decision, target, moderator).
- **Rollback:** quyết định sai → khôi phục nội dung/hủy chế tài; mở lại report; ghi audit chỉnh sửa.

## WF-18 — AI kiểm tra ảnh (AI Image Moderation)

- **Trigger:** ảnh mới upload (WF-17) đẩy job AI moderation.
- **Input:** `media_id`, ảnh (url), model.
- **Validation:** ảnh tồn tại & `pending`; job chưa chạy (**idempotent**).
- **Permission:** `AI.DetectSpam`/`AI.Assist` (**AI principal**). AI **không** xóa cứng.
- **Business Rule:** AI chấm điểm an toàn (NSFW/bạo lực/không liên quan); an toàn rõ ràng + uploader tin cậy → auto-approve (nếu chính sách cho phép); nghi ngờ → gắn cờ chờ Moderator (WF-13); vi phạm rõ ràng → **auto-hide tạm** + hàng chờ. **Không bao giờ xóa vĩnh viễn.**
- **Database Update:** `media.status` (approved/hidden/pending) + `ai_moderation_score`/labels; enqueue moderation nếu bị cờ.
- **Notification:** uploader nếu bị ẩn; Moderator nếu bị cờ.
- **Audit Log:** `ai.media_checked` (score, labels, decision).
- **Rollback:** false positive → Moderator khôi phục `published`; false negative → report/gỡ ở WF-12/13.

---

*Tài liệu liên quan: [workflow.md](./workflow.md), [contribution.md](./contribution.md), [rbac.md](../security/rbac.md), [verification.md](../data/modules/verification.md), [source.md](../data/modules/source.md)*
