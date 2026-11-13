# PhuQuocHub — Thiết kế Entity `Affiliate` (Tiếp thị liên kết)

> Thiết kế **dữ liệu** cho lớp Affiliate: danh mục đối tác affiliate, link gắn vào Place, và log click nội bộ. Chốt ở [ADR-023](../../99-decisions/ADR-023-affiliate-link-model.md). Lớp chiến lược/sản phẩm: [monetization.md](../../product/monetization.md). **Trạng thái: schema đã chốt (2026-11-13) — chưa triển khai** (chưa có migration/entity TypeORM).

## 1. Nguyên tắc & phạm vi

- **Tách biệt hoàn toàn** khỏi dữ liệu cộng đồng: không FK từ `places`/`price_history`/`contacts` vào affiliate; xoá/tắt một affiliate link không ảnh hưởng gì tới Place nó gắn vào.
- **Chỉ Administrator** tạo/sửa/xoá (`AffiliateLink.Manage`, [rbac.md §3.3](../../security/rbac.md)) — không cấp cho Business Owner/Manager ở giai đoạn này ([monetization.md §12](../../product/monetization.md)).
- **Không ảnh hưởng thứ hạng/tìm kiếm** — một Place không có affiliate link vẫn hiển thị bình đẳng (nguyên tắc *"không bán thứ hạng"*, [growth.md §14](../../product/growth.md)).
- Click log **ẩn danh hoá** (hash IP) — phục vụ đo CTR nội bộ, không phục vụ nhận diện cá nhân.

## 2. Bảng `affiliate_partners` — Danh mục đối tác

| Cột | Kiểu | Null | Mô tả |
|---|---|---|---|
| `id` | UUID (PK) | ✗ | |
| `name` | VARCHAR(100) | ✗ | Tên hiển thị, vd "Booking.com" |
| `network_key` | VARCHAR(50) (UNIQUE) | ✗ | Mã định danh ngắn, vd `booking_com`, `agoda`, `klook_tours` |
| `category` | ENUM | ✗ | `hotel, tour, transport, car_rental, insurance, esim, flight, gear` ([monetization.md §3](../../product/monetization.md)) |
| `status` | ENUM | ✗ | `pending` (đang đăng ký) · `active` · `inactive` (tạm ngưng) |
| `terms_url` | TEXT | ✓ | Link điều khoản/chính sách hoa hồng |
| `notes` | TEXT | ✓ | Ghi chú nội bộ (hoa hồng %, cookie, phương thức thanh toán) — **không riêng tư**, chỉ mô tả điều khoản công khai |
| `created_at` / `updated_at` | TIMESTAMPTZ | ✗ | |

```sql
CREATE UNIQUE INDEX uq_affiliate_partner_key ON affiliate_partners(network_key);
```

## 3. Bảng `affiliate_links` — Link gắn vào Place

| Cột | Kiểu | Null | Mô tả |
|---|---|---|---|
| `id` | UUID (PK) | ✗ | |
| `place_id` | UUID (FK → places) | ✗ | Place/Hotel/Tour link này gắn vào |
| `partner_id` | UUID (FK → affiliate_partners) | ✗ | |
| `target_url` | TEXT | ✗ | URL affiliate đầy đủ (kèm tracking param của network) |
| `label` | VARCHAR(150) | ✓ | Nhãn CTA tuỳ biến, vd "Xem giá trên Booking.com"; null → UI dùng nhãn mặc định theo `partner.name` |
| `is_active` | BOOLEAN | ✗ | Default `true`; tắt thay vì xoá cứng để giữ lịch sử click |
| `created_by` | UUID (FK → users) | ✗ | Administrator tạo link (audited) |
| `created_at` / `updated_at` | TIMESTAMPTZ | ✗ | |

```sql
CREATE INDEX idx_affiliate_link_place ON affiliate_links(place_id) WHERE is_active;
CREATE INDEX idx_affiliate_link_partner ON affiliate_links(partner_id);
```

> Một Place có thể có **nhiều** affiliate link (nhiều partner, hoặc nhiều CTA cho cùng partner) — không giới hạn 1:1. Trang hiển thị chọn link theo `category` của partner khớp loại Place (Hotel → partner `category=hotel`…, theo bảng mapping [monetization.md §4](../../product/monetization.md)).

## 4. Bảng `affiliate_link_clicks` — Log click nội bộ

| Cột | Kiểu | Null | Mô tả |
|---|---|---|---|
| `id` | UUID (PK) | ✗ | |
| `affiliate_link_id` | UUID (FK → affiliate_links) | ✗ | |
| `clicked_at` | TIMESTAMPTZ | ✗ | Default `now()` |
| `ip_hash` | VARCHAR(64) | ✓ | SHA-256 hash của IP — **không lưu IP thô** |
| `user_agent` | VARCHAR(300) | ✓ | |
| `locale` | VARCHAR(10) | ✓ | Ngôn ngữ trang lúc click (`vi`/`en`) — phục vụ KPI "tỷ lệ traffic quốc tế" ([monetization.md §10](../../product/monetization.md)) |

