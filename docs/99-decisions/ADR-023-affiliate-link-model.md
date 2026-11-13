# ADR-023 — Mô hình dữ liệu Affiliate Link (Tiếp thị liên kết)

## Status

Accepted (2026-11-13)

## Context

[monetization.md](../product/monetization.md) (proposal) đề xuất kiếm doanh thu cho PhuQuocHub qua tiếp thị liên kết với các chương trình nước ngoài (Booking.com, Agoda, Klook, GetYourGuide, 12Go, SafetyWing…), gắn vào trang [Hotel](../product/modules/hotel.md)/[Tour](../product/modules/tour.md)/[Place](../product/modules/place.md). Tài liệu đó để ngỏ việc có nên thiết kế entity thật hay chưa (§6, §12), vì ảnh hưởng tới `docs/data/` và `api.md` — hai nguồn thẩm quyền không nên sửa khi chưa chốt hướng.

Chủ sản phẩm đã quyết định (2026-11-13): tiến hành thiết kế schema, và **chỉ Administrator** quản lý affiliate link tập trung (không cho Business Owner tự gắn link của chính cơ sở ở giai đoạn này).

## Problem

Cần một mô hình dữ liệu cho affiliate link:
- Tách biệt hoàn toàn khỏi dữ liệu cộng đồng (`price_history`, `contacts`) — không để affiliate ảnh hưởng tới tri thức cộng đồng hay thứ hạng tìm kiếm (nguyên tắc *"không bán thứ hạng"* — [growth.md §14](../product/growth.md)).
- Cho phép đo **CTR nội bộ** (độc lập dashboard network) mà không lưu dữ liệu định danh cá nhân (IP thô).
- Giữ khả năng tắt/xoá một link mà không ảnh hưởng gì tới Place/Hotel/Tour nó gắn vào.

## Decision

Ba bảng mới, độc lập hoàn toàn với các bảng hiện có (không FK ngược từ `places`/`price_history`/`contacts` vào đây):

1. **`affiliate_partners`** — danh mục mạng/đối tác affiliate (Booking.com, Agoda, Klook…).
2. **`affiliate_links`** — một link cụ thể gắn **đúng một** `place_id`, trỏ tới **đúng một** `affiliate_partners`.
3. **`affiliate_link_clicks`** — log click nội bộ (ẩn danh hoá IP bằng hash), phục vụ đo CTR/EPC đối chiếu dashboard network.

Chi tiết cột/kiểu/index: [affiliate.md](../data/modules/affiliate.md). Quyền quản lý: permission mới `AffiliateLink.Manage` (**không** hậu tố scope — toàn cục, chỉ role Administrator trở lên; **không** cấp cho Business Owner/Manager ở giai đoạn này — xem [rbac.md §3.3](../security/rbac.md)).

## Alternatives Considered

- **Thêm cột `affiliate_url` trực tiếp vào `places`/`price_history`:** bị loại — trộn lẫn dữ liệu cộng đồng (price_history do cộng đồng/chủ cơ sở nhập) với link bán hàng; không tắt/xoá được độc lập; không hỗ trợ nhiều partner/place.
- **Cho Business Owner tự quản lý link qua `business_members`:** bị loại ở giai đoạn này — rủi ro lạm dụng (gắn link không minh bạch, cạnh tranh không công bằng giữa cơ sở tự làm affiliate và cơ sở không làm); để ngỏ cho quyết định sau nếu mô hình tập trung chứng minh hiệu quả.
- **Không log click nội bộ, chỉ dựa dashboard network:** bị loại — không đối chiếu được, không phát hiện link hỏng sớm (nối lifecycle dữ liệu [data-collection.md](../architecture/data-collection.md)).

## Consequences

### Positive

- Tách biệt rõ: xoá/tắt affiliate không chạm dữ liệu cộng đồng hay lịch sử giá.
- Đo lường được CTR/EPC nội bộ ngay từ MVP kỹ thuật (Giai đoạn 1 của monetization.md §9).
- Mở rộng dễ: thêm category mới (bảo hiểm, eSIM…) chỉ cần thêm dòng `affiliate_partners`, không đổi schema.

### Negative

- Thêm 3 bảng, 1 permission mới, 1 endpoint redirect ngoài `/api` (`GET /go/:linkId`) — tăng diện tích bảo trì cho một tính năng mới hoàn toàn chưa có dữ liệu doanh thu thật.
- `affiliate_link_clicks` sẽ tăng nhanh theo traffic — cần chính sách retention/rollup sau (chưa thiết kế ở ADR này, xem Notes).

## Related Documents

[database.md §11](../data/database.md), [affiliate.md](../data/modules/affiliate.md), [api.md §25](../api/api.md), [rbac.md §3.3](../security/rbac.md), [monetization.md](../product/monetization.md)

## Related ADR

Không supersede/mở rộng ADR nào trực tiếp; độc lập với mô hình Business ([ADR-015](ADR-015-business-ownership-model.md)) theo thiết kế (§Decision).

## Notes

- Chính sách retention/rollup cho `affiliate_link_clicks` (vd gộp theo ngày sau N tháng) — **chưa quyết định**, để khi có dữ liệu thật đủ lớn.
- Có cho Business Owner tự quản lý affiliate link của chính cơ sở ở giai đoạn sau — **mở**, xem [monetization.md §12](../product/monetization.md).
- Việc triển khai thật (migration, entity TypeORM, endpoint) **chưa bắt đầu** — ADR này chỉ chốt mô hình dữ liệu để Giai đoạn 1 ([monetization.md §9](../product/monetization.md)) có thể bắt tay ngay khi tới lượt.
