# PhuQuocHub — Quy trình Đóng góp & Làm giàu dữ liệu (Contribution Workflows)

> **Mục đích:** đặc tả các luồng người dùng/AI **tạo & làm giàu dữ liệu địa điểm**: claim doanh nghiệp, đề xuất sửa, nội dung AI, báo sai, đóng cửa, đổi giá, upload ảnh, AI gợi ý Place. Khuôn 9 mục theo [workflow.md](./workflow.md) §1. Tài liệu **chỉ thiết kế**.

Nhóm này chứa: **WF-05, WF-06, WF-08, WF-10, WF-15, WF-16, WF-17, WF-19**. Các luồng kiểm duyệt liên quan (duyệt đóng góp, duyệt nội dung AI, kiểm tra ảnh) ở [moderation.md](./moderation.md).

---

## WF-05 — Chủ doanh nghiệp nhận quyền quản lý địa điểm (Business Claim)

- **Trigger:** Member bấm "Đây là doanh nghiệp của tôi" trên trang Place.
- **Input:** `place_id`, `user_id`, bằng chứng (giấy phép KD, email tên miền, số điện thoại xác thực, tài liệu).
- **Validation:** place tồn tại & `published`; user chưa là owner; chưa có owner hiệu lực (hoặc mở luồng tranh chấp); bằng chứng đủ định dạng.
- **Permission:** `Business.Claim` (Member+); duyệt cần `Business.Verify` (Moderator — xem [moderation.md](./moderation.md) WF-07).
- **Business Rule:** tạo claim `pending` → Moderator xác minh → nếu duyệt: tạo `business_members(role=owner)` cho place + gán role **Business Owner** *scope Managed* (`user_roles`); đặt `verifications(place)` = `official`; nếu đã có owner hiệu lực → `disputed`/chuyển nhượng. Mô hình **Place-centric** ([ADR-015](../99-decisions/ADR-015-business-ownership-model.md)).
- **Database Update:** insert `business_claims` (pending); khi duyệt: insert `business_members(owner)`, gán `user_roles`(scope Managed, `business_id=place_id`), `verifications`(source `business_owner`).
- **Notification:** xác nhận đã nhận yêu cầu; kết quả duyệt/từ chối; báo owner hiện tại nếu tranh chấp.
- **Audit Log:** `business.claim_requested` / `claim_approved` / `claim_rejected` (actor, tham chiếu bằng chứng).
- **Rollback:** từ chối → không gán quyền; phát hiện gian lận → **thu hồi** binding & role, hạ Place về community-managed.

## WF-06 — Người dùng đề xuất sửa thông tin Place (Propose Edit)

- **Trigger:** người dùng bấm "Đề xuất chỉnh sửa" và gửi thay đổi.
- **Input:** `place_id`, các field thay đổi (payload), nguồn (tùy chọn), ghi chú.
- **Validation:** field hợp lệ theo schema; giá trị hợp lệ (tọa độ, giờ mở cửa…); không rỗng; rate limit chống spam.
- **Permission:** `Place.Create`/`Place.Edit.*` — Member → `pending`; Contributor/Local Guide auto một phần; Business Owner/Manager sửa *scope Managed*.
- **Business Rule:** tạo `contribution` type=`update` ở `pending`; thay đổi **nhạy cảm** (tên/tọa độ/danh mục/gộp) **luôn** chờ Moderator; thay đổi thường của người tin cậy có thể auto-approve; mỗi thay đổi gắn `source`.
- **Database Update:** insert `contributions` (pending, payload) — **chưa** đụng `places`; khi duyệt (WF-07) mới tạo `wiki_revisions` + cập nhật `places` + `source_attributions`.
- **Notification:** xác nhận đã gửi; kết quả duyệt.
- **Audit Log:** `contribution.submitted` (place, danh sách field).
- **Rollback:** từ chối → payload không áp; nếu đã áp → revert qua `wiki_revision`.

