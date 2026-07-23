# Module 1 — Place (Địa điểm)

> **Product Spec** — thiết kế sản phẩm, không phải giao diện. Place là **thực thể lõi** của PhuQuocHub, ánh xạ trực tiếp hai trụ cột *Wikipedia* (trang tri thức có phiên bản) và *Google Maps* (mọi thứ trên bản đồ). Hotel/Restaurant/Tour là **Place chuyên biệt** kế thừa module này.

---

## 1. Mục tiêu

- Cung cấp một **trang tri thức chuẩn hóa, đáng tin** cho mỗi địa điểm ở Phú Quốc: bãi biển, di tích, quán, khách sạn, tour, đặc sản, khu vực.
- Là **nguồn dữ liệu địa lý hạng nhất** — mọi địa điểm có tọa độ, hiển thị & tìm được trên bản đồ.
- Bảo đảm **tính chính xác qua thời gian** bằng: phiên bản (versioning), nguồn (provenance), xác minh (verification), kiểm duyệt (moderation).
- Là **hub trung tâm** mà Review, Community, Business, Event, Search, AI cùng tham chiếu.

**Giá trị cốt lõi:** *"Muốn biết bất cứ điều gì về một nơi ở Phú Quốc — mở trang Place của nơi đó."*

## 2. Người sử dụng

| Vai trò | Cách dùng module Place |
|---|---|
| **Guest** | Xem trang địa điểm công khai, bản đồ, ảnh, giá; không đóng góp. |
| **Member** | Đề xuất tạo địa điểm mới, đề xuất sửa (qua revision chờ duyệt), báo sai, upload ảnh. |
| **Local Guide** | Đóng góp được tin cậy nhanh (auto-publish nội dung cơ bản), bỏ phiếu xác minh (`Verification.Vote`). |
| **Contributor** | Biên tập rộng nội dung Place qua `WikiRevision` (`Place.Edit.Any`); thay đổi nhạy cảm vẫn chờ duyệt. |
| **Business Owner / Manager** | Sửa thông tin cơ sở đã claim (scope `Managed`): giờ, liên hệ, giá, ảnh. |
| **Moderator** | Duyệt/công khai/lưu trữ, gộp trùng, khôi phục phiên bản, xác minh (`Official`). |
| **Administrator** | Quản trị danh mục (`Category.Manage`), xử lý tranh chấp, cấu hình. |
| **AI Agent** | Sinh tóm tắt/FAQ/dịch dạng **nháp `pending`**; gợi ý địa điểm mới từ tín hiệu 0-kết-quả. |

## 3. Tính năng chính

1. **Trang chi tiết địa điểm** — tên, danh mục, mô tả, địa chỉ/phường, giờ mở cửa, liên hệ, giá, gallery ảnh/video, FAQ.
2. **Bản đồ & định vị** — tọa độ PostGIS, chỉ đường, "gần tôi", tìm trong bán kính/khu vực (bbox), gom cụm.
3. **Danh mục (Category)** — phân loại địa điểm (bãi biển, ẩm thực, lưu trú, tour, di tích, sự kiện…).
4. **Phiên bản & lịch sử (Wiki)** — mỗi thay đổi tạo `wiki_revision`; xem diff, khôi phục.
5. **Nguồn & xác minh (Trust)** — gắn nguồn cho dữ liệu; badge `community` / `verified` / `official`; bỏ phiếu xác minh cộng đồng.
6. **Đóng góp & kiểm duyệt** — đề xuất tạo/sửa vào hàng chờ; báo sai; báo đóng cửa; hàng chờ cho Moderator.
7. **Chỉ số hiển thị (cache)** — `rating_avg`, `rating_count`, `view_count` denormalize để đọc nhanh.
8. **SEO & AI** — meta/JSON-LD (`TouristAttraction`/`LocalBusiness`), khối AI summary (có nhãn, đã duyệt).
9. **Gộp trùng (Merge)** — hợp nhất địa điểm trùng lặp, giữ lịch sử.

## 4. Use case

