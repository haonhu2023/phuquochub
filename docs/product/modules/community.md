# Module 6 — Community (Cộng đồng)

> **Product Spec** — Community là trụ cột **Reddit** của PhuQuocHub: thảo luận, hỏi đáp, chia sẻ trải nghiệm, bình chọn nội dung hữu ích, xây dựng **uy tín (karma)** người đóng góp. Nội dung có thể gắn theo **chủ đề, khu vực, địa điểm**.

---

## 1. Mục tiêu

- Tạo **không gian bản địa sống động** để hỏi đáp & chia sẻ kinh nghiệm thật về Phú Quốc — thay cho Facebook group phân mảnh.
- Dùng **cơ chế vote** để nội dung hữu ích nổi lên, nội dung kém chìm xuống.
- Xây dựng **uy tín (karma)** & danh tính "người bản xứ đáng tin" (Local Guide) → tạo động lực đóng góp chất lượng.
- **Bồi đắp tri thức** cho trụ cột Wikipedia: câu hỏi lặp lại → gợi ý tạo FAQ/địa điểm; thảo luận gắn Place làm giàu ngữ cảnh.

## 2. Người sử dụng

| Vai trò | Cách dùng |
|---|---|
| **Guest** | Đọc bài viết & bình luận công khai (không đăng/vote). |
| **Member** | Tạo bài, bình luận, vote, báo cáo; tích lũy karma. |
| **Local Guide** | Thành viên uy tín (karma cao) — nội dung được tin cậy, badge, trọng số vote/xác minh cao. |
| **Moderator** | Kiểm duyệt bài/bình luận, xử lý report, ẩn/xóa nội dung vi phạm. |
| **Business Owner** | Tham gia thảo luận (không thao túng); trả lời câu hỏi về cơ sở của mình. |
| **AI Agent** | Phát hiện spam/nội dung độc hại (đề xuất), gợi ý tag/chủ đề (pending). |

## 3. Tính năng chính

1. **Bài viết (post)** — tiêu đề, nội dung markdown, tag chủ đề, gắn `place_id`/khu vực (tùy chọn).
2. **Bình luận lồng nhau (nested comments)** — cây bình luận qua `parent_id`.
3. **Vote (upvote/downvote)** — cho bài & bình luận; sắp xếp Hot/Mới/Top.
4. **Uy tín (karma/reputation)** — điểm tích lũy theo chất lượng đóng góp; ngưỡng karma → thăng vai trò (Local Guide/Contributor).
5. **Bộ lọc & sắp xếp** — theo chủ đề, khu vực, địa điểm gắn kèm; Hot/Mới/Top.
6. **Báo cáo & kiểm duyệt** — report nội dung; hàng chờ Moderator.
7. **Gắn kết tri thức** — liên kết bài ↔ Place/Event; câu hỏi lặp → gợi ý FAQ.
8. **Badge & danh tính** — hiển thị vai trò, karma, huy hiệu đóng góp.

## 4. Use case

| UC | Tên | Actor | Mô tả |
|---|---|---|---|
| UC-C1 | Duyệt feed cộng đồng | Guest/Member | Xem Hot/Mới/Top, lọc chủ đề/khu vực. |
| UC-C2 | Tạo bài viết | Member | Đăng bài (markdown), tag, gắn địa điểm. |
| UC-C3 | Bình luận & thảo luận | Member | Bình luận lồng nhau, trả lời. |
| UC-C4 | Vote nội dung | Member | Upvote/downvote bài & bình luận. |
| UC-C5 | Hỏi đáp gắn địa điểm | Member | Đặt câu hỏi gắn `place_id` → nổi trên trang Place. |
| UC-C6 | Báo cáo nội dung | Member | Report → hàng chờ ([WF-12/13](../../workflow/moderation.md)). |
| UC-C7 | Kiểm duyệt | Moderator | Ẩn/xóa, cảnh cáo, xử lý report. |
| UC-C8 | Thăng hạng theo karma | Hệ thống | Đủ ngưỡng → tự đề xuất/thăng Local Guide. |

## 5. Luồng người dùng

**Đọc & tương tác (happy path):**
```
Mở Community → tab Hot/Mới/Top → lọc chủ đề/khu vực
   → mở bài → đọc nội dung + bình luận lồng nhau
   → (đăng nhập) vote / bình luận / báo cáo
```

**Tạo bài (UC-C2):**
```
Member → "+ Tạo bài" → nhập tiêu đề + nội dung (markdown) + tag + (place_id?)
   → sanitize markdown, kiểm slug unique, kiểm spam (AI đề xuất)
   → đăng (published trực tiếp với Member tin cậy; hoặc pending nếu anti-spam bật)
   → hiển thị trong feed + trên trang Place nếu gắn → cộng karma theo tương tác
```

**Kiểm duyệt (UC-C6/C7):**
```
Nội dung bị report → vào hàng chờ moderation → Moderator xem
   → giữ / ẩn (Comment.Delete.Any, Review.Hide tương tự) / cảnh cáo tác giả (User.Warn)
   → cập nhật trạng thái + audit + thông báo tác giả
```