## WF-08 — AI tạo nội dung (AI Generate Content)

- **Trigger:** Place mới thiếu mô tả; nội dung nguồn đổi (summary `stale`); hoặc yêu cầu thủ công của Moderator/Contributor.
- **Input:** `place_id`, loại (summary/FAQ/dịch), dữ liệu nguồn, `model` + `prompt_version`.
- **Validation:** đủ dữ liệu nguồn; kiểm soát chi phí/tần suất; ngôn ngữ hợp lệ.
- **Permission:** `AI.GenerateSummary`/`GenerateFAQ`/`Translate` (**AI Agent**). AI **không** có quyền publish.
- **Business Rule:** đầu ra luôn `pending`/`generating→ready`, gắn `source(type=ai)` reliability thấp; lưu `source_hash` để phát hiện stale; **không tự công khai** → chuyển WF-09.
- **Database Update:** upsert `place_ai_summary` (status, `is_approved=false`) hoặc `place_faqs`(`is_ai_generated=true`, pending); insert `wiki_revisions`(origin=`ai_generation`, pending); `sources` + `source_attributions`(ai).
- **Notification:** báo Moderator có nội dung AI chờ duyệt.
- **Audit Log:** `ai.content_generated` (model, prompt_version, place, type).
- **Rollback:** sinh lỗi → `status=rejected/stale`, **không** ảnh hưởng nội dung hiện có; cho phép sinh lại.

## WF-10 — Người dùng báo sai thông tin (Report Wrong Info)

- **Trigger:** người dùng bấm "Báo thông tin sai" trên Place hoặc một trường.
- **Input:** `place_id` (+ `field` tùy chọn), lý do, mô tả, bằng chứng tùy chọn.
- **Validation:** place tồn tại; lý do hợp lệ; chống report trùng/spam.
- **Permission:** `Report.Create` (Member+; Guest hạn chế).
- **Business Rule:** tạo `report` type=`place_info`; nhiều report cùng field → tăng ưu tiên & có thể tăng `dispute_count`, hạ độ tin của xác minh liên quan; đưa vào hàng chờ Moderator (WF-13).
- **Database Update:** insert `reports` (target=place/field, `open`); có thể tăng `verifications.dispute_count`.
- **Notification:** xác nhận đã nhận; đẩy vào hàng chờ Moderator.
- **Audit Log:** `report.created` (target, reason).
- **Rollback:** report sai/spam → đóng `invalid`; **không** đổi dữ liệu Place.

## WF-15 — Địa điểm đóng cửa (Place Closed)

- **Trigger:** report "đã đóng cửa", chủ cơ sở cập nhật, hoặc nhiều tín hiệu cộng đồng.
- **Input:** `place_id`, kiểu đóng cửa (tạm/vĩnh viễn), ngày, nguồn.
- **Validation:** place tồn tại & `published`; có nguồn/bằng chứng; quyền tương ứng.
- **Permission:** Business Owner tự đặt (*scope Managed*); hoặc cộng đồng đề xuất → Moderator `Place.Archive`.
- **Business Rule:** **vĩnh viễn** → `status=archived` (giữ lịch sử, ẩn khỏi tìm kiếm mặc định); **tạm thời** → cờ tạm đóng + ghi chú; gắn `source` & `verification`; luôn giữ trang cho tra cứu.
- **Database Update:** `places.status=archived` hoặc cờ closed; `wiki_revisions`; `source_attributions`; `verifications`.
- **Notification:** người theo dõi/đóng góp; chủ cơ sở.
- **Audit Log:** `place.closed` (type, source, actor).
- **Rollback:** mở lại (`Place.Restore` → `published`) khi hoạt động trở lại; revert qua revision.

## WF-16 — Giá thay đổi (Price Change)