| UC | Tên | Actor | Mô tả ngắn |
|---|---|---|---|
| UC-P1 | Xem địa điểm | Guest/Member | Mở trang theo `slug`, đọc thông tin + bản đồ + review. |
| UC-P2 | Tìm địa điểm gần tôi | Guest/Member | Cấp định vị → danh sách/bản đồ địa điểm trong bán kính. |
| UC-P3 | Đề xuất địa điểm mới | Member+ | Tạo Place (`draft/pending`) → hàng chờ kiểm duyệt ([WF-06/19](../../workflow/contribution.md)). |
| UC-P4 | Đề xuất sửa thông tin | Member/Contributor | Sửa trường → tạo `WikiRevision` → duyệt ([WF-06](../../workflow/contribution.md)). |
| UC-P5 | Báo sai / báo đóng cửa | Member+ | Gửi report/tín hiệu đóng cửa ([WF-10/15](../../workflow/contribution.md)). |
| UC-P6 | Chủ cơ sở cập nhật thông tin | Biz Owner/Manager | Sửa giờ/liên hệ/giá/ảnh trong scope Managed. |
| UC-P7 | Kiểm duyệt đóng góp | Moderator | Duyệt/từ chối revision, công khai/lưu trữ ([WF-07/14](../../workflow/workflow.md)). |
| UC-P8 | Xác minh địa điểm | Local Guide (vote) / Moderator (verify) | Đặt trạng thái `verified/official`. |
| UC-P9 | Gộp địa điểm trùng | Moderator | `Place.Merge` — hợp nhất 2 bản ghi. |
| UC-P10 | Xem lịch sử & khôi phục | Contributor/Moderator | Xem revisions, `Revision.Revert`. |
| UC-P11 | Sinh tóm tắt AI | AI Agent | Tạo `place_ai_summary` `pending` → chờ duyệt ([WF-08/09](../../workflow/moderation.md)). |

## 5. Luồng người dùng

**Luồng đọc (happy path):**
```
Tìm/duyệt → mở Place theo slug → xem thông tin + bản đồ + ảnh + review
   → (Lưu / Chỉ đường / Chia sẻ)
   → cuộn xuống: giá · FAQ · AI summary (đã duyệt) · review · địa điểm gần đây
```

**Luồng đóng góp tạo mới (UC-P3):**
```
Member bấm "Đóng góp địa điểm" → nhập tên, danh mục, tọa độ (chọn trên bản đồ), mô tả
   → hệ thống kiểm tra: slug, tọa độ thuộc Phú Quốc, category tồn tại, phát hiện trùng (nearby)
   → lưu status=pending, gắn source=user_contribution, tạo revision đầu
   → vào hàng chờ Moderator → duyệt → published → thông báo người đóng góp (WF-20)
```

**Luồng đề xuất sửa (UC-P4):**
```
Người dùng sửa trường → tạo WikiRevision(origin=user, status=pending)
   → nếu trường KHÔNG nhạy cảm & người dùng đủ tin cậy (Local Guide/Contributor) → auto-publish
   → nếu trường NHẠY CẢM (tên/tọa độ/danh mục/gộp) → luôn chờ Moderator
   → duyệt → cập nhật places + đóng revision → làm mới cache & search index
```

**Rẽ nhánh 0 kết quả / báo sai:** báo sai → report; báo đóng cửa → tín hiệu → Moderator xác nhận → `status=archived` hoặc gắn cờ "tạm đóng".

## 6. Điều kiện nghiệp vụ (Business Rules)

- **BR-P1 — Trạng thái hợp lệ:** chỉ chuyển theo máy trạng thái `draft → pending → published → archived` (và `archived → published` khi Restore). Chuyển sai bị từ chối ([WF-14](../../workflow/workflow.md)).
- **BR-P2 — Điều kiện công khai:** một Place chỉ `published` khi có tối thiểu: tên, danh mục, tọa độ hợp lệ, và ≥1 nguồn.
- **BR-P3 — Thay đổi nhạy cảm luôn chờ duyệt:** đổi `name`, `location`, `category_id`, gộp/xóa → bắt buộc Moderator, bất kể vai trò người sửa.
- **BR-P4 — Provenance bắt buộc:** mọi thay đổi nội dung gắn `source` (user/business_owner/ai/osm…) và tạo revision.
- **BR-P5 — Scope chỉnh sửa:** Business Owner/Manager chỉ sửa Place đã claim (scope `Managed`); Contributor sửa bất kỳ nhưng qua revision.
- **BR-P6 — Xác minh phân quyền:** AI/Business Owner **không** tự đặt `Official`; chỉ Moderator+ (`Verification.Verify`) hoặc kết quả bỏ phiếu cộng đồng đủ ngưỡng.
- **BR-P7 — Chống trùng:** khi tạo mới, hệ thống cảnh báo nếu có địa điểm cùng loại trong bán kính nhỏ + tên tương tự; trùng thực → dùng Merge thay vì tạo mới.
- **BR-P8 — AI human-in-the-loop:** nội dung AI (summary/FAQ) luôn `pending`, không hiển thị công khai cho tới khi duyệt.
- **BR-P9 — Soft delete:** không xóa cứng; dùng `archived` + `deleted_at`, giữ lịch sử để khôi phục/audit.

## 7. Quy tắc dữ liệu (Data Rules)

> **Schema authoritative = [places.md §3](../../data/modules/places.md)** (SSOT — ADR-001). Mục này chỉ nêu **quy tắc nghiệp vụ về dữ liệu**, **không định nghĩa lại** trường/kiểu; nếu lệch, places.md §3 thắng.