```sql
CREATE INDEX idx_affiliate_click_link ON affiliate_link_clicks(affiliate_link_id, clicked_at);
```

> Sinh bởi endpoint redirect nội bộ `GET /go/:linkId` (ngoài prefix `/api` vì là redirect trình duyệt trực tiếp, không phải JSON API) — ghi 1 dòng rồi `302` sang `target_url`. Xem [api.md §25](../../api/api.md).

## 5. Liên kết với các entity khác

- **Places:** `affiliate_links.place_id → places.id`; **không** ngược lại — `places` không biết gì về affiliate (giữ entity lõi sạch, [ADR-001](../../99-decisions/ADR-001-place-is-core.md)).
- **Users:** `affiliate_links.created_by → users.id` — chỉ ghi nhận ai tạo (audited), không dùng để phân quyền (phân quyền qua `AffiliateLink.Manage`, không theo scope Managed).
- **Price/Contact:** **không liên kết** — dữ liệu cộng đồng (giá, liên hệ) giữ nguyên ý nghĩa tri thức, hoàn toàn tách khỏi affiliate (BR-AF3, §6).

## 6. Quy tắc nghiệp vụ (Business Rules)

- **BR-AF1 — Chỉ Administrator quản lý:** tạo/sửa/xoá `affiliate_partners`/`affiliate_links` yêu cầu `AffiliateLink.Manage` (toàn cục, không scope Managed). Business Owner/Manager **không** có quyền này ở giai đoạn này.
- **BR-AF2 — Place phải đang hoạt động:** không tạo mới affiliate link cho Place đã `archived`; job định kỳ (nối [data-collection.md](../../architecture/data-collection.md)) cảnh báo khi Place gắn link chuyển sang `archived` sau đó, để Administrator tắt link thủ công.
- **BR-AF3 — Tách biệt dữ liệu cộng đồng:** affiliate không ghi đè, không tham chiếu `price_history`/`contacts`; hiển thị ở UI component riêng (`AffiliateBox`), không trộn vào mô tả/review.
- **BR-AF4 — Không lưu PII thô:** `affiliate_link_clicks.ip_hash` luôn là hash, không bao giờ lưu IP nguyên văn.
- **BR-AF5 — Không ảnh hưởng xếp hạng:** Place không có affiliate link hiển thị bình đẳng trong tìm kiếm/bản đồ (nối BR Business Reward, [growth.md §14](../../product/growth.md)).

## 7. Truy vấn mẫu

```sql
-- Affiliate link đang active của một Place (để render AffiliateBox)
SELECT al.*, ap.name AS partner_name, ap.category
FROM affiliate_links al
JOIN affiliate_partners ap ON ap.id = al.partner_id
WHERE al.place_id = :place_id AND al.is_active AND ap.status = 'active';

-- CTR nội bộ theo link (đối chiếu dashboard network)
SELECT affiliate_link_id, count(*) AS clicks
FROM affiliate_link_clicks
WHERE clicked_at >= :from
GROUP BY affiliate_link_id;
```

## 8. Quyết định — đã chốt & còn mở

**Đã chốt (2026-11-13, [ADR-023](../../99-decisions/ADR-023-affiliate-link-model.md)):**
1. 3 bảng độc lập, không FK ngược từ entity lõi.
2. Chỉ Administrator quản lý (`AffiliateLink.Manage`, không scope Managed).
3. Click log ẩn danh hoá IP bằng hash.
4. AI Assistant tích hợp gợi ý affiliate để ở **Giai đoạn 3** ([monetization.md §9](../../product/monetization.md)), không làm ngay ở MVP.

**Còn mở:**
5. Có cho Business Owner tự quản lý affiliate link của chính cơ sở ở giai đoạn sau (khi mô hình tập trung đã chứng minh hiệu quả) — [monetization.md §12](../../product/monetization.md).
6. Chính sách retention/rollup cho `affiliate_link_clicks` khi dữ liệu đủ lớn.
7. Migration/entity TypeORM thật — **chưa bắt đầu**, chờ tới Giai đoạn 1 ([monetization.md §9](../../product/monetization.md)): đăng ký được ≥1 network thật trước.

---

*Tài liệu liên quan: [ADR-023](../../99-decisions/ADR-023-affiliate-link-model.md), [database.md §11](../database.md), [api.md §25](../../api/api.md), [rbac.md §3.3](../../security/rbac.md), [monetization.md](../../product/monetization.md), [growth.md §14](../../product/growth.md)*