## 6. Điều kiện nghiệp vụ

- **BR-C1 — Đăng nhập để đóng góp:** Guest chỉ đọc; tạo/vote/bình luận cần Member.
- **BR-C2 — Một vote/đối tượng/người:** mỗi user chỉ 1 vote (up hoặc down) cho một bài/bình luận; đổi vote ghi đè.
- **BR-C3 — Không tự vote:** không upvote/downvote nội dung của chính mình.
- **BR-C4 — Karma theo chất lượng:** karma tăng/giảm theo net vote & hành vi được duyệt; nội dung bị ẩn/vi phạm giảm karma.
- **BR-C5 — Ngưỡng thăng hạng:** đạt ngưỡng karma + lịch sử sạch → đủ điều kiện Local Guide/Contributor (chính sách ngưỡng do RBAC quy định — [rbac.md §8](../../security/rbac.md)).
- **BR-C6 — Chống lạm dụng:** rate limit tạo bài/vote; phát hiện vote gian lận (bù trừ/brigading); spam bị AI gắn cờ → moderator.
- **BR-C7 — Markdown an toàn:** nội dung sanitize (chống XSS); không nhúng script/iframe tùy tiện.
- **BR-C8 — Business không thao túng:** chủ cơ sở tham gia thảo luận nhưng không được tạo nội dung giả mạo khách/tự thổi phồng (gắn nhãn nếu là chủ).
- **BR-C9 — Kiểm duyệt sau (post-moderation):** ưu tiên đăng nhanh + kiểm duyệt phản ứng qua report, trừ khi anti-spam bật pre-moderation cho tài khoản mới.

## 7. Quy tắc dữ liệu

- **Thực thể:** `community_posts` (title, slug, content_md, place_id?, tags[], author_id, score, comment_count, status) + `community_comments` (post_id, parent_id, content, author_id, score, status) + `votes` (target_type, target_id, user_id, value ∈ {+1,-1}).
- **Vote denormalize:** `score` = tổng vote, cache trên post/comment; `UNIQUE(target_type, target_id, user_id)`.
- **Karma:** trường `users.karma` (cache) cập nhật bởi job/trigger từ vote & moderation; nguồn tính có thể lưu chi tiết ở bảng phụ.
- **Nested comments:** `parent_id` tự tham chiếu; hiển thị theo cây; giới hạn độ sâu render.
- **Sắp xếp:** Hot = hàm điểm + thời gian (giảm dần theo tuổi); Top = score; Mới = created_at.
- **Provenance/versioning:** bài viết có thể sửa (lưu lịch sử sửa cơ bản); trạng thái `draft/pending/published/archived`.
- **Liên kết Place:** `place_id` FK nullable → hiển thị chéo; câu hỏi lặp lại → tín hiệu gợi ý FAQ (AI).

## 8. Quan hệ với module khác

| Module | Quan hệ |
|---|---|
| **Place / Hotel / Restaurant / Tour / Event** | Bài viết gắn `place_id` → hiển thị hỏi đáp trên trang thực thể. |
| **Review** | Bổ sung nhau: Review = đánh giá có sao gắn cơ sở; Community = thảo luận mở (chia sẻ [vote.md] chung cơ chế vote). |
| **User / RBAC** | Karma quyết định thăng hạng vai trò; badge Local Guide. |
| **Search** | Index bài viết công khai (`type=community`). |
| **AI Assistant** | Phát hiện spam/độc hại; gợi ý tag; chuyển câu hỏi lặp thành FAQ (pending). |
| **Notification** | Thông báo reply, được vote nổi bật, nội dung bị xử lý. |
| **Moderation** | Report → hàng chờ ([WF-12/13](../../workflow/moderation.md)). |

## 9. KPI của module

| Nhóm | KPI | Định nghĩa / Mục tiêu |
|---|---|---|
| Sức sống | MAU đóng góp cộng đồng | Số người đăng/bình luận/vote hàng tháng (North Star). |
| Tương tác | Số bài + bình luận chất lượng/tuần | Nội dung mới đều đặn. |
| Hữu ích | Tỷ lệ câu hỏi được trả lời (& thời gian tới câu trả lời đầu) | Cộng đồng "trả lời được". |
| Uy tín | Số Local Guide hoạt động & phân bố karma | Sức khỏe hệ uy tín. |
| An toàn | Tỷ lệ report được xử lý & thời gian xử lý | Chất lượng kiểm duyệt. |
| An toàn | Tỷ lệ nội dung spam/độc hại lọt qua (thấp) | Hiệu quả AI + moderation. |
| Gắn kết tri thức | Số bài gắn Place & số FAQ sinh từ thảo luận | Community nuôi Wikipedia. |
| Giữ chân | Tỷ lệ người đóng góp quay lại (retention) | Cộng đồng bền vững. |

---

*Tài liệu liên quan: [review.md](review.md), [place.md](place.md), [rbac.md](../../security/rbac.md) (Local Guide, karma), [moderation.md](../../workflow/moderation.md), [api.md](../../api/api.md) §17, [engagement.md](../engagement.md) (P9 Community, P10 Profile).*