- **Thực thể chính:** `places` + phụ trợ `media` (exclusive arc), `price_history` (polymorphic), `place_faqs`, `place_seo`, `place_ai_summary`, `wiki_revisions` — chi tiết [places.md](../../data/modules/places.md).
- **Định danh:** `id` UUID; `slug` UNIQUE (auto từ tên + hậu tố nếu trùng); đổi tên **không** đổi slug tự động (giữ URL bền, có redirect nếu cần).
- **Địa lý:** `location` là `GEOGRAPHY(Point,4326)`; tọa độ phải nằm trong **bao Phú Quốc** (validation biên); index GIST cho truy vấn không gian.
- **Giờ mở cửa:** `opening_hours` JSONB (regular/exceptions/is_24h); "đang mở" suy theo timezone `Asia/Ho_Chi_Minh`.
- **Giá:** `price_history` (polymorphic, nhiều khoản giá, append-only) + `price_range` (enum `free/low/mid/high`) để lọc nhanh.
- **Chỉ số cache:** `rating_avg`, `rating_count`, `view_count` là **denormalized** — được cập nhật bởi Review (rating) và Analytics (view), không nhập tay.
- **Phiên bản:** mỗi lần đổi nội dung chính lưu `wiki_revision` (snapshot + change_note + editor + origin + status).
- **Media:** chỉ lưu URL (object storage), không lưu nhị phân trong DB; ảnh có `status` kiểm duyệt.
- **Toàn vẹn:** `category_id` FK bắt buộc; `cover_image_id` phải trỏ ảnh thuộc cùng place & đã `published`.

## 8. Quan hệ với module khác

| Module | Quan hệ |
|---|---|
| **Hotel / Restaurant / Tour** | Là Place chuyên biệt (`category=hotel/restaurant/tour`) + bảng mở rộng riêng; kế thừa toàn bộ mô hình Place. |
| **Event** | `events.place_id` — sự kiện gắn địa điểm/nhà tổ chức. |
| **Review** | Review gắn `place_id`; cập nhật `rating_avg`/`rating_count` của Place. |
| **Community** | Bài viết có thể gắn `place_id` (thảo luận theo địa điểm). |
| **Business** | Claim biến Place thành cơ sở được quản lý (scope Managed); mở dashboard số liệu. |
| **Search** | Index Place (FTS unaccent + geo) để tìm & lọc; 0-kết-quả → gợi ý tạo Place. |
| **AI Assistant** | Sinh `place_ai_summary`, FAQ, bản dịch (pending); phát hiện spam ảnh. |
| **Analytics** | `place_views_agg` cấp view/unique cho dashboard & `popular_places`. |
| **Source / Verification** | Provenance + trạng thái xác minh gắn theo trường/phiên bản. |

## 9. KPI của module

| Nhóm | KPI | Định nghĩa / Mục tiêu |
|---|---|---|
| **Độ phủ** | Số Place `published` | Tổng địa điểm công khai; mục tiêu tăng đều theo giai đoạn (roadmap). |
| Độ phủ | % Place có tọa độ chính xác | Tỷ lệ có `location` hợp lệ trong bao Phú Quốc — mục tiêu ≥ 98%. |
| **Độ đầy đủ** | Điểm hoàn thiện hồ sơ (completeness) | % trường quan trọng đã điền (mô tả, giờ, ≥3 ảnh, giá, danh mục) — mục tiêu trung vị ≥ 70%. |
| **Chất lượng/Tin cậy** | % Place `verified`/`official` | Tỷ lệ đã xác minh trên tổng — chỉ số niềm tin. |
| Chất lượng | % Place có ≥1 nguồn (provenance) | Mục tiêu 100% cho `published`. |
| **Đóng góp** | Số revision/tuần & tỷ lệ duyệt | Sức sống biên tập + tỷ lệ đóng góp được chấp nhận. |
| Đóng góp | Thời gian duyệt trung vị (pending → published) | Mục tiêu < 24h. |
| **Tương tác** | Lượt xem/địa điểm (view_count) | Đầu vào cho `popular_places`. |
| **Độ tươi** | % Place cập nhật trong 90 ngày | Chống dữ liệu lỗi thời; báo đóng cửa được xử lý kịp. |
| **Chất lượng dữ liệu** | Tỷ lệ báo sai được xử lý & số Place bị gộp trùng | Đo hiệu quả làm sạch dữ liệu. |

---

*Tài liệu liên quan: [places.md](../../data/modules/places.md), [source.md](../../data/modules/source.md), [verification.md](../../data/modules/verification.md), [workflow.md](../../workflow/workflow.md), [contribution.md](../../workflow/contribution.md), [rbac.md](../../security/rbac.md), [api.md](../../api/api.md) §11, [discovery.md](../discovery.md) (P2). Module con: [hotel.md](hotel.md), [restaurant.md](restaurant.md), [tour.md](tour.md).*