- **Trigger:** chủ cơ sở cập nhật giá; cộng đồng đề xuất; hoặc giá cũ hết hạn (verification `expired`).
- **Input:** `place_id`, danh sách vé/giá mới, hiệu lực, nguồn.
- **Validation:** giá hợp lệ (số, tiền tệ); loại vé hợp lệ; quyền tương ứng.
- **Permission:** `Price.Edit.Managed` (Owner/Manager) hoặc đề xuất (Member) → duyệt.
- **Business Rule:** **ghi `PriceHistory` mới, không ghi đè** (giữ lịch sử); giá mới tạo `verification`(pending→verified/official); giá cũ đánh dấu superseded/expired; UI hiện giá mới + "cập nhật lúc".
- **Database Update:** insert `price_history` (bản mới, `valid_from`; bản cũ đặt `valid_to` → `expired`); `verifications`; `source_attributions`.
- **Notification:** người theo dõi; (nếu cộng đồng đề xuất) kết quả duyệt.
- **Audit Log:** `price.changed` (old→new, source).
- **Rollback:** revert về bản giá trước (lịch sử còn nguyên); từ chối đề xuất → không áp.

## WF-17 — Người dùng Upload ảnh (Upload Photo)

- **Trigger:** người dùng chọn ảnh và tải lên cho Place/Review.
- **Input:** file ảnh, owner (place/review), caption/alt tùy chọn.
- **Validation:** định dạng/kích thước/MIME hợp lệ; giới hạn số lượng; **quét mã độc**; chống nội dung trùng.
- **Permission:** `Media.Upload.Own` (Member) / `Media.Upload.Managed` (Owner/Manager).
- **Business Rule:** lưu lên **object storage** (không nhị phân trong DB); ảnh vào `pending` kiểm duyệt (người tin cậy có thể auto-publish); kích hoạt **AI kiểm tra ảnh** (WF-18); resize/optimize qua job nền.
- **Database Update:** insert `media` (url, `status=pending`, `uploaded_by`); enqueue job (resize, AI moderation).
- **Notification:** xác nhận upload; báo khi được duyệt/từ chối.
- **Audit Log:** `media.uploaded` (owner, uploader).
- **Rollback:** kiểm duyệt/AI gắn cờ → `status=hidden/rejected`, gỡ khỏi gallery; job dọn file lỗi khỏi storage.

## WF-19 — AI gợi ý Place (AI Suggest New Place)

- **Trigger:** job phát hiện địa điểm tiềm năng — từ OSM, từ **từ khóa 0 kết quả** trong Analytics ([analytics.md](../data/modules/analytics.md)), hoặc cụm review nhắc tên chưa có Place.
- **Input:** dữ liệu ứng viên (tên, tọa độ, nguồn phát hiện), độ tin.
- **Validation:** **dedupe** với Place hiện có (tên + tọa độ); tọa độ nằm trong Phú Quốc; đủ thông tin tối thiểu.
- **Permission:** `AI.SuggestCategory`/`AI.Assist` + `Place.Create` (as AI, tạo draft) — **không** publish.
- **Business Rule:** tạo Place ở `pending` do AI đề xuất, gắn `source(ai + nguồn phát hiện, vd openstreetmap)`; vào hàng chờ Moderator; liên kết `TrendingKeyword` 0-kết-quả như tín hiệu nhu cầu.
- **Database Update:** insert `places`(pending, `created_by`=AI principal); `source_attributions`; `contributions`(type=create, pending).
- **Notification:** Moderator có đề xuất địa điểm mới.
- **Audit Log:** `ai.place_suggested` (ứng viên, nguồn tín hiệu).
- **Rollback:** Moderator từ chối → archived/soft delete; dedupe phát hiện trùng → gộp/bỏ.

---

*Tài liệu liên quan: [workflow.md](./workflow.md), [moderation.md](./moderation.md), [rbac.md](../security/rbac.md), [source.md](../data/modules/source.md), [verification.md](../data/modules/verification.md), [places.md](../data/modules/places.md), [analytics.md](../data/modules/analytics.md)*
